# ✦ JamzieBites — Commission Website ✦

This is a complete static website with no build step and no monthly fees. It's plain HTML/CSS/JS, so it runs on any free host.

## What's in here

| File | What it is |
|---|---|
| `index.html` | Homepage. It has the hero, gallery, prices, quote calculator, process, usage rights, queue, about, FAQ and request form. |
| `tos.html` | The full Terms of Service, with a table of contents and a print/PDF button |
| `404.html` | A cute "lost in space" page for broken links |
| **`config.js`** | **The only file you normally need to edit.** It holds status, slots, queue, gallery, prices, contact and socials. |
| `assets/styles.css` | All styling. It has two themes: *Daydream* (pastel) and *Stargazer* (cosmic). |
| `assets/main.js` | All interactivity |
| `assets/art/` | Artwork images |
| `assets/logo.svg` | Strawberry-star logo and favicon |
| `robots.txt`, `ai.txt` | Block known AI scrapers (GPTBot, ClaudeBot, CCBot, Google-Extended…) and still allow search engines |
| `sitemap.xml`, `site.webmanifest` | SEO and "add to home screen" support |

## Everyday edits (all in `config.js`)

- **Open or close commissions:** set `status` to `"open"`, `"waitlist"` or `"closed"`.
- **Slots:** `slots: { total: 5, taken: 2 }`. When every slot is taken, the site switches to "waitlist" automatically.
- **Queue:** add one line per commission:
  ```js
  queue: [
    { client: "Anonymous",  type: "Full Body + Full Render", stage: "color" },
    { client: "StarryPaws", type: "5 Sticker Pack",          stage: "sketch" },
  ],
  ```
  The stages are `waiting`, `sketch`, `lineart`, `color`, `render` and `done`.
- **Add art to the gallery:**
  1. Drop the image into `assets/art/`. JPG at about 2000px wide is ideal.
  2. Add an entry at the top of `gallery`. That means newest first.
  3. Put the image's pixel width and height in `w`/`h`.
  4. Set `category` to one of `cinematic`, `fullbody`, `halfbody`, `headshot`, `chibi` or `refsheet`. The filter buttons appear automatically.
- **Prices:** change any number under `pricing`. The price lists **and** the quote calculator update together.
- **Contact and socials:** fill in `contact.discord`, `contact.email` and each social `url`. Anything left blank stays hidden.

## Make the request form email you (free, 2 minutes)

As it stands, "Send my request" builds a neat message that the client copies into a Discord DM. To get requests in your inbox instead:

1. Make a free account at **formspree.io** and create a form.
2. Copy its URL, which looks like `https://formspree.io/f/abcd1234`.
3. Paste it into `contact.formEndpoint` in `config.js`.

If the form ever fails to send, the site falls back to the copy-paste message, so nothing is lost.

## Your studio (admin.html)

**https://jamziebites.com/admin.html** is your private dashboard. It isn't linked anywhere on the site, so bookmark it.

**Signing in:** use your email and password, plus a 6-digit code from an authenticator app.

- The first time you sign in, it shows a QR code. Scan it with Google Authenticator, Authy, 1Password or similar.
- From then on, every sign-in needs the code from the app.
- Closing the tab signs you out, and so do 30 idle minutes.
- The studio only works over `https://`.

**What you can do there:**

- **Requests:** everything clients send from the site lands here, sorted into New, Awaiting payment, In progress, Done and Declined. The browser tab shows how many are new.
- **Accept:** type the final price, then click **Accept + copy message**. A ready-to-paste message (with their request code and the pay link) is copied for you. Send it to the client.
- **Payments:** clients pay on the Pay page using their request code. In Stripe, each payment shows that code (it appears as the "client reference ID"). Match it, then click **Mark paid**, and the commission appears in the public queue.
- **Progress:** move each piece through Sketch → Lineart → Color → Rendering → Done. The public queue updates instantly.
- **Shop status:** switch between Open, Waitlist and Closed, and set the total number of slots. The badge on the site updates instantly.
- **Private notes** on every request. Only you can see them.

**Security:** requests live in a Supabase database.

- The public can only submit requests (with spam and size limits) and read the public queue.
- Reading or changing requests needs your account *and* your 2FA code. The database itself enforces this, not just the web page.
- Public sign-ups are disabled.
- The database setup is saved in `supabase/schema.sql`.

**Lost your phone / authenticator?** Sign in to supabase.com → project **jamziebites** → Authentication → Users. Open your user and remove its MFA factor. The next time you sign in, the studio will ask you to set up 2FA again.

## Payments (pay.html)

