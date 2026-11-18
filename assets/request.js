/* JamzieBites: a client's private request page (request.html?t=TOKEN)
   Shows status and progress, plus a Pay button for exactly what's owed once
   Jamzie accepts. The price comes from the database, never from this page. */
(function () {
  "use strict";
  var C = window.JAMZIE || {};
  var BK = C.backend || {};
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var token = (params.get("t") || "").toLowerCase();
  var justPaid = params.get("paid") === "1";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function when(d) { try { return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }); } catch (e) { return ""; } }
  function okBackend() { return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(BK.url || "") && /^sb_publishable_[A-Za-z0-9_-]+$/.test(BK.key || ""); }
  function missing() { $("r-lead").textContent = "Hmm, this link doesn't look right."; $("r-missing").hidden = false; }

  if (!/^[0-9a-f]{36}$/.test(token) || !okBackend()) { missing(); return; }
  // Keep the private token out of the address bar history entry's "paid" flag.
  if (justPaid) { try { history.replaceState(null, "", "request.html?t=" + token); } catch (e) {} }

  function load() {
    return fetch(BK.url + "/rest/v1/rpc/request_status", {
      method: "POST",
      headers: { apikey: BK.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token })
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  var STEPS = [["new", "Requested"], ["accepted", "Accepted"], ["paid", "Paid"], ["sketch", "Sketch"],
               ["lineart", "Lineart"], ["color", "Color"], ["render", "Rendering"], ["done", "Done"]];
  var STATUS = {
    "new": ["Waiting for review", "st-new"], accepted: ["Accepted · awaiting payment", "st-accepted"],
    paid: ["Paid · in the queue", "st-paid"], in_progress: ["In progress", "st-paid"],
    done: ["Finished!", "st-done"], declined: ["Not accepted", "st-closed"], cancelled: ["Cancelled", "st-closed"]
  };
  function stepIndex(r) {
    if (r.status === "new") return 0;
    if (r.status === "accepted") return 1;
    if (r.status === "done") return 7;
    var s = { sketch: 3, lineart: 4, color: 5, render: 6, done: 7 }[r.stage];
    return s || 2;
  }

  function render(r) {
    $("r-card").hidden = false;
    $("r-title").textContent = r.type + (r.character ? " · " + r.character : "");
    $("r-meta").innerHTML = "For <strong>" + esc(r.name) + "</strong> · requested " + esc(when(r.created_at)) +
      ' · <span class="req-code">' + esc(r.code) + "</span>";
    var st = STATUS[r.status] || [r.status, ""];
    $("r-status").textContent = st[0];
    $("r-status").className = "req-status " + st[1];
    document.title = st[0] + " · Your Commission · JamzieBites";

    var closed = r.status === "declined" || r.status === "cancelled";
    var at = stepIndex(r);
    $("r-steps").hidden = closed;
    $("r-steps").innerHTML = STEPS.map(function (s, i) {
      return '<li class="' + (i < at ? "done" : i === at ? "now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + "><span>" + esc(s[1]) + "</span></li>";
    }).join("");

    var notes = {
      "new": "Thank you for your request! Jamzie will look it over soon. If it's accepted, you'll get a message with your final price, and a Pay button will appear right here. Please don't pay anything before then.",
      accepted: "Yay, your commission was accepted! 🎉 Pay below to lock in your slot. Work begins once payment goes through.",
      paid: "Payment received, thank you! ♡ You're in the queue. This page shows each stage as your piece comes together.",
      in_progress: "Jamzie is working on your piece right now! ✏️",
      done: "Your commission is finished! 🎨 Thank you so much for commissioning Jamzie. ♡",
      declined: "Unfortunately Jamzie can't take this one on right now. Nothing has been charged. Thank you for asking, and maybe next time! ♡",
      cancelled: "This request was cancelled."
    };
    $("r-note").textContent = notes[r.status] || "";
    $("r-lead").textContent = closed ? "This request is closed." : "Here's where your commission is at. ♡";

    var owed = Number(r.owed || 0);
    var canPay = r.status === "accepted" && owed > 0;
    $("r-pay").hidden = !canPay;
    if (canPay) {
      $("r-price").textContent = money(owed) + (Number(r.paid) > 0 ? " left (of " + money(r.price) + ")" : "");
      $("r-paylabel").textContent = "Pay " + money(owed) + " securely";
    }
    $("r-via").textContent = r.via ? "Updates are also sent to you by " + r.via + "." : "";
    $("r-paid-banner").hidden = !(justPaid && r.status !== "accepted");
  }

  var tries = 0;
  function refresh() {
    return load().then(function (r) {
      if (!r) { missing(); return; }
      render(r);
      // Just back from Stripe: the payment can take a few seconds to register.
      if (justPaid && r.status === "accepted" && tries++ < 10) {
        $("r-note").textContent = "Confirming your payment with Stripe… this only takes a moment.";
        setTimeout(refresh, 2500);
      }
    }).catch(function () {
      $("r-lead").textContent = "Couldn't load your request right now. Please refresh in a moment.";
    });
  }
  refresh();

  $("r-paybtn").addEventListener("click", function () {
    var btn = this, err = $("r-payerr");
    err.textContent = "";
    btn.disabled = true;
    var label = $("r-paylabel").textContent;
    $("r-paylabel").textContent = "Opening secure checkout…";
    fetch(BK.url + "/functions/v1/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token })
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
      var u = null;
      try { u = new URL(j.url); } catch (e) {}
      if (u && u.protocol === "https:" && /^(checkout|buy)\.stripe\.com$/.test(u.hostname)) {
        if (j.fallback) {
          err.textContent = "At checkout, please enter " + money(j.amount) + " as the amount. Taking you there now…";
          setTimeout(function () { location.href = u.toString(); }, 2200);
        } else {
          location.href = u.toString();
        }
        return;
      }
      throw new Error(j.error || "Couldn't open checkout. Please try again.");
    }).catch(function (e) {
      err.textContent = e.message;
      btn.disabled = false;
      $("r-paylabel").textContent = label;
      refresh();
    });
  });
})();
