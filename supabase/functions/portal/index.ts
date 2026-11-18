// JamzieBites: portal (Supabase Edge Function "portal")
//
// Lets a client, identified ONLY by their private request token, use the
// message thread on request.html:
//   { token, action: "thread" }                    -> messages + short-lived file links
//   { token, action: "upload", name, type, size }  -> a one-time upload link for ONE file
//   { token, action: "send", body, files: [path] } -> post a message (with uploaded files)
// Files live in the private "portal" bucket under requests/<request id>/...
// A client can only ever see or attach files from their own request.
// Deploy with "Verify JWT" OFF (clients aren't logged in; the token is the key).
import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
function serviceKey() {
  const legacy = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (legacy) return legacy;
  try { const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); return String(Object.values(keys)[0] ?? ""); } catch { return ""; }
}
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey(), { auth: { persistSession: false } });
const BUCKET = "portal";
const SITE = "https://jamziebites.com";
const ORIGINS = new Set([SITE, "https://www.jamziebites.com", "http://localhost:8790"]);
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "application/zip", "application/x-zip-compressed"]);
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_CLIENT_FILES = 60;   // per request, total
const MAX_MSGS_PER_HOUR = 30;  // per request

function headers(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : SITE,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
const safeName = (n: string) =>
  (n.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.\-]+/, "").slice(-80)) || "file";

Deno.serve(async (req) => {
  const h = headers(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const reply = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: h });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = JSON.parse((await req.text()).slice(0, 20000)); } catch { return reply({ error: "Bad request." }, 400); }
  const token = typeof body?.token === "string" && /^[0-9a-f]{36}$/.test(body.token) ? body.token : null;
  if (!token) return reply({ error: "That link doesn't look right." }, 400);

  try {
    const [r] = await sql`select id, code, status from public.requests where token = ${token}::text`;
    if (!r) return reply({ error: "We couldn't find that request." }, 404);
    const closed = r.status === "declined" || r.status === "cancelled";
    const prefix = `requests/${r.id}/`;

    // ---------- Read the thread ----------
    if (body.action === "thread") {
      const msgs = await sql`select id, created_at, sender, body, files from public.messages
                              where request_id = ${r.id}::uuid order by created_at asc limit 500`;
      // deno-lint-ignore no-explicit-any
      const paths = msgs.flatMap((m: any) => (m.files ?? []).map((f: any) => String(f.path)))
        .filter((p: string) => p.startsWith(prefix));
      const urls: Record<string, string> = {};
      if (paths.length) {
        const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600);
        for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
      }
      return reply({
        closed,
        // deno-lint-ignore no-explicit-any
        messages: msgs.map((m: any) => ({
          id: Number(m.id), at: m.created_at, from: m.sender, body: m.body ?? "",
          // deno-lint-ignore no-explicit-any
          files: (m.files ?? []).filter((f: any) => String(f.path).startsWith(prefix))
            // deno-lint-ignore no-explicit-any
            .map((f: any) => ({ name: f.name, size: f.size, type: f.type, url: urls[f.path] ?? null })),
        })),
      });
    }

    if (closed) return reply({ error: "This request is closed, so messages are turned off." }, 409);

    // ---------- Get a one-time upload link ----------
    if (body.action === "upload") {
      const type = String(body.type ?? "");
      const size = Number(body.size ?? 0);
      if (!TYPES.has(type)) return reply({ error: "That file type isn't supported. Use PNG, JPG, WEBP, GIF, PDF or ZIP." }, 400);
      if (!(size > 0 && size <= MAX_SIZE)) return reply({ error: "Files can be up to 25 MB each." }, 400);
      const [{ n }] = await sql`select count(*)::int as n from storage.objects
                                 where bucket_id = ${BUCKET}::text and name like ${prefix + "client/%"}::text`;
      if (n >= MAX_CLIENT_FILES) return reply({ error: "This request has reached its file limit. Message Jamzie if you need to send more." }, 409);
      const path = `${prefix}client/${crypto.randomUUID()}-${safeName(String(body.name ?? "file"))}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error("upload link: " + (error?.message ?? "unknown"));
      return reply({ path, url: data.signedUrl });
    }

    // ---------- Post a message ----------
    if (body.action === "send") {
      const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
      const wanted: string[] = Array.isArray(body.files) ? body.files.filter((p: unknown) => typeof p === "string").slice(0, 10) : [];
      if (wanted.some((p) => !p.startsWith(prefix + "client/"))) return reply({ error: "Bad file." }, 400);
      const [{ n }] = await sql`select count(*)::int as n from public.messages
                                 where request_id = ${r.id}::uuid and sender = 'client' and created_at > now() - interval '1 hour'`;
      if (n >= MAX_MSGS_PER_HOUR) return reply({ error: "You've sent a lot of messages. Please wait a bit." }, 429);
      let files: unknown[] = [];
      if (wanted.length) {
        const objs = await sql`select name, metadata from storage.objects
                                where bucket_id = ${BUCKET}::text and name = any(${wanted}::text[])`;
        // deno-lint-ignore no-explicit-any
        files = objs.map((o: any) => ({
          path: o.name,
          name: String(o.name).split("/").pop()!.replace(/^[0-9a-f-]{36}-/, ""),
          size: Number(o.metadata?.size ?? 0),
          type: String(o.metadata?.mimetype ?? ""),
        }));
      }
      if (!text && !files.length) return reply({ error: "Write a message or attach a file." }, 400);
      await sql`insert into public.messages (request_id, sender, body, files)
                values (${r.id}::uuid, 'client', ${text || null}::text, ${JSON.stringify(files)}::text::jsonb)`;
      return reply({ ok: true });
    }

    return reply({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("portal failed:", e instanceof Error ? e.message : e);
    return reply({ error: "Something went wrong. Please try again in a moment." }, 500);
  }
});
