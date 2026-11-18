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
    var r = await sb.from("requests").select("*").order("created_at", { ascending: false }).limit(1000);
    if (r.error) { toast("Couldn't load requests: " + r.error.message); return; }
    data = r.data || [];
    render();
  }

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
      .reduce(function (t, r) { return t + Number(r.price || 0); }, 0));
    document.title = (newN ? "(" + newN + ") " : "") + "Studio · JamzieBites";

    var rows = data.filter(GROUPS[filter]).filter(function (r) {
      if (!q) return true;
      return [r.code, r.name, r.contact, r.type, r.character_name].join(" ").toLowerCase().indexOf(q) > -1;
    });
    if (!rows.length) { $("list").innerHTML = '<div class="card adm-empty">Nothing here yet ✨</div>'; return; }
    $("list").innerHTML = rows.map(function (r) {
      return '<button type="button" class="card adm-row" data-id="' + esc(r.id) + '">' +
        '<span class="adm-row-main"><b>' + esc(r.name) + '</b> <span class="adm-code-pill">' + esc(r.code) + '</span>' +
        (r.nsfw ? ' <span class="adm-pill adm-nsfw">18+</span>' : "") +
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
      field("Contact", esc(r.contact)) +
      field("Type", esc(r.type) + (r.nsfw ? ' <span class="adm-pill adm-nsfw">NSFW · 18+ confirmed</span>' : "")) +
      field("Character", esc(r.character_name)) +
      field("References", linkify(r.refs)) +
      field("Idea", linkify(r.description)) +
      field("Quote estimate", r.quote ? '<pre class="adm-pre">' + esc(r.quote) + "</pre>" : "") +
      field("Deadline", esc(r.deadline)) +
      field("Privacy", esc(r.privacy));
    $("d-status").value = r.status;
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
      admin_notes: $("d-notes").value.slice(0, 6000) || null
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
    if (!(await save(p, "Accepted ✓ — message copied"))) return;
    var r = current;
    var msg = "Hi " + r.name + "! 🍓 Your commission request " + r.code + " has been accepted!\n\n" +
      "Final price: " + money(r.price) + " USD\n" +
      "Pay here: https://jamziebites.com/pay.html\n" +
      "→ Enter your request code " + r.code + " and the amount " + money(r.price) + " at checkout.\n\n" +
      "Your slot is secured once payment is received. Thank you so much! ♡ — Jamzie";
    copy(msg, "Accepted ✓ — message copied, paste it to " + r.name);
    $("d-status").value = "accepted";
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
    var r = await sb.from("requests").delete().eq("id", id).select();
    if (r.error || !r.data || !r.data.length) { $("d-err").textContent = "Couldn't delete."; return; }
    data = data.filter(function (x) { return x.id !== id; });
    closeDrawer(); render(); toast("Deleted");
  });

  sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") show("v-login"); });
  route();
})();
