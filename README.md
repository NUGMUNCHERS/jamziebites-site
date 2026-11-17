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

**NSFW payments:** Stripe (and PayPal) don't allow sexually explicit content, and accounts that take payment for it can be frozen with the money held. Don't send NSFW clients to the Stripe link. Put an adult-friendly payment link in `payments.nsfwPayLink` (VGen is one option), or leave it blank and send NSFW clients payment details yourself.

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