The **Pay** page sends clients to a Stripe Payment Link. They type in the exact amount you quoted (minimum $25) along with their username. Stripe handles the card, Apple Pay and Google Pay, and emails them a receipt. Each payment shows up in your Stripe dashboard under **Payments**, with the client's username in the "client reference" field.

**Going live (do this before taking real money):**

1. In Stripe, click **Switch to live account** and finish activation: your ID, bank account for payouts, and tax info. Only you can do this.
2. Still in live mode, go to **Payment Links** and create the same link:
   - Type: **"Customers choose what to pay"**, USD, minimum $25.
   - Turn on **collect customer names**.
   - Add a custom text field: "Username from your commission request".
   - Under **After payment**, redirect to `https://jamziebites.com/pay.html?paid=1`.
   - Or ask Claude to set it up again.
3. Paste the new `https://buy.stripe.com/...` link into `payments.stripeLink` in `config.js`. The "test mode" banner on the Pay page disappears automatically once the link no longer contains `/test_`.

**NSFW payments** go through the same Stripe link as everything else, by choice. Be aware that Stripe's rules ban sexually explicit content, and Stripe can close accounts that take payment for it and hold the balance. Withdraw your Stripe balance to your bank regularly (automatic payouts are the default) so as little money as possible sits in Stripe at any time.

## Security

What's already in place:

- **HTTPS everywhere.** "Enforce HTTPS" is on in GitHub Pages once the certificate is issued.
- **Strict Content-Security-Policy on every page.** Only the site's own scripts, styles, fonts and images can load, which blocks injected scripts.
- **Safe outside connections.** The only outside service the site talks to is Formspree, and only if you set it up. Payments happen on Stripe's own checkout page, and the site never sees card details.
- **No inline scripts.** All JavaScript lives in `assets/`.
- **Locked payment button.** The Pay button only ever sends people to `https://buy.stripe.com`, even if `config.js` were edited to point somewhere else.
- **No framing.** The site can't be embedded in someone else's page (clickjacking protection).
- **Privacy.** Fonts are self-hosted, so visitors' browsers never contact Google. The referrer policy limits what other sites learn about your visitors.
- **Spam protection.** The request form has a hidden honeypot field plus a "too fast to be human" check.
- **Email spoofing protection.** The DNS email-security records (SPF `-all`, DMARC `reject`) stop anyone sending email pretending to be @jamziebites.com.
- **AI scraper blocking.** `robots.txt` and `ai.txt` turn away AI scrapers.
- **No secrets in the repo.** No API keys or passwords live here. Never paste a Stripe secret key (`sk_live_…`) into any file.

What only the account owners can do (please do these!):

1. **Turn on 2-factor authentication** for GitHub, Squarespace, Stripe and the email account behind them. Whoever controls these controls the site, the domain and the money.
2. **Keep the domain locked.** In Squarespace → Domains → jamziebites.com, make sure **domain lock / transfer lock** is on and auto-renew is enabled. An expired domain can be bought by someone else.
3. **Use strong, unique passwords** (a password manager helps).

## Putting it online (free)

Pick one:

- **Netlify Drop:** go to app.netlify.com/drop and drag the whole `jamziebites-site` folder in. It's live in about 30 seconds.
- **Cloudflare Pages / GitHub Pages:** upload the folder as a project. Both are free and support custom domains.
- **Neocities:** very artist-friendly. Upload the files through their dashboard.

After it's live with a real domain:

1. Replace `YOUR-DOMAIN.com` in `sitemap.xml` and `robots.txt`.
2. Optionally, change the `og:image` meta tag in `index.html` to the full URL, such as `https://yourdomain.com/assets/art/stargazer-astronaut.jpg`. This gives link previews on Discord and Twitter a picture.

## Preview it locally

Opening `index.html` directly works for almost everything. For the full experience, run a tiny local server from inside the folder:

```powershell
python -m http.server 8790
```

Then visit http://localhost:8790.

## Nice-to-have artwork to add later

The site works now, but these would make it even better:

- **Self-portrait / mascot avatar** for the "Hi, I'm Jamzie" section. Square, at least 800px. Save it as `assets/art/jamzie-avatar.png`, then swap the `<img>` inside `#avatar-inner` in `index.html` to point at it.
- **One example per tier:** headshot, half body, full body, chibi, sticker, and a ref sheet. Add them to the gallery so clients can see exactly what each price gets them.
- **The same drawing in three finishes** (flat → simple shading → full render). These would replace the color-swatch comparison on the Illustrations price tab.
- **A sleepy "commissions closed" chibi** and a **"lost in space" chibi** for the 404 page.
- **A custom JamzieBites logo or wordmark**, if she wants to replace the strawberry-star.
