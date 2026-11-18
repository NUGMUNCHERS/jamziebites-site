// JamzieBites: Stripe webhook (Supabase Edge Function "stripe-webhook")
//
// Stripe calls this the moment a client pays through the Pay page.
//  1. It checks Stripe's signature using the STRIPE_WEBHOOK_SECRET Edge Function secret,
//     so nobody else can fake a payment.
//  2. It hands the payment to public.record_stripe_payment() in the database. That
//     matches the request code, marks the request paid if the amount covers the
//     price, and flags anything odd for Jamzie's studio.
//
// Deploy with "Verify JWT" OFF. Stripe doesn't send a Supabase login, and the Stripe
// signature check below is the lock instead.
import postgres from "npm:postgres@3.4.5";

const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
const enc = new TextEncoder();
const TOLERANCE_S = 300; // reject replays older than 5 minutes
let hmacKey: Promise<CryptoKey> | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function verifyStripe(body: string, header: string | null): Promise<boolean> {
  if (!SECRET.startsWith("whsec_") || !header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!Number.isFinite(ts) || ts <= 0 || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  hmacKey ??= crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", await hmacKey, enc.encode(t + "." + body)));
  return sigs.some((s) => safeEqual(s, expected));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.text();
  if (body.length > 262144) return json({ error: "too large" }, 413);
  if (!(await verifyStripe(body, req.headers.get("stripe-signature")))) return json({ error: "bad signature" }, 400);

  // deno-lint-ignore no-explicit-any
  let event: any;
  try { event = JSON.parse(body); } catch { return json({ error: "bad json" }, 400); }
  const s = event?.data?.object ?? {};

  let result: "paid" | "processing" | "failed" | null = null;
  if (event.type === "checkout.session.completed") result = s.payment_status === "paid" ? "paid" : "processing";
  else if (event.type === "checkout.session.async_payment_succeeded") result = "paid";
  else if (event.type === "checkout.session.async_payment_failed") result = "failed";
  if (!result || s.object !== "checkout.session" || s.mode !== "payment" || typeof s.id !== "string") {
    return json({ received: true, ignored: String(event.type ?? "") });
  }

  // deno-lint-ignore no-explicit-any
  const custom = (Array.isArray(s.custom_fields) ? s.custom_fields : []).map((f: any) =>
    String(f?.text?.value ?? f?.dropdown?.value ?? f?.numeric?.value ?? "")
  ).filter(Boolean).join(" ").slice(0, 300);
  const intent = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  try {
    const rows = await sql`
      select public.record_stripe_payment(
        ${s.id}::text, ${str(intent)}::text, ${event.livemode === true}::boolean,
        ${Math.max(0, Math.round(Number(s.amount_total) || 0))}::bigint, ${str(s.currency) ?? "usd"}::text,
        ${str(s.client_reference_id)}::text, ${custom || null}::text,
        ${str(s.customer_details?.name)}::text, ${str(s.customer_details?.email)}::text, ${result}::text
      ) as state`;
    return json({ received: true, state: rows[0]?.state ?? null });
  } catch (e) {
    console.error("record_stripe_payment failed:", e instanceof Error ? e.message : e);
    return json({ error: "could not record payment" }, 500); // 500 makes Stripe retry later
  }
});
