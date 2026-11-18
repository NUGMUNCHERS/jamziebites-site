// JamzieBites: notify (Supabase Edge Function "notify")
//
// Sends the messages queued in public.notifications. The database queues one
// every time a request is received / accepted / paid / started / finished /
// declined, and wakes this function right away (plus a 1-minute retry timer).
//   email   -> via Resend (secret RESEND_API_KEY), from hello@jamziebites.com.
//              Reply-To is reply-<request token>@jamziebites.com, so a client's
//              reply lands in their request's message thread ("inbound-email").
//   discord -> a DM from Jamzie's bot (secrets DISCORD_BOT_TOKEN, DISCORD_GUILD_ID).
//              The client must be in her Discord server; it keeps retrying
//              for 48 hours in case they join late.
// Safe to call by anyone: it only ever sends messages that are already queued,
// and each one exactly once. Deploy with "Verify JWT" OFF.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const RESEND_KEY = env("RESEND_API_KEY");
const FROM = env("NOTIFY_FROM") || "Jamzie from JamzieBites <hello@jamziebites.com>";
const REPLY_DOMAIN = "jamziebites.com";
const BOT = env("DISCORD_BOT_TOKEN");
const GUILD = env("DISCORD_GUILD_ID");
const SITE = "https://jamziebites.com";
const GIVE_UP_MS = 48 * 3600e3;

// deno-lint-ignore no-explicit-any
type Req = any;
const money = (n: unknown) => "$" + Number(n ?? 0).toFixed(2).replace(/\.00$/, "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function message(kind: string, r: Req, said: string[] = []) {
  const link = `${SITE}/request.html?t=${r.token}`;
  const piece = String(r.type) + (r.character_name ? ` of ${r.character_name}` : "");
  const owed = Number(r.price ?? 0) - Number(r.paid_amount ?? 0);
  const M: Record<string, { subject: string; lines: string[]; button: string }> = {
    received: {
      subject: `I got your commission request! (${r.code})`,
      lines: [`Hi ${r.name}! 🍓`,
        `Thank you so much for requesting a ${piece}! It's safely in my inbox and I'll look it over soon.`,
        `If I accept it, you'll get a message with your final price and a link to pay. Please don't send any payment before then.`],
      button: "Check on my request",
    },
    accepted: {
      subject: `Your commission is accepted! (${r.code})`,
      lines: [`Hi ${r.name}! Great news: I've accepted your ${piece}! ✨`,
        `Your final price is ${money(owed)}. Use the button below to pay. The amount is filled in for you, so there's no code to type.`,
        `Your slot is locked in as soon as payment goes through. Thank you so much! ♡`],
      button: `Pay ${money(owed)}`,
    },
    paid: {
      subject: `Payment received, thank you! (${r.code})`,
      lines: [`Hi ${r.name}! I got your payment of ${money(Number(r.paid_amount) > 0 ? r.paid_amount : r.price)} for your ${piece}. Your slot is locked in! 🎉`,
        `You can watch it move from sketch to finished piece on your request page anytime.`],
      button: "Follow my commission",
    },
    started: {
      subject: `I've started on your commission! (${r.code})`,
      lines: [`Hi ${r.name}! Just letting you know I've started working on your ${piece}. 🎨`,
        `Your request page shows which stage it's at.`],
      button: "See progress",
    },
    done: {
      subject: `Your commission is finished! (${r.code})`,
      lines: [`Hi ${r.name}! Your ${piece} is all done! 🎉`,
        `I'll send your final files over (if I haven't already). Thank you so much for commissioning me, it truly means the world. ♡`],
      button: "View my request",
    },
    message: {
      subject: `New message from Jamzie about your commission (${r.code})`,
      lines: said.length
        ? [`Hi ${r.name}! Jamzie sent you a message about your ${piece}: ✨`]
        : [`Hi ${r.name}! Jamzie sent you an update on your ${piece}. It could be a sketch, a work-in-progress, or a quick question. ✨`,
           `Open your request page to see it and reply. You can send pictures back there too.`],
      button: "View message",
    },
    declined: {
      subject: `About your commission request (${r.code})`,
      lines: [`Hi ${r.name}, thank you so much for your interest in a ${piece}.`,
        `Unfortunately I'm not able to take this one on right now. Nothing has been charged.`,
        `I hope we get to work together in the future! ♡`],
      button: "View my request",
    },
  };
  const m = M[kind];
  const quote = kind === "message" ? said : [];
  const quoted = quote.map((q) => q.split("\n").map((l) => "> " + l).join("\n")).join("\n\n");
  return {
    ...m, link, quote,
    text: [m.lines[0], quoted, ...m.lines.slice(1)].filter(Boolean).join("\n\n") +
      `\n\n${m.button}: ${link}\n\nJust reply to this email to answer. Pictures you attach come through too.\n\n— Jamzie (JamzieBites)`,
  };
}

