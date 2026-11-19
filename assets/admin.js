/* ==========================================================================
   JamzieBites Studio (admin.html)
   Security: all access control is enforced by the database (Row Level
   Security + 2FA/aal2 check). This page is just a friendly window onto it.
   The session lives in sessionStorage (closing the tab signs out) and
   auto-signs-out after 30 minutes of inactivity.
   ========================================================================== */
(function () {
  "use strict";
  var B = (window.JAMZIE && window.JAMZIE.backend) || {};
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["v-loading", "v-config", "v-login", "v-enroll", "v-verify", "v-denied", "v-app"];
  var IDLE_MS = 30 * 60 * 1000;

  function show(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    $("signout").hidden = !(id === "v-app" || id === "v-enroll" || id === "v-verify" || id === "v-denied");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return n == null || n === "" ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function when(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return d; } }
  var toastT;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function copy(text, msg) {
    var done = function () { toast(msg || "Copied!"); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy — select the text manually."); }
      ta.remove();
    }
  }
  function busy(form, on) { Array.prototype.forEach.call(form.querySelectorAll("button"), function (b) { b.disabled = on; }); }

  /* ---------- Theme toggle (main.js isn't loaded here) ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".theme-toggle"), function (b) {
    b.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("jb-theme", next); } catch (e) {}
    });
  });

  if (!B.url || !B.key || !window.supabase || location.protocol === "file:") { show("v-config"); return; }

  // Never accept a password on an insecure page (a tampered http:// page could steal it).
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (location.protocol !== "https:" && !isLocal) {
    show("v-config");
    $("v-config").querySelector("h1").textContent = "Secure connection required 🔒";
    $("v-config").querySelector("p").textContent = "The studio only works over https://. Please open https://jamziebites.com/admin.html instead. (If that shows a warning, the site's security certificate isn't ready yet — wait and try again later.)";
    return;
  }

  var sb = window.supabase.createClient(B.url, B.key, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  /* ---------- Routing ---------- */
  async function route() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { show("v-login"); setTimeout(function () { $("l-email").focus(); }, 50); return; }
    var a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (a.error) { show("v-login"); return; }
    if (a.data.currentLevel === "aal2") return openApp();
    if (a.data.nextLevel === "aal2") { show("v-verify"); $("v-code").value = ""; setTimeout(function () { $("v-code").focus(); }, 50); return; }
    return startEnroll();
  }

  async function signOut() {
    try { await sb.auth.signOut(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    data = []; $("list").innerHTML = ""; closeDrawer();
    payments = []; paymentsLoaded = false; seenIds = {};
    $("pay-list").innerHTML = ""; $("pay-hist-list").innerHTML = ""; $("pay-box").hidden = true;
    show("v-login");
  }
  $("signout").addEventListener("click", signOut);

  /* ---------- Login (with a small client-side lockout on top of Supabase's own rate limits) ---------- */
  var fails = 0, lockedUntil = 0;
  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("l-err"); err.textContent = "";
    if (Date.now() < lockedUntil) { err.textContent = "Too many attempts — wait a minute and try again."; return; }
    var email = $("l-email").value.trim(), pass = $("l-pass").value;
    if (!email || !pass) { err.textContent = "Enter your email and password."; return; }
    busy(this, true);
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    busy(this, false);
    $("l-pass").value = "";
    if (r.error) {
      fails++;
      if (fails >= 5) { lockedUntil = Date.now() + 60000; fails = 0; }
      err.textContent = "That email and password didn't work.";
      return;
    }
    fails = 0;
    route();
  });

  /* ---------- 2FA enrollment ---------- */
  var enrollId = null;
  async function startEnroll() {
    show("v-enroll"); $("e-err").textContent = ""; $("e-code").value = "";
    var f = await sb.auth.mfa.listFactors();
    var all = (f.data && f.data.all) || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].factor_type === "totp" && all[i].status !== "verified") await sb.auth.mfa.unenroll({ factorId: all[i].id });
    }
    var r = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "JamzieBites studio " + new Date().toISOString().slice(0, 10) });
    if (r.error) { $("e-err").textContent = "Couldn't start 2-step setup: " + r.error.message; return; }
    enrollId = r.data.id;
    var qr = r.data.totp.qr_code || "";
    if (/^data:image\/svg\+xml/.test(qr)) $("qr").src = qr;
    $("secret").textContent = r.data.totp.secret;
  }
  $("enroll-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = $("e-code").value.replace(/\D/g, "");
    if (code.length !== 6) { $("e-err").textContent = "Enter the 6-digit code."; return; }
    busy(this, true);
    var r = await sb.auth.mfa.challengeAndVerify({ factorId: enrollId, code: code });
    busy(this, false);
    if (r.error) { $("e-err").textContent = "That code didn't match — try the newest one."; return; }
    toast("2-step login is on ✓");
    route();
  });

  /* ---------- 2FA verify ---------- */
  $("verify-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = $("v-code").value.replace(/\D/g, "");
    if (code.length !== 6) { $("v-err").textContent = "Enter the 6-digit code."; return; }
    busy(this, true);
    var f = await sb.auth.mfa.listFactors();
    var totp = f.data && f.data.totp && f.data.totp[0];
    if (!totp) { busy(this, false); return startEnroll(); }
    var r = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code });
    busy(this, false);
    $("v-code").value = "";
    if (r.error) { $("v-err").textContent = "That code didn't work — try the newest one."; return; }
    route();
  });

  /* ---------- Idle sign-out ---------- */
  var lastActive = Date.now();
  ["click", "keydown", "pointermove", "scroll", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (!$("v-app").hidden && Date.now() - lastActive > IDLE_MS) { signOut(); toast("Signed out after 30 minutes of inactivity."); }
  }, 30000);

  /* ======================================================================
     Dashboard
     ====================================================================== */
  var data = [], filter = "new", current = null;
  var STATUS_LABEL = { "new": "New", accepted: "Awaiting payment", paid: "Paid", in_progress: "In progress", done: "Done", declined: "Declined", cancelled: "Cancelled" };
  var STAGE_LABEL = { waiting: "In line", sketch: "Sketch", lineart: "Lineart", color: "Color", render: "Rendering", done: "Done" };
  var GROUPS = {
    "new": function (r) { return r.status === "new"; },
    accepted: function (r) { return r.status === "accepted"; },
    active: function (r) { return r.status === "paid" || r.status === "in_progress"; },
    done: function (r) { return r.status === "done"; },
    closed: function (r) { return r.status === "declined" || r.status === "cancelled"; },
    all: function () { return true; }
  };

  async function openApp() {
    var s = await sb.from("settings").select("status, slots_total").eq("id", 1).maybeSingle();
    if (s.error || !s.data) { show("v-denied"); return; }
    $("shop-status").value = s.data.status;
    $("shop-slots").value = s.data.slots_total;
    show("v-app");
    lastActive = Date.now();
    await load();
  }

  async function load() {
    var both = await Promise.all([
      sb.from("requests").select("*").order("created_at", { ascending: false }).limit(1000),
      sb.from("payments").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("notifications").select("*").order("created_at", { ascending: true }).limit(3000),
      sb.from("messages").select("*").order("created_at", { ascending: true }).limit(5000)
    ]);
    var r = both[0], p = both[1], n = both[2], mm = both[3];
    if (!mm.error) {
      var newClientMsgs = (mm.data || []).filter(function (x) { return x.sender === "client" && !x.read_by_artist && !seenMsgIds[x.id]; });
      if (msgsLoaded && newClientMsgs.length) toast("💬 New message from a client");
      newClientMsgs.forEach(function (x) { seenMsgIds[x.id] = true; });
      msgs = mm.data || []; msgsLoaded = true;
    }
    if (r.error) { toast("Couldn't load requests: " + r.error.message); return; }
    data = r.data || [];
    if (!n.error) notes = n.data || [];
    if (!p.error) {
      var fresh = (p.data || []).filter(function (x) { return !x.seen && x.state !== "processing" && !seenIds[x.id]; });
      if (paymentsLoaded && fresh.length) toast("💳 New payment from " + (fresh[0].customer_name || "a client") + " — " + money(fresh[0].amount));
      fresh.forEach(function (x) { seenIds[x.id] = true; });
      payments = p.data || [];
      paymentsLoaded = true;
    }
    render();
    renderPayments();
  }

  /* ---------- Payments (written by the Stripe webhook, never by this page) ---------- */
  var payments = [], paymentsLoaded = false, seenIds = {}, notes = [];
  var msgs = [], msgsLoaded = false, seenMsgIds = {}, mPicked = [];
  var M_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "application/zip", "application/x-zip-compressed"];
  function msgsFor(id) { return msgs.filter(function (x) { return x.request_id === id; }); }
  function unreadFor(id) { return msgs.filter(function (x) { return x.request_id === id && x.sender === "client" && !x.read_by_artist; }).length; }
  function fsize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((b || 0) / 1024)) + " KB"; }
  function safeName(n) { return (String(n).normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.\-]+/, "").slice(-80)) || "file"; }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  var SITE = "https://jamziebites.com";
  function privateLink(r) { return r && /^[0-9a-f]{36}$/.test(r.token || "") ? SITE + "/request.html?t=" + r.token : ""; }
  var NOTE_KIND = { received: "Got your request", accepted: "Accepted + pay link", paid: "Payment received", started: "Work started", done: "Finished", declined: "Declined" };
  function notesFor(id) { return notes.filter(function (x) { return x.request_id === id; }); }
  function failedNotes(id) { return notesFor(id).filter(function (x) { return x.status === "failed" || (x.status === "pending" && x.attempts > 1); }); }
  var PAY_STATE = {
    ok: ["✅", "Paid"],
    attention: ["⚠️", "Needs a look"],
    processing: ["⏳", "Processing"],
    failed: ["✕", "Didn't go through"]
  };
  function payItem(x, withButton) {
    var st = PAY_STATE[x.state] || ["💳", x.state];
    var req = x.request_id && data.filter(function (r) { return r.id === x.request_id; })[0];
    var who = x.customer_name || x.customer_email || "Someone";
    return '<div class="adm-pay-item pay-' + esc(x.state) + '">' +
      '<span class="adm-pay-ico" aria-hidden="true">' + st[0] + '</span>' +
      '<div class="adm-pay-main"><b>' + money(x.amount) + (x.currency && x.currency !== "usd" ? " " + esc(x.currency.toUpperCase()) : "") +
      '</b> from ' + esc(who) + ' <span class="adm-pill pay-pill-' + esc(x.state) + '">' + esc(st[1]) + '</span>' +
      '<small>' + esc(when(x.created_at)) +
      (req ? ' · for <button type="button" class="adm-linkbtn" data-open="' + esc(req.id) + '">' + esc(req.name) + " · " + esc(req.code) + "</button>"
           : /^TIP\b/i.test(x.code_given || "") ? " · 💝 tip" : (x.code_given ? " · code given: " + esc(x.code_given) : " · no request code")) +
      (x.customer_email && x.customer_name ? " · " + esc(x.customer_email) : "") + '</small>' +
      (x.note ? '<small class="adm-pay-note">' + esc(x.note) + "</small>" : "") + '</div>' +
      (withButton ? '<button type="button" class="btn btn-sm" data-seen="' + esc(x.id) + '">Got it</button>' : "") +
      "</div>";
  }
  function renderPayments() {
    var unseen = payments.filter(function (x) { return !x.seen && x.state !== "processing"; });
    var attention = unseen.filter(function (x) { return x.state === "attention"; }).length;
    $("pay-box").hidden = !unseen.length;
    $("pay-box").classList.toggle("adm-pay-warn", attention > 0);
    $("pay-title").textContent = attention
      ? "⚠️ " + attention + " payment" + (attention > 1 ? "s need" : " needs") + " a look" + (unseen.length > attention ? " · " + (unseen.length - attention) + " new" : "")
      : "💳 " + unseen.length + " new payment" + (unseen.length > 1 ? "s" : "");
    $("pay-list").innerHTML = unseen.map(function (x) { return payItem(x, true); }).join("");
    $("c-pay").textContent = payments.length ? payments.length : "";
    $("pay-hist-list").innerHTML = payments.length
      ? payments.slice(0, 50).map(function (x) { return payItem(x, false); }).join("")
      : '<p class="adm-muted adm-small">No payments yet.</p>';
    var newN = data.filter(GROUPS["new"]).length;
    document.title = (unseen.length ? "(💳" + unseen.length + ") " : "") + (newN ? "(" + newN + ") " : "") + "Studio · JamzieBites";
  }
  async function markSeen(ids) {
    if (!ids.length) return;
    var r = await sb.from("payments").update({ seen: true }).in("id", ids).select("id");
    if (r.error) { toast("Couldn't update: " + r.error.message); return; }
    payments = payments.map(function (x) { return ids.indexOf(x.id) > -1 ? Object.assign({}, x, { seen: true }) : x; });
    renderPayments();
  }
  function onPayClick(e) {
    var o = e.target.closest("[data-open]");
    if (o) { openDrawer(o.getAttribute("data-open")); return; }
    var s = e.target.closest("[data-seen]");
    if (s) markSeen([s.getAttribute("data-seen")]);
  }
  $("pay-list").addEventListener("click", onPayClick);
  $("pay-hist-list").addEventListener("click", onPayClick);
  $("pay-seen-all").addEventListener("click", function () {
    markSeen(payments.filter(function (x) { return !x.seen && x.state !== "processing"; }).map(function (x) { return x.id; }));
  });

  function render() {
    var q = $("search").value.trim().toLowerCase();
    Object.keys(GROUPS).forEach(function (k) {
      var n = data.filter(GROUPS[k]).length;
      $("c-" + k).textContent = n ? n : "";
    });
    var newN = data.filter(GROUPS["new"]).length;
    $("s-new").textContent = newN;
    $("s-await").textContent = data.filter(GROUPS.accepted).length;
    $("s-active").textContent = data.filter(GROUPS.active).length;
    $("s-earned").textContent = money(data.filter(function (r) { return /^(paid|in_progress|done)$/.test(r.status); })
      .reduce(function (t, r) { return t + (Number(r.paid_amount) > 0 ? Number(r.paid_amount) : Number(r.price || 0)); }, 0));

    var rows = data.filter(GROUPS[filter]).filter(function (r) {
      if (!q) return true;
      return [r.code, r.name, r.contact, r.email, r.discord, r.type, r.character_name].join(" ").toLowerCase().indexOf(q) > -1;
    });
    if (!rows.length) { $("list").innerHTML = '<div class="card adm-empty">Nothing here yet ✨</div>'; return; }
    $("list").innerHTML = rows.map(function (r) {
      return '<button type="button" class="card adm-row" data-id="' + esc(r.id) + '">' +
        '<span class="adm-row-main"><b>' + esc(r.name) + '</b> <span class="adm-code-pill">' + esc(r.code) + '</span>' +
        (r.nsfw ? ' <span class="adm-pill adm-nsfw">18+</span>' : "") +
        (unreadFor(r.id) ? ' <span class="adm-pill adm-msgnew">💬 ' + unreadFor(r.id) + " new</span>" : "") +
        (failedNotes(r.id).length ? ' <span class="adm-pill adm-msgfail" title="A message to this client hasn&#39;t gone through">✉️ not delivered</span>' : "") +
        '<small>' + esc(r.type) + (r.character_name ? " · " + esc(r.character_name) : "") + " · " + esc(when(r.created_at)) + '</small></span>' +
        '<span class="adm-row-side"><span class="adm-pill st-' + esc(r.status) + '">' + esc(STATUS_LABEL[r.status] || r.status) + '</span>' +
        '<small>' + money(r.price) + (/^(paid|in_progress)$/.test(r.status) ? " · " + esc(STAGE_LABEL[r.stage]) : "") + '</small></span></button>';
    }).join("");
  }

  $("filters").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    filter = b.getAttribute("data-f");
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
    render();
  });
  $("search").addEventListener("input", render);
  $("refresh").addEventListener("click", function () { load().then(function () { toast("Up to date ✓"); }); });
  setInterval(function () { if (!$("v-app").hidden && $("drawer").hidden && !document.hidden) load(); }, 60000);

  $("shop-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var slots = parseInt($("shop-slots").value, 10);
    if (!(slots >= 0 && slots <= 100)) { toast("Slots must be 0–100."); return; }
    busy(this, true);
    var r = await sb.from("settings").update({ status: $("shop-status").value, slots_total: slots }).eq("id", 1).select();
    busy(this, false);
    toast(r.error || !r.data || !r.data.length ? "Couldn't save shop status." : "Shop status saved — live on the site ✓");
  });

  /* ---------- Detail drawer ---------- */
  function linkify(text) {
    return esc(text).split(/\n/).map(function (line) {
      return line.replace(/https:\/\/[^\s<>"']+/g, function (u) {
        return '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + u + "</a>";
      });
    }).join("<br>");
  }
  function field(label, html) { return html ? '<div class="adm-field"><span>' + label + "</span><div>" + html + "</div></div>" : ""; }

  function openDrawer(id) {
    current = data.filter(function (r) { return r.id === id; })[0];
    if (!current) return;
    var r = current;
    $("d-title").textContent = r.name + " · " + r.code;
    $("d-sub").textContent = "Received " + when(r.created_at) + (r.updated_at !== r.created_at ? " · updated " + when(r.updated_at) : "");
    $("d-body").innerHTML =
      field("Contact", (r.email ? '✉️ <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : "") +
        (r.email && r.discord ? "<br>" : "") + (r.discord ? "💬 Discord: <b>" + esc(r.discord) + "</b>" : "") +
        (!r.email && !r.discord ? esc(r.contact) + ' <small class="adm-muted">(no email/Discord on file, so no automatic messages)</small>' : "")) +
      field("Client's page", privateLink(r) ? '<button type="button" class="btn btn-sm" data-copy-link>Copy private link</button> <a class="btn btn-sm" href="' +
        esc(privateLink(r)) + '" target="_blank" rel="noopener noreferrer">Open</a><br><small class="adm-muted">Their status page with a Pay button. It is sent to them automatically.</small>' : "") +
      '<div id="d-msgs"></div>' +
      field("Type", esc(r.type) + (r.nsfw ? ' <span class="adm-pill adm-nsfw">NSFW · 18+ confirmed</span>' : "")) +
      field("Character", esc(r.character_name) + (r.has_character === "design" ? ' <span class="adm-pill">needs a new design</span>' : r.has_character === "yes" ? ' <small class="adm-muted">(has their own character)</small>' : "")) +
      field("References", linkify(r.refs)) +
      field("Idea", linkify(r.description)) +
      field("Quote estimate", r.quote ? '<pre class="adm-pre">' + esc(r.quote) + "</pre>" : "") +
      field("Payments", (function () {
        var mine = payments.filter(function (x) { return x.request_id === r.id; });
        if (!mine.length && !(Number(r.paid_amount) > 0)) return "";
        return (Number(r.paid_amount) > 0 ? "<b>" + money(r.paid_amount) + " received</b>" +
          (r.price != null ? " of " + money(r.price) : "") + (r.paid_at ? " · paid in full " + esc(when(r.paid_at)) : "") : "") +
          mine.map(function (x) {
            return '<br><small class="adm-muted">' + (PAY_STATE[x.state] || ["💳"])[0] + " " + money(x.amount) + " · " + esc(when(x.created_at)) +
              (x.customer_email ? " · " + esc(x.customer_email) : "") + "</small>";
          }).join("");
      })()) +
      field("Deadline", esc(r.deadline)) +
      field("Found you via", r.source ? "<b>" + esc(r.source) + "</b>" : "") +
      field("Privacy", esc(r.privacy));
    renderMsgs();
    mPicked = []; renderMPicked(); $("d-mtext").value = ""; $("d-merr").textContent = "";
    renderThread();
    markRead(r.id);
    $("d-status").value = r.status;
    $("d-email").value = r.email || "";
    $("d-discord").value = r.discord || "";
    $("d-price").value = r.price == null ? "" : r.price;
    $("d-stage").value = r.stage;
    $("d-qname").value = r.queue_name || "";
    $("d-show").checked = !!r.show_in_queue;
    $("d-notes").value = r.admin_notes || "";
    $("d-err").textContent = "";
    $("d-confirm").hidden = true;
    $("drawer").hidden = false; $("drawer-bg").hidden = false;
    document.body.style.overflow = "hidden";
    $("d-close").focus();
  }
  async function renderThread() {
    if (!current) return;
    var id = current.id, list = msgsFor(id);
    $("d-chat-sub").textContent = privateLink(current) ? "· they see these on their request page" : "";
    if (!list.length) { $("d-thread").innerHTML = '<p class="adm-muted adm-small">No messages yet. Send a sketch or a question below ✨</p>'; return; }
    var paths = [];
    list.forEach(function (m) { (m.files || []).forEach(function (f) { if (f && f.path) paths.push(f.path); }); });
    var urls = {};
    if (paths.length) {
      var s = await sb.storage.from("portal").createSignedUrls(paths, 3600);
      (s.data || []).forEach(function (d) { if (d.signedUrl) urls[d.path] = d.signedUrl; });
    }
    if (!current || current.id !== id) return;
    $("d-thread").innerHTML = list.map(function (m) {
      var mine = m.sender === "artist";
      var files = (m.files || []).map(function (f) {
        var u = urls[f.path];
        if (!u) return '<span class="adm-doc">' + esc(f.name) + "</span>";
        return /^image\//.test(f.type || "")
          ? '<a class="adm-thumb" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(u) + '" alt="' + esc(f.name) + '" loading="lazy"></a>'
          : '<a class="adm-doc" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">📄 ' + esc(f.name) + " · " + esc(fsize(f.size)) + "</a>";
      }).join("");
      return '<div class="adm-bubble ' + (mine ? "me" : "them") + '"><small>' + (mine ? "You" : esc(current.name)) + " · " + esc(when(m.created_at)) + "</small>" +
        (m.body ? '<p>' + esc(m.body) + "</p>" : "") + (files ? '<div class="adm-files">' + files + "</div>" : "") + "</div>";
    }).join("");
    $("d-thread").scrollTop = $("d-thread").scrollHeight;
  }
  async function markRead(id) {
    if (!unreadFor(id)) return;
    var r = await sb.from("messages").update({ read_by_artist: true }).eq("request_id", id).eq("sender", "client").eq("read_by_artist", false).select("id");
    if (!r.error) { msgs = msgs.map(function (x) { return x.request_id === id && x.sender === "client" ? Object.assign({}, x, { read_by_artist: true }) : x; }); render(); }
  }
  function renderMPicked() {
    $("d-mfiles-list").innerHTML = mPicked.map(function (f, i) {
      return '<li><span>' + esc(f.name) + " <small>" + esc(fsize(f.size)) + '</small></span><button type="button" class="file-x" data-rm="' + i + '" aria-label="Remove">✕</button></li>';
    }).join("");
  }
  $("d-mfiles").addEventListener("change", function () {
    var skipped = [];
    Array.prototype.forEach.call(this.files || [], function (f) {
      if (mPicked.length >= 10) return skipped.push(f.name + " (10 max)");
      if (M_TYPES.indexOf(f.type) < 0) return skipped.push(f.name + " (type)");
      if (f.size > 25 * 1024 * 1024) return skipped.push(f.name + " (over 25 MB)");
      mPicked.push(f);
    });
    this.value = ""; renderMPicked();
    $("d-merr").textContent = skipped.length ? "Skipped: " + skipped.join(", ") : "";
  });
  $("d-mfiles-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    mPicked.splice(Number(b.getAttribute("data-rm")), 1); renderMPicked();
  });
  $("d-mform").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!current) return;
    var text = $("d-mtext").value.trim();
    if (!text && !mPicked.length) { $("d-merr").textContent = "Write a message or attach a file."; return; }
    var id = current.id, btn = $("d-msend"), files = [];
    btn.disabled = true; $("d-merr").textContent = "";
    try {
      for (var i = 0; i < mPicked.length; i++) {
        var f = mPicked[i];
        btn.textContent = "Uploading " + (i + 1) + " of " + mPicked.length + "…";
        var path = "requests/" + id + "/artist/" + uuid() + "-" + safeName(f.name);
        var up = await sb.storage.from("portal").upload(path, f, { contentType: f.type, upsert: false });
        if (up.error) throw new Error(f.name + ": " + up.error.message);
        files.push({ path: path, name: f.name, size: f.size, type: f.type });
      }
      btn.textContent = "Sending…";
      var ins = await sb.from("messages").insert({ request_id: id, sender: "artist", body: text || null, files: files }).select();
      if (ins.error) throw new Error(ins.error.message);
      msgs = msgs.concat(ins.data || []);
      $("d-mtext").value = ""; mPicked = []; renderMPicked();
      toast((current.email || current.discord) ? "Sent ✓ " + current.name + " gets a ping" : "Sent ✓ (no email/Discord on file, so no ping)");
      renderThread();
      setTimeout(reloadNotes, 2500);
    } catch (x) {
      $("d-merr").textContent = "Couldn't send: " + x.message;
    }
    btn.disabled = false; btn.textContent = "Send to client ✦";
  });

  function renderMsgs() {
    if (!current || !$("d-msgs")) return;
    var mine = notesFor(current.id);
    $("d-msgs").innerHTML = field("Messages", mine.length ? mine.map(function (x) {
      var ico = x.status === "sent" ? "✅" : x.status === "failed" ? "❌" : "⏳";
      return '<div class="adm-msg">' + ico + " <b>" + esc(NOTE_KIND[x.kind] || x.kind) + "</b> · " + (x.channel === "email" ? "email" : "Discord") +
        " · " + esc(when(x.sent_at || x.created_at)) +
        (x.status !== "sent" && x.last_error ? '<br><small class="adm-muted">' + esc(x.last_error) + "</small>" : "") +
        (x.status === "failed" ? ' <button type="button" class="btn btn-sm" data-resend="' + esc(x.id) + '">Send again</button>' : "") + "</div>";
    }).join("") : (current.email || current.discord ? '<small class="adm-muted">Nothing yet.</small>' : ""));
  }
  async function reloadNotes() {
    var n = await sb.from("notifications").select("*").order("created_at", { ascending: true }).limit(3000);
    if (!n.error) { notes = n.data || []; renderMsgs(); render(); }
  }
  $("d-body").addEventListener("click", async function (e) {
    if (e.target.closest("[data-copy-link]") && current) { copy(privateLink(current), "Private link copied ✓"); return; }
    var b = e.target.closest("[data-resend]");
    if (!b) return;
    b.disabled = true;
    var r = await sb.from("notifications").update({ status: "pending", next_try_at: new Date().toISOString(), attempts: 0 }).eq("id", b.getAttribute("data-resend")).select();
    toast(r.error || !r.data || !r.data.length ? "Couldn't resend." : "Sending again within a minute ✓");
    setTimeout(reloadNotes, 1500);
  });
  function closeDrawer() { $("drawer").hidden = true; $("drawer-bg").hidden = true; document.body.style.overflow = ""; current = null; }
  $("list").addEventListener("click", function (e) { var b = e.target.closest(".adm-row"); if (b) openDrawer(b.getAttribute("data-id")); });
  $("d-close").addEventListener("click", closeDrawer);
  $("drawer-bg").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("drawer").hidden) closeDrawer(); });

  async function save(patch, okMsg) {
    if (!current) return false;
    $("d-err").textContent = "";
    var r = await sb.from("requests").update(patch).eq("id", current.id).select();
    if (r.error || !r.data || !r.data.length) { $("d-err").textContent = "Couldn't save: " + (r.error ? r.error.message : "no permission"); return false; }
    var updated = r.data[0];
    data = data.map(function (x) { return x.id === updated.id ? updated : x; });
    current = updated;
    render();
    toast(okMsg || "Saved ✓");
    setTimeout(reloadNotes, 2500); setTimeout(reloadNotes, 8000);
    return true;
  }
  function formPatch() {
    var price = $("d-price").value.trim();
    return {
      status: $("d-status").value,
      price: price === "" ? null : Math.round(Number(price) * 100) / 100,
      stage: $("d-stage").value,
      queue_name: $("d-qname").value.trim().slice(0, 60) || "Anonymous",
      show_in_queue: $("d-show").checked,
      admin_notes: $("d-notes").value.slice(0, 6000) || null,
      email: $("d-email").value.trim().toLowerCase() || null,
      discord: $("d-discord").value.trim().replace(/^@+/, "").toLowerCase() || null
    };
  }
  $("d-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p = formPatch();
    if (p.price != null && !(p.price >= 0)) { $("d-err").textContent = "Price must be a number."; return; }
    if (p.status === "done") p.stage = "done";
    if (await save(p)) closeDrawer();
  });

  $("d-accept").addEventListener("click", async function () {
    var p = formPatch();
    if (!(p.price > 0)) { $("d-err").textContent = "Enter the final price first, then accept."; $("d-price").focus(); return; }
    p.status = "accepted";
    var auto = !!(p.email || p.discord);
    if (!(await save(p, auto ? "Accepted ✓ " + current.name + " is being sent their price + pay link automatically" : "Accepted ✓"))) return;
    var r = current;
    $("d-status").value = "accepted";
    if (auto) return;
    // Requests without email/Discord: copy a message to send by hand.
    var msg = "Hi " + r.name + "! 🍓 Your commission request " + r.code + " has been accepted!\n\n" +
      "Final price: " + money(r.price) + " USD\n" +
      "Pay here (your price is filled in for you): " + privateLink(r) + "\n\n" +
      "Your slot is secured once payment is received. Thank you so much! ♡ — Jamzie";
    copy(msg, "Accepted ✓ — message copied, paste it to " + r.name);
  });
  $("d-paid").addEventListener("click", async function () {
    var p = formPatch(); p.status = "paid"; if (p.stage === "done") p.stage = "waiting";
    if (await save(p, "Marked paid ✓ — it's in the public queue")) $("d-status").value = "paid";
  });
  $("d-decline").addEventListener("click", async function () {
    var p = formPatch(); p.status = "declined";
    if (await save(p, "Declined")) closeDrawer();
  });
  $("d-delete").addEventListener("click", function () { $("d-confirm").hidden = false; });
  $("d-delete-no").addEventListener("click", function () { $("d-confirm").hidden = true; });
  $("d-delete-yes").addEventListener("click", async function () {
    if (!current) return;
    var id = current.id;
    try {
      for (var who of ["client", "artist"]) {
        var ls = await sb.storage.from("portal").list("requests/" + id + "/" + who, { limit: 1000 });
        var names = (ls.data || []).map(function (o) { return "requests/" + id + "/" + who + "/" + o.name; });
        if (names.length) await sb.storage.from("portal").remove(names);
      }
    } catch (x) { /* files are private anyway; the request delete still goes ahead */ }
    var r = await sb.from("requests").delete().eq("id", id).select();
    if (r.error || !r.data || !r.data.length) { $("d-err").textContent = "Couldn't delete."; return; }
    data = data.filter(function (x) { return x.id !== id; });
    closeDrawer(); render(); toast("Deleted");
  });

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") show("v-login"); });
  route();
})();
