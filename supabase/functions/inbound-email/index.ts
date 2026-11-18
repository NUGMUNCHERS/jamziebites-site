// JamzieBites: inbound-email (Supabase Edge Function "inbound-email")
//
// Resend calls this (webhook "email.received") whenever someone emails any
// address @jamziebites.com. The webhook only carries an email ID: the email
// itself is fetched from Resend's API with our own key (secret RESEND_RECEIVE_KEY,
// a FULL-ACCESS key), so a forged webhook can't inject anything. Each email is
// handled once.
//   reply-<request token>@jamziebites.com  -> posted to that request's message
//       thread as the client (text + attached pictures/PDFs/zips), which DMs
//       Jamzie on Discord with a Reply button.
//   anything else (hello@...)              -> Jamzie gets a short Discord heads-up;
//       the email stays readable in Resend -> Inboxes.
// Deploy with "Verify JWT" OFF.
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
function serviceKey() {
  const legacy = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (legacy) return legacy;
  try { const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return String(Object.values(keys)[0] ?? ""); } catch { return ""; }
}
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey(), { auth: { persistSession: false } });
const KEY = (Deno.env.get("RESEND_RECEIVE_KEY") ?? "").trim();
const BUCKET = "portal";
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "application/zip", "application/x-zip-compressed"]);
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_CLIENT_FILES = 60;   // per request, total (same as the website)
const MAX_MSGS_PER_HOUR = 30;  // per request (same as the website)

const ok = (b: unknown) => Response.json(b);
const safeName = (n: string) =>
  (n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.\-]+/, "").slice(-80)) || "file";

