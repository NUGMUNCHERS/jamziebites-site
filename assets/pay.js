/* JamzieBites: Pay page (pay.html)
   - Commission payments: look up the request by code and open a Stripe
     checkout for exactly what's owed (the price comes from the database).
   - Tips: any amount from $1 to $1,000, no code needed.
   Only ever redirects to Stripe's own checkout domains. */
(function () {
  "use strict";
  var C = window.JAMZIE || {};
  var BK = C.backend || {};
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  // Old-style links with a private token go to the request page.
  var t = (params.get("t") || "").toLowerCase();
  if (/^[0-9a-f]{36}$/.test(t)) { location.replace("request.html?t=" + t); return; }

  if (params.get("paid") === "1" || params.get("tipped") === "1") {
    if (params.get("tipped") === "1") {
      $("thanks-title").textContent = "Thank you so much for the tip! 💝";
      $("thanks-text").textContent = "It truly means the world and helps me keep drawing. Stripe has emailed you a receipt. ♡";
    }
    $("pay-thanks").hidden = false;
    $("pay-main").hidden = true;
    return;
  }

  var money = function (n) { return "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  var okBackend = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(BK.url || "");

  function checkout(body, errEl, btn, labelEl, busyText) {
    errEl.textContent = "";
    var label = labelEl.textContent;
    btn.disabled = true; labelEl.textContent = busyText;
    var reset = function () { btn.disabled = false; labelEl.textContent = label; };
    if (!okBackend) { errEl.textContent = "Online payment isn't available right now. Please message Jamzie."; reset(); return; }
    fetch(BK.url + "/functions/v1/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (j) {
      var u = null;
      try { u = new URL(j.url); } catch (e) {}
      if (u && u.protocol === "https:" && /^(checkout|buy)\.stripe\.com$/.test(u.hostname)) {
        if (j.fallback && j.amount) {
          errEl.textContent = "At checkout, please enter " + money(j.amount) + " as the amount. Taking you there now…";
          setTimeout(function () { location.href = u.toString(); }, 2200);
        } else {
          location.href = u.toString();
        }
        return;
      }
      throw new Error(j.error || "Couldn't open checkout. Please try again.");
    }).catch(function (e) { errEl.textContent = e.message; reset(); });
  }

  /* ---------- Commission payment by code ---------- */
  var form = $("pay-form");
  form.addEventListener("input", function (e) { var f = e.target.closest(".field"); if (f) f.classList.remove("invalid"); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var user = $("p-user");
    var code = user.value.trim().toUpperCase().replace(/\s+/g, "");
    if (/^JB[A-F0-9]{6}$/.test(code)) code = "JB-" + code.slice(2);
    if (!/^JB-[A-F0-9]{6}$/.test(code)) { user.closest(".field").classList.add("invalid"); user.focus(); return; }
    checkout({ code: code }, $("p-err"), $("p-go"), $("p-go-label"), "Opening secure checkout…");
  });

  /* ---------- Tips ---------- */
  var amt = $("tip-amt");
  function syncTip() {
    var v = Number(amt.value);
    $("tip-label").textContent = v >= 1 && v <= 1000 ? "Tip " + money(v) + " ♡" : "Send a tip ♡";
    Array.prototype.forEach.call($("tip-amounts").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-amt")) === v));
    });
  }
  $("tip-amounts").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    amt.value = b.getAttribute("data-amt");
    amt.closest(".field").classList.remove("invalid");
    syncTip();
  });
  amt.addEventListener("input", function () { amt.closest(".field").classList.remove("invalid"); syncTip(); });
  syncTip();
  $("tip-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = Math.round(Number(amt.value) * 100) / 100;
    if (!(v >= 1 && v <= 1000)) { amt.closest(".field").classList.add("invalid"); amt.focus(); return; }
    checkout({ tip: v }, $("tip-err"), $("tip-go"), $("tip-label"), "Opening secure checkout…");
  });
})();
