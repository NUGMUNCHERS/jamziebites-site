// JamzieBites: checkout (Supabase Edge Function "checkout")
//
// Makes a Stripe Checkout page for exactly what's owed, so clients never type
// a code or an amount.
//   { token }  -> pay for an accepted commission (from the private request page)
//   { code }   -> same, for old acceptance messages that only had a code
//   { tip: n } -> a tip of $n, not linked to any commission
// The price always comes from the database, never from the browser.
//
// Needs the Edge Function secret STRIPE_SECRET_KEY: a Stripe *restricted* key
// with only "Checkout Sessions: Write". Without it, the function falls back to
// the plain Payment Link (the client types the amount).
// Deploy with "Verify JWT" OFF: the website calls it without logging in.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL") ?? "", { prepare: false, max: 1, idle_timeout: 20 });
const STRIPE_KEY = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const SITE = "https://jamziebites.com";
const PAYMENT_LINK = "https://buy.stripe.com/bJeaEX7wH7q95LBdoMfMA00";
const ORIGINS = new Set([SITE, "https://www.jamziebites.com", "http://localhost:8790"]);

function headers(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(o) ? o : SITE,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
// Stripe wants nested form fields: line_items[0][price_data][currency]=usd
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripeSession(params: Record<string, unknown>) {
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j.url !== "string") {
    console.error("stripe error", r.status, j?.error?.message ?? "");
    throw new Error("Stripe couldn't start the checkout. Please try again in a moment.");
  }
  return j.url as string;
}

Deno.serve(async (req) => {
  const h = headers(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = JSON.parse((await req.text()).slice(0, 2000)); } catch { return reply({ error: "Bad request." }, 400); }

  try {
    // ---------- Tips ----------
    if (body.tip !== undefined) {
      const cents = Math.round(Number(body.tip) * 100);
      if (!Number.isFinite(cents) || cents < 100 || cents > 100000) return reply({ error: "Tips can be anywhere from $1 to $1,000." }, 400);
      if (!STRIPE_KEY) return reply({ url: PAYMENT_LINK + "?client_reference_id=TIP", fallback: true, amount: cents / 100 });
      const url = await stripeSession({
        mode: "payment",
        submit_type: "donate",
        client_reference_id: "TIP",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents,
          product_data: { name: "A tip for Jamzie 💝", description: "Thank you so much for supporting my art!" } } }],
        success_url: SITE + "/pay.html?tipped=1",
        cancel_url: SITE + "/pay.html",
      });
      return reply({ url });
    }

    // ---------- Commission payments ----------
    const token = typeof body.token === "string" && /^[0-9a-f]{36}$/.test(body.token) ? body.token : null;
    let code = typeof body.code === "string" ? body.code.trim().toUpperCase().replace(/\s+/g, "") : "";
    if (/^JB[A-F0-9]{6}$/.test(code)) code = "JB-" + code.slice(2);
    if (!token && !/^JB-[A-F0-9]{6}$/.test(code)) return reply({ error: "That request link or code doesn't look right." }, 400);

    const rows = token
      ? await sql`select code, token, type, character_name, status, price, paid_amount, email from public.requests where token = ${token}::text`
      : await sql`select code, token, type, character_name, status, price, paid_amount, email from public.requests where code = ${code}::text`;
    const r = rows[0];
    if (!r) return reply({ error: "We couldn't find that request. Double-check the link or code." }, 404);
    if (r.status === "new") return reply({ error: "This request hasn't been accepted yet. Please wait for Jamzie to accept it before paying ♡" }, 409);
    if (r.status === "declined" || r.status === "cancelled") return reply({ error: "This request is closed, so there's nothing to pay." }, 409);
    const owed = Math.round((Number(r.price ?? 0) - Number(r.paid_amount ?? 0)) * 100);
    if (r.status !== "accepted" || owed <= 0) return reply({ error: "This commission is already paid. Thank you! ♡", paid: true }, 409);
    if (owed < 50) return reply({ error: "The amount left is too small to pay by card. Message Jamzie and she'll sort it out." }, 409);

    if (!STRIPE_KEY) {
      return reply({ url: PAYMENT_LINK + "?client_reference_id=" + encodeURIComponent(r.code), fallback: true, amount: owed / 100, code: r.code });
    }
    const back = token ? `${SITE}/request.html?t=${r.token}` : `${SITE}/pay.html`;
    const url = await stripeSession({
      mode: "payment",
      client_reference_id: r.code,
      customer_email: r.email ?? undefined,
      metadata: { request_code: r.code },
      payment_intent_data: { description: `JamzieBites commission ${r.code}` },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: owed,
        product_data: { name: `JamzieBites commission · ${r.code}`,
          description: String(r.type) + (r.character_name ? ` of ${r.character_name}` : "") } } }],
      success_url: token ? `${back}&paid=1` : `${SITE}/pay.html?paid=1`,
      cancel_url: back,
    });
    return reply({ url });
  } catch (e) {
    console.error("checkout failed:", e instanceof Error ? e.message : e);
    return reply({ error: e instanceof Error && /Stripe/.test(e.message) ? e.message : "Something went wrong. Please try again in a moment." }, 500);
  }
});
