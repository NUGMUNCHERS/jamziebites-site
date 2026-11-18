// JamzieBites: discord-interactions (Supabase Edge Function "discord-interactions")
//
// Discord's "Interactions Endpoint URL" for the JamzieBites bot. It handles the
// 💬 Reply button on the bot's DMs:
//   * Jamzie (the pinned owner account) presses Reply on an alert  -> a reply box
//     opens -> her text is posted to that request's thread as the artist, which
//     emails / DMs it to the client.
//   * A client presses Reply on their own update DM -> their text is posted as the
//     client, which DMs Jamzie.
// Every request is checked against Discord's Ed25519 signature, and the person
// pressing the button must be Jamzie or that request's own client.
// Deploy with "Verify JWT" OFF.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
// The bot's PUBLIC key (Developer Portal -> General Information). Not a secret.
const PUBLIC_KEY = (Deno.env.get("DISCORD_PUBLIC_KEY") ?? "").trim() || "1d4e8a865092ddd1faf64d03d20c2b79cb0d0d7b322fa9c3c7af9eadecf8edfa";
const MAX_MSGS_PER_HOUR = 30;

const hex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((b) => parseInt(b, 16)));
let keyP: Promise<CryptoKey> | null = null;
async function verified(req: Request, body: string) {
  const sig = req.headers.get("x-signature-ed25519") ?? "";
  const ts = req.headers.get("x-signature-timestamp") ?? "";
  if (!PUBLIC_KEY || !/^[0-9a-f]{128}$/i.test(sig) || !ts) return false;
  keyP ??= crypto.subtle.importKey("raw", hex(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
  try {
    return await crypto.subtle.verify("Ed25519", await keyP, hex(sig), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

const json = (b: unknown) => Response.json(b);
const say = (content: string) => json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } }); // only they see it

// Who is pressing, relative to this request?
async function roleFor(userId: string, requestId: string) {
  if (!/^[0-9a-f-]{36}$/.test(requestId)) return null;
  const [r] = await sql`select id, code, name, status, discord_id from public.requests where id = ${requestId}::uuid`;
  if (!r) return null;
  const [s] = await sql`select owner_discord_id from public.settings where id = 1`;
  if (s?.owner_discord_id && String(s.owner_discord_id) === userId) return { r, role: "artist" as const };
  if (r.discord_id && String(r.discord_id) === userId) return { r, role: "client" as const };
  return { r, role: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();
  if (!(await verified(req, body))) return new Response("invalid request signature", { status: 401 });
  // deno-lint-ignore no-explicit-any
  const i: any = JSON.parse(body);

  if (i.type === 1) return json({ type: 1 }); // PING

  const userId = String(i.member?.user?.id ?? i.user?.id ?? "");
  const cid = String(i.data?.custom_id ?? "");

  try {
    // Reply button -> open the reply box
    if (i.type === 3 && cid.startsWith("jb:reply:")) {
      const who = await roleFor(userId, cid.slice(9));
      if (!who) return say("That commission doesn't exist anymore.");
      if (!who.role) return say("This button isn't for you.");
      if (who.role === "client" && (who.r.status === "declined" || who.r.status === "cancelled")) return say("This request is closed, so it can't take new messages.");
      const title = (who.role === "artist" ? `Reply to ${who.r.name}` : "Message Jamzie").slice(0, 45);
      return json({
        type: 9,
        data: {
          custom_id: `jb:send:${who.r.id}`,
          title,
          components: [{ type: 1, components: [{
            type: 4, custom_id: "body", style: 2, label: `Message (${who.r.code})`, min_length: 1, max_length: 2000, required: true,
            placeholder: who.role === "artist" ? "They'll get this by email / Discord right away." : "Jamzie gets this right away.",
          }] }],
        },
      });
    }

    // Reply box submitted -> post it to the thread
    if (i.type === 5 && cid.startsWith("jb:send:")) {
      const who = await roleFor(userId, cid.slice(8));
      if (!who) return say("That commission doesn't exist anymore.");
      if (!who.role) return say("This button isn't for you.");
      // deno-lint-ignore no-explicit-any
      const text = String((i.data?.components ?? []).flatMap((row: any) => row.components ?? []).find((c: any) => c.custom_id === "body")?.value ?? "").trim().slice(0, 4000);
      if (!text) return say("Nothing to send.");
      if (who.role === "client") {
        if (who.r.status === "declined" || who.r.status === "cancelled") return say("This request is closed, so it can't take new messages.");
        const [{ n }] = await sql`select count(*)::int as n from public.messages
                                   where request_id = ${who.r.id}::uuid and sender = 'client' and created_at > now() - interval '1 hour'`;
        if (n >= MAX_MSGS_PER_HOUR) return say("That's a lot of messages! Please wait a bit and try again.");
      }
      await sql`insert into public.messages (request_id, sender, body, read_by_artist)
                values (${who.r.id}::uuid, ${who.role}::text, ${text}::text, ${who.role === "artist"}::boolean)`;
      return say(who.role === "artist"
        ? `✅ Sent to **${who.r.name}** (${who.r.code}). It's on their request page and on its way to them now.`
        : `✅ Sent to Jamzie! You'll hear back here or by email.`);
    }

    return say("Hmm, I don't know that button.");
  } catch (err) {
    console.error("discord-interactions failed", err);
    return say("Something went wrong. Please try again, or use the website.");
  }
});