function emailHtml(m: { subject: string; lines: string[]; quote: string[]; button: string; link: string }) {
  const para = (l: string) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(l)}</p>`;
  const quote = m.quote.map((q) =>
    `<div style="border-left:4px solid #ff8fc4;background:#fff5fa;border-radius:12px;padding:12px 16px;margin:0 0 14px;font-size:16px;line-height:1.55;white-space:pre-wrap">${esc(q)}</div>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#fff5fa;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3b2a4a">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<div style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 6px 24px rgba(180,90,140,.15)">
<div style="height:8px;background:linear-gradient(90deg,#ff8fc4,#b79cff,#7fd6ff)"></div>
<div style="padding:28px 26px">
<div style="font-size:22px;font-weight:800;margin-bottom:14px">Jamzie<span style="color:#e0559a">Bites</span> 🍓</div>
${para(m.lines[0])}${quote}${m.lines.slice(1).map(para).join("")}
<p style="margin:22px 0 8px"><a href="${esc(m.link)}" style="display:inline-block;background:#e0559a;color:#ffffff;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:999px">${esc(m.button)}</a></p>
<p style="font-size:16px;line-height:1.55;margin:18px 0 0">— Jamzie ♡</p>
<p style="font-size:12px;color:#8a7a99;margin:18px 0 0">Just reply to this email to answer. Pictures you attach come through too. This link is private to your request, so please don't share it.</p>
</div></div>
<p style="font-size:12px;color:#8a7a99;text-align:center;margin-top:16px">JamzieBites · jamziebites.com</p>
</div></body></html>`;
}

async function sendEmail(id: number, r: Req, m: ReturnType<typeof message>) {
  if (!RESEND_KEY) throw new Retry("Email isn't set up yet (RESEND_API_KEY missing).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `jb-notification-${id}` },
    body: JSON.stringify({ from: FROM, to: [r.email], subject: m.subject, html: emailHtml(m), text: m.text, reply_to: `Jamzie (JamzieBites) <reply-${r.token}@${REPLY_DOMAIN}>` }),
  });
  if (res.ok) return;
  const j = await res.json().catch(() => ({}));
  const why = `Email failed (${res.status}): ${j?.message ?? "unknown error"}`;
  if (res.status === 422 || res.status === 400) throw new GiveUp(why);
  throw new Retry(why);
}

async function discord(path: string, init: RequestInit = {}) {
  const res = await fetch("https://discord.com/api/v10" + path, {
    ...init,
    headers: { Authorization: `Bot ${BOT}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (https://jamziebites.com, 1.0)" },
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, j };
}
async function sendDiscord(r: Req, m: ReturnType<typeof message>, kind: string) {
  if (!BOT || !GUILD) throw new Retry("Discord isn't set up yet (bot token / server ID missing).");
  let uid: string | null = r.discord_id;
  if (!uid) {
    const s = await discord(`/guilds/${GUILD}/members/search?limit=10&query=${encodeURIComponent(r.discord)}`);
    if (!s.ok) throw new Retry(`Couldn't search the Discord server (${s.status}): ${s.j?.message ?? ""}`);
    // deno-lint-ignore no-explicit-any
    const hit = (s.j as any[]).find((mem) => String(mem?.user?.username ?? "").toLowerCase() === r.discord);
    if (!hit) throw new Retry(`@${r.discord} isn't in the Discord server yet (will keep trying for 48h).`);
    uid = String(hit.user.id);
    await sql`update public.requests set discord_id = ${uid}::text where id = ${r.id}::uuid`;
  }
  const ch = await discord("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: uid }) });
  if (!ch.ok) throw new Retry(`Couldn't open a DM (${ch.status}): ${ch.j?.message ?? ""}`);
  const msg = await discord(`/channels/${ch.j.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: [m.lines[0], ...m.quote.map((q) => q.split("\n").map((l) => "> " + l).join("\n")), ...m.lines.slice(1),
        kind === "declined" ? "" : "-# Hit **Reply** to message Jamzie back."].filter(Boolean).join("\n\n").slice(0, 1900),
      components: [{ type: 1, components: [
        ...(kind === "declined" ? [] : [{ type: 2, style: 1, label: "Reply", emoji: { name: "💬" }, custom_id: `jb:reply:${r.id}` }]),
        { type: 2, style: 5, label: m.button.slice(0, 80), url: m.link },
      ] }],
      allowed_mentions: { parse: [] },
    }),
  });
  if (msg.ok) return;
  if (msg.j?.code === 50007) throw new Retry(`@${r.discord} has DMs from server members turned off.`);
  throw new Retry(`Discord DM failed (${msg.status}): ${msg.j?.message ?? ""}`);
}

class Retry extends Error {}
class GiveUp extends Error {}

// ---------- DMs to Jamzie herself ----------
// Her account is looked up ONCE by the name in settings.owner_discord (username,
// display name or server nickname, and it must match exactly one member), then
// pinned by account ID so nobody can grab her alerts by copying her name later.
async function ownerId(): Promise<string> {
  const [s] = await sql`select owner_discord, owner_discord_id from public.settings where id = 1`;
  if (s?.owner_discord_id) return String(s.owner_discord_id);
  const want = String(s?.owner_discord ?? "").trim();
  if (!want) throw new Retry("No owner Discord name set.");
  if (!BOT || !GUILD) throw new Retry("Discord isn't set up yet.");
  const norm = (x: unknown) => String(x ?? "").toLowerCase().replace(/[\s._]/g, "");
  const target = norm(want);
  // deno-lint-ignore no-explicit-any
  const found = new Map<string, any>();
  for (const q of new Set([want, want.replace(/\s+/g, ""), want.split(/\s+/)[0]])) {
    const r = await discord(`/guilds/${GUILD}/members/search?limit=100&query=${encodeURIComponent(q)}`);
    // deno-lint-ignore no-explicit-any
    if (r.ok) for (const m of r.j as any[]) if (m?.user && !m.user.bot) found.set(String(m.user.id), m);
  }
  const isHit = (m: { user: { username?: string; global_name?: string }; nick?: string }) =>
    [m.user.username, m.user.global_name, m.nick].some((n) => norm(n) === target);
  if (![...found.values()].some(isHit)) {
    // Search only matches usernames/nicknames, so also scan the member list for display names.
    const all = await discord(`/guilds/${GUILD}/members?limit=1000`);
    // deno-lint-ignore no-explicit-any
    if (all.ok) for (const m of all.j as any[]) if (m?.user && !m.user.bot) found.set(String(m.user.id), m);
  }
  const hits = [...found.values()].filter(isHit);
  if (hits.length !== 1) throw new Retry(hits.length ? `More than one member matches "${want}".` : `Nobody named "${want}" found in the Discord server (checked ${found.size} members).`);
  const m = hits[0];
  const g = await discord(`/guilds/${GUILD}`);
  const isOwner = g.ok && String(g.j?.owner_id) === String(m.user.id);
  const label = `@${m.user.username}` + (m.user.global_name ? ` (${m.user.global_name})` : "") + (m.nick ? ` [nick: ${m.nick}]` : "") + (isOwner ? " · server owner" : "");
  await sql`update public.settings set owner_discord_id = ${String(m.user.id)}::text, owner_discord_found = ${label.slice(0, 200)}::text where id = 1`;
  return String(m.user.id);
}
async function dmOwner(text: string, requestId: string | null = null) {
  const uid = await ownerId();
  const ch = await discord("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: uid }) });
  if (!ch.ok) throw new Retry(`Couldn't open a DM with Jamzie (${ch.status}): ${ch.j?.message ?? ""}`);
  const msg = await discord(`/channels/${ch.j.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: text.slice(0, 1900),
      components: [{ type: 1, components: [
        ...(requestId ? [{ type: 2, style: 1, label: "Reply", emoji: { name: "💬" }, custom_id: `jb:reply:${requestId}` }] : []),
        { type: 2, style: 5, label: "Open studio", url: `${SITE}/admin.html` },
      ] }],
      allowed_mentions: { parse: [] },
    }),
  });
  if (!msg.ok) throw new Retry(`DM to Jamzie failed (${msg.status}): ${msg.j?.message ?? ""}`);
}

Deno.serve(async () => {
  const jobs = await sql`
    update public.notifications n
       set attempts = n.attempts + 1, next_try_at = now() + interval '3 minutes'
     where n.id in (select id from public.notifications
                     where status = 'pending' and next_try_at <= now()
                     order by id limit 15 for update skip locked)
    returning n.id, n.kind, n.channel, n.attempts, n.created_at, n.request_id`;

  const results: unknown[] = [];
  for (const job of jobs) {
    const [r] = await sql`select id, code, token, name, type, character_name, price, paid_amount, email, discord, discord_id
                            from public.requests where id = ${job.request_id}::uuid`;
    try {
      if (!r) throw new GiveUp("Request was deleted.");
      let said: string[] = [];
      if (job.kind === "message") {
        // Everything Jamzie wrote since this client's last message ping on this channel.
        let rows = await sql`
          select body, files from public.messages
           where request_id = ${r.id}::uuid and sender = 'artist'
             and created_at > coalesce((select max(sent_at) from public.notifications
                                         where request_id = ${r.id}::uuid and kind = 'message'
                                           and channel = ${job.channel}::text and status = 'sent'), '-infinity'::timestamptz)
           order by created_at desc limit 5`;
        if (!rows.length) rows = await sql`select body, files from public.messages where request_id = ${r.id}::uuid and sender = 'artist' order by created_at desc limit 1`;
        said = rows.reverse().map((x) => {
          const n = Array.isArray(x.files) ? x.files.length : 0;
          const body = String(x.body ?? "").trim();
          const clipped = body.length > 1500 ? body.slice(0, 1500) + "…" : body;
          const att = n ? `📎 ${n} file${n > 1 ? "s" : ""} (open your request page to see ${n > 1 ? "them" : "it"})` : "";
          return [clipped, att].filter(Boolean).join("\n");
        }).filter(Boolean);
      }
      const m = message(job.kind, r, said);
      if (job.channel === "email") {
        if (!r.email) throw new GiveUp("No email on this request.");
        await sendEmail(Number(job.id), r, m);
      } else {
        if (!r.discord) throw new GiveUp("No Discord username on this request.");
        await sendDiscord(r, m, job.kind);
      }
      await sql`update public.notifications set status = 'sent', sent_at = now(), last_error = null where id = ${job.id}::bigint`;
      results.push({ id: job.id, sent: true });
    } catch (e) {
      const why = (e instanceof Error ? e.message : String(e)).slice(0, 480);
      const tooOld = Date.now() - new Date(job.created_at).getTime() > GIVE_UP_MS;
      if (e instanceof GiveUp || tooOld) {
        await sql`update public.notifications set status = 'failed', last_error = ${why}::text where id = ${job.id}::bigint`;
      } else {
        const waitMin = Math.min(5 * Number(job.attempts), 60);
        await sql`update public.notifications set last_error = ${why}::text, next_try_at = now() + make_interval(mins => ${waitMin}::int) where id = ${job.id}::bigint`;
      }
      results.push({ id: job.id, sent: false, error: why });
    }
  }

  // ---------- Alerts for Jamzie ----------
  const alerts = await sql`
    update public.owner_alerts a
       set attempts = a.attempts + 1, next_try_at = now() + interval '3 minutes'
     where a.id in (select id from public.owner_alerts
                     where status = 'pending' and next_try_at <= now()
                     order by id limit 15 for update skip locked)
    returning a.id, a.text, a.attempts, a.created_at, a.request_id`;
  for (const a of alerts) {
    try {
      await dmOwner(String(a.text), a.request_id ? String(a.request_id) : null);
      await sql`update public.owner_alerts set status = 'sent', sent_at = now(), last_error = null where id = ${a.id}::bigint`;
      results.push({ alert: a.id, sent: true });
    } catch (e) {
      const why = (e instanceof Error ? e.message : String(e)).slice(0, 480);
      if (Date.now() - new Date(a.created_at).getTime() > GIVE_UP_MS) {
        await sql`update public.owner_alerts set status = 'failed', last_error = ${why}::text where id = ${a.id}::bigint`;
      } else {
        await sql`update public.owner_alerts set last_error = ${why}::text, next_try_at = now() + make_interval(mins => ${Math.min(5 * Number(a.attempts), 60)}::int) where id = ${a.id}::bigint`;
      }
      results.push({ alert: a.id, sent: false, error: why });
    }
  }
  return Response.json({ processed: results.length });
});