async function resend(path: string) {
  const res = await fetch("https://api.resend.com" + path, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Resend ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

const addr = (s: unknown) => {
  const m = String(s ?? "").match(/<([^>]+)>/);
  return (m ? m[1] : String(s ?? "")).trim().toLowerCase();
};

function htmlToText(h: string) {
  return h
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*$/i, "")              // quoted history (Gmail, Apple Mail)
    .replace(/<div class="gmail_quote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

// Keep only what the client actually typed: drop the quoted email underneath.
function stripQuoted(t: string) {
  const s = t.replace(/\r\n?/g, "\n");
  const cuts = [
    /\n[^\n]*\bOn [^\n]*(\n[^\n]*)?\bwrote:\s*\n/,               // "On Tue, ... Jamzie <...> wrote:"
    /\n-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i,
    /\n_{5,}\s*\n/,                                              // Outlook separator
    /\nFrom: [^\n]+\n(Sent|Date): /i,
    /\nSent from my (iPhone|iPad|Android|Galaxy)[^\n]*/i,
    /\n\s*>[^\n]*(\n\s*>[^\n]*)*\s*$/,                           // trailing "> quoted" lines
  ];
  let end = s.length;
  for (const re of cuts) { const m = ("\n" + s).match(re); if (m && m.index !== undefined) end = Math.min(end, Math.max(0, m.index - 1)); }
  return s.slice(0, end).replace(/\n{3,}/g, "\n\n").trim();
}

function isAutomated(from: string, subject: string, headers: unknown) {
  if (/(^|[._+-])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?|notifications?)@/i.test(from)) return true;
  if (/^(auto(matic)? ?reply|out of (the )?office|undeliverable|delivery status notification)/i.test(subject.trim())) return true;
  const h = JSON.stringify(headers ?? "").toLowerCase();
  return /"auto-submitted"\s*[:,]\s*"auto-/.test(h) || /"x-autoreply"/.test(h) || /"precedence"\s*[:,]\s*"(bulk|junk|auto_reply)"/.test(h);
}

async function ownerAlert(text: string, requestId: string | null) {
  await sql`select public.owner_alert(${text.slice(0, 1800)}::text, ${requestId}::uuid)`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  // deno-lint-ignore no-explicit-any
  let evt: any;
  try { evt = JSON.parse((await req.text()).slice(0, 100000)); } catch { return new Response("bad request", { status: 400 }); }
  if (evt?.type !== "email.received") return ok({ ignored: "not an email.received event" });
  const emailId = String(evt?.data?.email_id ?? "");
  if (!/^[0-9a-f-]{20,64}$/i.test(emailId)) return new Response("bad email id", { status: 400 });
  if (!KEY) return new Response("RESEND_RECEIVE_KEY not set", { status: 503 }); // Resend retries later

  // Fetch the real email from Resend (never trust the webhook body).
  let e;
  try { e = await resend(`/emails/receiving/${emailId}`); }
  catch (err) { return new Response(String(err), { status: 502 }); }  // Resend retries later

  // Once per email.
  const [claimed] = await sql`insert into public.inbound_emails (email_id) values (${emailId}::text) on conflict do nothing returning email_id`;
  if (!claimed) return ok({ duplicate: true });
  const done = async (outcome: string, requestId: string | null = null) => {
    await sql`update public.inbound_emails set outcome = ${outcome.slice(0, 300)}::text, request_id = ${requestId}::uuid where email_id = ${emailId}::text`;
    return ok({ outcome });
  };

  try {
    const from = addr(e.from);
    const subject = String(e.subject ?? "");
    const rcpts: string[] = [...(e.to ?? []), ...(e.cc ?? []), ...(e.received_for ?? [])].map(addr);
    const tokenAddr = rcpts.map((a) => a.match(/^reply-([0-9a-f]{36})@jamziebites\.com$/)).find(Boolean);

    if (isAutomated(from, subject, e.headers)) {
      return await done(`ignored automated email from ${from}`);
    }

    if (!tokenAddr) {
      // General mail (hello@ etc.): a short heads-up for Jamzie, no content.
      await ownerAlert(`📧 **New email** to ${rcpts.find((a) => a.endsWith("@jamziebites.com")) ?? "jamziebites.com"} from ${from}` +
        (subject ? `: "${subject.slice(0, 150)}"` : "") + `\nRead it at resend.com → Inboxes.`, null);
      return await done(`general email from ${from}`);
    }

    const [r] = await sql`select id, code, name, status from public.requests where token = ${tokenAddr[1]}::text`;
    if (!r) return await done(`no request for that reply address (from ${from})`);
    if (r.status === "declined" || r.status === "cancelled") return await done(`request is ${r.status}`, r.id);
    const [{ n }] = await sql`select count(*)::int as n from public.messages
                               where request_id = ${r.id}::uuid and sender = 'client' and created_at > now() - interval '1 hour'`;
    if (n >= MAX_MSGS_PER_HOUR) return await done("too many messages this hour", r.id);

    const raw = typeof e.text === "string" && e.text.trim() ? e.text : htmlToText(String(e.html ?? ""));
    let body = stripQuoted(raw);
    if (body.length > 4000) body = body.slice(0, 3990) + "…";

    // Attachments: pictures / PDFs / zips (skip tiny inline images like signature logos).
    // deno-lint-ignore no-explicit-any
    const files: any[] = [];
    const skipped: string[] = [];
    const listed = Array.isArray(e.attachments) && e.attachments.length ? await resend(`/emails/receiving/${emailId}/attachments`) : { data: [] };
    const [{ have }] = await sql`select count(*)::int as have from storage.objects
                                  where bucket_id = ${BUCKET}::text and name like ${`requests/${r.id}/client/%`}::text`;
    for (const a of listed.data ?? []) {
      const type = String(a.content_type ?? "").toLowerCase().split(";")[0];
      const size = Number(a.size ?? 0);
      const name = String(a.filename ?? "file");
      if (a.content_disposition === "inline" && size < 30 * 1024) continue;
      if (!TYPES.has(type) || size > MAX_SIZE) { skipped.push(name); continue; }
      if (files.length >= MAX_FILES || have + files.length >= MAX_CLIENT_FILES) { skipped.push(name); continue; }
      const dl = await fetch(String(a.download_url));
      if (!dl.ok) { skipped.push(name); continue; }
      const bytes = new Uint8Array(await dl.arrayBuffer());
      if (bytes.byteLength > MAX_SIZE) { skipped.push(name); continue; }
      const path = `requests/${r.id}/client/${crypto.randomUUID()}-${safeName(name)}`;
      const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false });
      if (up.error) { skipped.push(name); continue; }
      files.push({ path, name: name.slice(0, 120), size: bytes.byteLength, type });
    }
    if (skipped.length) {
      body = (body ? body + "\n\n" : "") + `(Couldn't attach: ${skipped.slice(0, 5).join(", ")}. Pictures, PDFs and zips up to 25 MB work.)`;
    }
    if (!body && !files.length) return await done("empty reply", r.id);

    await sql`insert into public.messages (request_id, sender, body, files)
              values (${r.id}::uuid, 'client', ${body || null}::text, ${JSON.stringify(files)}::text::jsonb)`;
    return await done(`posted to ${r.code} (${files.length} file${files.length === 1 ? "" : "s"})`, r.id);
  } catch (err) {
    // Let go of it so Resend's automatic retry can try again.
    console.error("inbound-email failed", emailId, err);
    await sql`delete from public.inbound_emails where email_id = ${emailId}::text`.catch(() => {});
    return new Response("error", { status: 500 });
  }
});
