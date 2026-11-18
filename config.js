/* ==========================================================================
   ✦ JAMZIEBITES SITE SETTINGS ✦
   This is the ONLY file you need to edit for day-to-day changes:
   open/close commissions, update the queue, add gallery art, change prices.
   Save the file, refresh the page — done. (See README.md for a walkthrough.)
   ========================================================================== */

window.JAMZIE = {

  /* ---------- Basics ---------- */
  artistName: "Jamzie",
  brand: "JamzieBites",

  /* ---------- Commission status ----------
     status: "open"     → green badge, request form open
             "waitlist" → yellow badge, requests go on the waitlist
             "closed"   → badge says closed, form becomes "notify me / waitlist"
     slots:  how many open slots this round, and how many are taken.        */
  status: "open",
  slots: { total: 5, taken: 0 },

  /* ---------- Contact ----------
     Fill these in! Anything left blank is simply hidden on the site.
     formEndpoint: paste a free Formspree URL (https://formspree.io) here and
     the request form will deliver straight to your inbox. If it's blank, the
     form instead builds a tidy message clients can copy into a Discord DM.  */
  contact: {
    discord: "",          // e.g. "jamziebites"
    discordInvite: "https://discord.gg/PEPNQ5pmyX",    // her server invite, e.g. "https://discord.gg/abc123". Clients join so the bot can DM them.
    email: "",            // e.g. "hello@jamziebites.com"
    formEndpoint: ""      // e.g. "https://formspree.io/f/abcd1234"
  },

  /* ---------- Database (Supabase) ----------
     Powers the request form, the admin studio (admin.html) and the live
     queue / open-closed badge. The "publishable" key is MEANT to be public —
     the database's Row Level Security rules are what protect the data.
     Never put a secret key (sb_secret_… / service_role) here. */
  backend: {
    url: "https://babujgeapxhrcrrrxoet.supabase.co",
    key: "sb_publishable_YTkRQn5lPzfN4e3ktXRPjw_Dw14wEPw"
  },

  /* ---------- Payments (pay.html) ----------
     stripeLink: the Stripe Payment Link clients use to pay their quoted amount.
       A link containing "/test_" is a sandbox link: the Pay page shows a
       "test mode — no real money" banner. Swap in the LIVE link once her Stripe
       account is activated (see README). All commissions, SFW and NSFW, use it. */
  payments: {
    stripeLink: "https://buy.stripe.com/bJeaEX7wH7q95LBdoMfMA00"
  },

  /* ---------- Social links (blank url = hidden) ---------- */
  socials: [
    { label: "Instagram",    icon: "instagram", url: "https://www.instagram.com/jamziebites/" },
    { label: "Twitter / X",  icon: "x",         url: "https://x.com/jamziebites" },
    { label: "TikTok",       icon: "tiktok",    url: "https://www.tiktok.com/@jamziebites" },
    { label: "Bluesky",      icon: "bluesky",   url: "" },
    { label: "FurAffinity",  icon: "paw",       url: "" },
    { label: "Ko-fi",        icon: "kofi",      url: "" }
  ],

  /* ---------- About blurb (shown in the "Hi, I'm Jamzie" section) ---------- */
  pronouns: "she/her/it",
  about: [
    "Hi! I'm Jamzie (she/her/it), a furry & artist running on sugar, spice & questionable advice. When I'm not drawing, I'm baking treats & causing mischief. 🍓",
    "I draw soft, sparkly, glow-y furry art: everything from squishy little chibis and sticker packs to moody, fully rendered cinematic scenes. Every piece is drawn by hand, in my own style, with a lot of love for your characters. No AI, ever. ♡",
    "You might know me as hot.pepper.jam! That's the name I used to post my art under, so some older pieces still have it on them. Same artist, new name. 🌶️"
  ],
  loves: [
    "Fluffy & floofy OCs",
    "Dragons, sharks & hybrids",
    "Pastel, cozy & cosmic vibes",
    "Expressive chibis & sticker sets",
    "Moody night & space scenes"
  ],
  wontDraw: [
    "Anything involving minors or underage-looking characters in NSFW",
    "Hateful, discriminatory or exploitative content",
    "Anything illegal",
    "Copies of another artist's style",
    "Custom designs in a scenic piece (designs come as a ref sheet)",
    "Anything I'm not comfortable with"
  ],
  askFirst: [
    "NSFW / mature content (+$95 · 18+ clients & characters only)",
    "Art trades (currently open!)",
    "Sensitive themes",
    "Fully private (never-posted) commissions",
    "Big or unusual projects"
  ],

  /* ---------- Commission queue ----------
     Add one line per active commission. stage can be:
     "waiting", "sketch", "lineart", "color", "render", "done"
     Use "Anonymous" for clients who asked to stay private.                  */
  queue: [
    // { client: "Anonymous", type: "Full Body + Full Render", stage: "sketch" },
  ],

  /* ---------- Gallery ----------
     Put image files in assets/art/ and add a line here. Newest first.
     category: "cinematic" | "fullbody" | "halfbody" | "headshot" | "chibi" | "refsheet"
     w / h: the image's pixel size (keeps the layout from jumping while loading).
     thumb (optional): a smaller copy (~1100px wide) in assets/art/sm/ for the grid, so the
     page loads fast; the full-size "src" still opens when someone clicks the piece. */
  gallery: [
    {
      src: "assets/art/stargazer-astronaut.jpg", thumb: "assets/art/sm/stargazer-astronaut.jpg", w: 2000, h: 1119,
      title: "Stargazer",
      category: "cinematic",
      tier: "Cinematic Illustration",
      alt: "A fluffy pink horned dragon-shark in a glowing astronaut suit and bubble helmet sits on a rock, gazing out at a purple planet and a galaxy-streaked sky."
    },
    {
      src: "assets/art/porch-moonlight.jpg", thumb: "assets/art/sm/porch-moonlight.jpg", w: 2000, h: 1350,
      title: "Porch Light",
      category: "fullbody",
      tier: "Full Body · Full Render · Detailed Scenery",
      alt: "A pink and white horned dragon-shark with purple and blue markings lounges on wooden porch steps at night, under string lights and a full moon, smoke curling from one hand."
    },
    {
      src: "assets/art/poodle-chibi-sheet.jpg", thumb: "assets/art/sm/poodle-chibi-sheet.jpg", w: 2000, h: 1650,
      title: "Poodle Moods",
      category: "chibi",
      tier: "Expression / Sticker Sheet",
      alt: "Four chibi expressions of a fluffy pastel poodle in a striped periwinkle sweater: shy, sobbing, excited on a leash, and blushing, captioned 'none of these thoughts are in the bible.'"
    },
    {
      src: "assets/art/lunaari-ref-sheet.jpg", thumb: "assets/art/sm/lunaari-ref-sheet.jpg", w: 2400, h: 1151,
      title: "Lunaari",
      category: "refsheet",
      tier: "Reference Sheet",
      alt: "Reference sheet of Lunaari, a black and white bat creature with huge blue-lined ears, iridescent pink and purple holographic wings, moon and star markings, shown front, back and side, with two headshots, a tail detail and paw prints."
    },
    {
      src: "assets/art/monarch-fox-ref-sheet.jpg", thumb: "assets/art/sm/monarch-fox-ref-sheet.jpg", w: 2000, h: 858,
      title: "Monarch Fox",
      category: "refsheet",
      tier: "Reference Sheet",
      alt: "Reference sheet of an orange fox with huge monarch butterfly wings and antennae, wearing a black corset outfit, shown front and back, with a fluffy headshot, eye and paw-pad details and a color palette."
    },
    {
      src: "assets/art/sweet-grin-headshot.jpg", thumb: "assets/art/sm/sweet-grin-headshot.jpg", w: 1600, h: 1602,
      title: "Sweet Grin",
      category: "headshot",
      tier: "Headshot",
      alt: "Close-up headshot of a pale, cream-toned canine with long lashes and a wide, happy grin, tongue out, in front of a soft dark forest background."
    },
    {
      src: "assets/art/campfire-stories.jpg", thumb: "assets/art/sm/campfire-stories.jpg", w: 2000, h: 1334,
      title: "Campfire Stories",
      category: "fullbody",
      tier: "Full Body · Base / YCH",
      alt: "Three fluffy pale canine cubs in hoodies sit around a glowing campfire in a dark autumn forest, laughing and telling stories. Captioned 'CampFire Stories Base'."
    },
    {
      src: "assets/art/dutchie-plushie.jpg", thumb: "assets/art/sm/dutchie-plushie.jpg", w: 1906, h: 1933,
      title: "Dutchie & Plushie",
      category: "fullbody",
      tier: "Full Body · Base / YCH",
      alt: "A white and red striped Dutch angel dragon with pink feathered wings and little red horns hugs a matching plushie against a pink starry sky. Captioned 'dutchie with a plushie base'."
    },
    {
      src: "assets/art/sweater-weather.jpg", thumb: "assets/art/sm/sweater-weather.jpg", w: 1080, h: 1040,
      title: "Sweater Weather",
      category: "fullbody",
      tier: "Full Body · Base / YCH",
      alt: "A fluffy white canine wrapped in a plaid blanket and knit beanie holds a steaming mug by a window with falling autumn leaves and a lit candle. Captioned 'Sweater weather base'."
    },
    {
      src: "assets/art/ice-storm-dragon.jpg", thumb: "assets/art/sm/ice-storm-dragon.jpg", w: 1080, h: 1008,
      title: "Dragon of Ice and Storm",
      category: "headshot",
      tier: "Headshot",
      alt: "Side-profile headshot of a pale pink and icy blue feathered dragon with a glowing outline and a thin gold chain piercing, on a soft purple background."
    },
    {
      src: "assets/art/sakura-blood.jpg", thumb: "assets/art/sm/sakura-blood.jpg", w: 1065, h: 1009,
      title: "Sakura Blood",
      category: "headshot",
      tier: "Headshot / Icon",
      alt: "Neon pink, blue and white fluffy canine icon with a big open grin, framed in a dark circle with drifting sakura petals."
    },
    {
      src: "assets/art/cherry-headshot.jpg", thumb: "assets/art/sm/cherry-headshot.jpg", w: 1228, h: 1128,
      title: "Cherry",
      category: "headshot",
      tier: "Headshot",
      alt: "Grinning red and cream canine with spiky crimson fur, cherry earrings and freckles, swirling cloud-like cream fur, and red flower shapes on a deep red background."
    },
    {
      src: "assets/art/orchid-mantis-dutchie.jpg", thumb: "assets/art/sm/orchid-mantis-dutchie.jpg", w: 1280, h: 960,
      title: "Orchid Mantis Dutchie",
      category: "refsheet",
      tier: "Adopt · Reference Sheet",
      alt: "Reference sheet for a pastel pink and blue orchid-mantis Dutch angel dragon with feathered wings and blossoms, showing a headshot, full body, eye details, a color palette and an orchid mantis photo for reference."
    }
  ],

  /* ---------- Prices (USD) ----------
     Changing a number here updates the price lists AND the quote calculator. */
  pricing: {
    sizes: [
      { id: "headshot", label: "Headshot",  price: 35, simple: 10, render: 15 },
      { id: "half",     label: "Half Body", price: 50, simple: 15, render: 25 },
      { id: "full",     label: "Full Body", price: 75, simple: 20, render: 40 }
    ],
    chibi: [
      { id: "headshot", label: "Headshot",  price: 25 },
      { id: "half",     label: "Half Body", price: 35 },
      { id: "full",     label: "Full Body", price: 45 }
    ],
    stickers: [
      { id: "single", label: "Single Sticker", price: 15,  count: 1 },
      { id: "pack5",  label: "5 Sticker Pack", price: 85,  count: 5 },
      { id: "pack10", label: "10 Sticker Pack", price: 120, count: 10 }
    ],
    backgrounds: [
      { id: "solid",      label: "Solid Color / Transparent",   price: 0 },
      { id: "gradient",   label: "Gradient",                    price: 5 },
      { id: "decorative", label: "Simple Decorative Background", price: 15 },
      { id: "simple",     label: "Simple Scenery",              price: 20 },
      { id: "detailed",   label: "Detailed Scenery",            price: 30 },
      { id: "cinematic",  label: "Complex Cinematic Scenery",   price: 75 }
    ],
    refSheets: [
      { id: "simple", label: "Simple Reference Sheet", price: 120,
        includes: ["Front View", "Back View", "Color Palette", "Character Information"] },
      { id: "deluxe", label: "Deluxe Reference Sheet", price: 200,
        includes: ["Front View", "Back View", "Side View", "Headshot", "Color Palette", "Character Information"] }
    ],
    cinematic: 190,
    expression: 15,               // each additional ref sheet expression
    nsfw: 95,                     // flat fee for NSFW / mature content
    addons: [
      { id: "markings", label: "Complex character markings", min: 15, max: 15 },
      { id: "wings",    label: "Wings / additional limbs",   min: 15, max: 15 },
      { id: "clothing", label: "Complex clothing / armor",   min: 20, max: 20 },
      { id: "props",    label: "Props / accessories",        min: 10, max: 25 },
      // "only" limits an add-on to certain commission types in the quote calculator
      { id: "design",   label: "Custom character design",    min: 50, max: 50, only: ["ref"] }
    ],
    extraCharacterRate: 0.85,     // each extra character = 85% of the base price
    rushRate: 0.35,               // rush = +35%
    commercialRate: 1.00          // commercial license = +100%
  },

  /* ---------- Misc ---------- */
  turnaround: "2–12 weeks",
  tosUpdated: "" // e.g. "November 2026" — shown at the top of the Terms page
};
