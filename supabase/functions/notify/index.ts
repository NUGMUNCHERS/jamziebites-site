// JamzieBites: notify (Supabase Edge Function "notify")
//
// Sends the messages queued in public.notifications. The database queues one
// every time a request is received / accepted / paid / started / finished /
// declined, and wakes this function right away (plus a 1-minute retry timer).
//   email   -> via Resend (secret RESEND_API_KEY), from hello@jamziebites.com
//   discord -> a DM from Jamzie's bot (secrets DISCORD_BOT_TOKEN, DISCORD_GUILD_ID).
//              The client must be in her Discord server; it keeps retrying
//              for 48 hours in case they join late.
// Safe to call by anyone: it only ever sends messages that are already queued,
// and each one exactly once. Deploy with "Verify JWT" OFF.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const RESEND_KEY = env("RESEND_API_KEY");
const FROM = env("NOTIFY_FROM") || "Jamzie 🍓 <hello@jamziebites.com>";
const REPLY_TO = env("NOTIFY_REPLY_TO");
const BOT = env("DISCORD_BOT_TOKEN");
const GUILD = env("DISCORD_GUILD_ID");
const SITE = "https://jamziebites.com";
const GIVE_UP_MS = 48 * 3600e3;

// deno-lint-ignore no-explicit-any
type Req = any;
const money = (n: unknown) => "$" + Number(n ?? 0).toFixed(2).replace(/\.00$/, "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function message(kind: string, r: Req) {
  const link = `${SITE}/request.html?t=${r.token}`;
  const piece = String(r.type) + (r.character_name ? ` of ${r.character_name}` : "");
  const owed = Number(r.price ?? 0) - Number(r.paid_amount ?? 0);
  const M: Record<string, { subject: string; lines: string[]; button: string }> = {
    received: {
      subject: `I got your commission request! ✦ (${r.code})`,
      lines: [`Hi ${r.name}! 🍓`,
        `Thank you so much for requesting a ${piece}! It's safely in my inbox and I'll look it over soon.`,
        `If I accept it, you'll get a message with your final price and a link to pay. Please don't send any payment before then.`],
      button: "Check on my request",
    },
    accepted: {
      subject: `Your commission is accepted! 🎉 (${r.code})`,
      lines: [`Hi ${r.name}! Great news: I've accepted your ${piece}! ✨`,
        `Your final price is ${money(owed)}. Use the button below to pay. The amount is filled in for you, so there's no code to type.`,
        `Your slot is locked in as soon as payment goes through. Thank you so much! ♡`],
      button: `Pay ${money(owed)}`,
    },
    paid: {
      subject: `Payment received, thank you! ♡ (${r.code})`,
      lines: [`Hi ${r.name}! I got your payment of ${money(r.paid_amount)} for your ${piece}. Your slot is locked in! 🎉`,
        `You can watch it move from sketch to finished piece on your request page anytime.`],
      button: "Follow my commission",
    },
    started: {
      subject: `I've started on your commission! ✏️ (${r.code})`,
      lines: [`Hi ${r.name}! Just letting you know I've started working on your ${piece}. 🎨`,
        `Your request page shows which stage it's at.`],
      button: "See progress",
    },
    done: {
      subject: `Your commission is finished! 🎨✨ (${r.code})`,
      lines: [`Hi ${r.name}! Your ${piece} is all done! 🎉`,
        `I'll send your final files over (if I haven't already). Thank you so much for commissioning me, it truly means the world. ♡`],
      button: "View my request",
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
  return { ...m, link, text: m.lines.join("\n\n") + `\n\n${m.button}: ${link}\n\n— Jamzie (JamzieBites)` };
}

function emailHtml(m: { subject: string; lines: string[]; button: string; link: string }) {
  return `<!doctype html><html><body style="margin:0;background:#fff5fa;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#3b2a4a">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<div style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 6px 24px rgba(180,90,140,.15)">
<div style="height:8px;background:linear-gradient(90deg,#ff8fc4,#b79cff,#7fd6ff)"></div>
<div style="padding:28px 26px">
<div style="font-size:22px;font-weight:800;margin-bottom:14px">Jamzie<span style="color:#e0559a">Bites</span> 🍓</div>
${m.lines.map((l) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${esc(l)}</p>`).join("")}
<p style="margin:22px 0 8px"><a href="${esc(m.link)}" style="display:inline-block;background:#e0559a;color:#ffffff;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:999px">${esc(m.button)}</a></p>
<p style="font-size:12px;color:#8a7a99;margin:18px 0 0">This link is private to your request, so please don't share it. Reply to this email if you have any questions.</p>
</div></div>
<p style="font-size:12px;color:#8a7a99;text-align:center;margin-top:16px">JamzieBites · <a href="${SITE}" style="color:#8a7a99">jamziebites.com</a></p>
</div></body></html>`;
}

async function sendEmail(id: number, r: Req, m: ReturnType<typeof message>) {
  if (!RESEND_KEY) throw new Retry("Email isn't set up yet (RESEND_API_KEY missing).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `jb-notification-${id}` },
    body: JSON.stringify({ from: FROM, to: [r.email], subject: m.subject, html: emailHtml(m), text: m.text, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
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
async function sendDiscord(r: Req, m: ReturnType<typeof message>) {
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
      content: m.lines.join("\n\n").slice(0, 1900),
      components: [{ type: 1, components: [{ type: 2, style: 5, label: m.button.slice(0, 80), url: m.link }] }],
      allowed_mentions: { parse: [] },
    }),
  });
  if (msg.ok) return;
  if (msg.j?.code === 50007) throw new Retry(`@${r.discord} has DMs from server members turned off.`);
  throw new Retry(`Discord DM failed (${msg.status}): ${msg.j?.message ?? ""}`);
}

class Retry extends Error {}
class GiveUp extends Error {}

// Discord wants a bot to have connected to its gateway at least once before it
// can DM anyone. Calling this function with ?connect=1 does that one-time hello.
function gatewayHello(): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
    const finish = (v: string) => { clearTimeout(t); try { ws.close(); } catch { /* */ } resolve(v); };
    const t = setTimeout(() => finish("timeout"), 12000);
    ws.onmessage = (ev) => {
      const p = JSON.parse(String(ev.data));
      if (p.op === 10) ws.send(JSON.stringify({ op: 2, d: { token: BOT, intents: 0, properties: { os: "linux", browser: "jamziebites", device: "jamziebites" } } }));
      else if (p.t === "READY") finish("connected as " + p.d.user.username);
      else if (p.op === 9) finish("rejected (check the bot token)");
    };
    ws.onclose = (e) => finish("closed " + e.code);
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("connect") === "1") {
    // Also lists the servers the bot has joined (names + IDs only), to fill in DISCORD_GUILD_ID.
    const guilds = BOT ? await discord("/users/@me/guilds") : null;
    return Response.json({
      discord: BOT ? await gatewayHello() : "no bot token",
      servers: guilds?.ok ? (guilds.j as { id: string; name: string }[]).map((g) => ({ id: g.id, name: g.name })) : [],
      server_id_set: GUILD ? GUILD : "not set",
      email: RESEND_KEY ? "key set" : "no key",
    });
  }

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
      const m = message(job.kind, r);
      if (job.channel === "email") {
        if (!r.email) throw new GiveUp("No email on this request.");
        await sendEmail(Number(job.id), r, m);
      } else {
        if (!r.discord) throw new GiveUp("No Discord username on this request.");
        await sendDiscord(r, m);
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
  return Response.json({ processed: results.length, results });
});
