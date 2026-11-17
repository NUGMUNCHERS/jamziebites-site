/* JamzieBites — Pay page (pay.html) */
(function () {
  "use strict";
  var cfg = (window.JAMZIE && window.JAMZIE.payments) || {};
  var $ = function (id) { return document.getElementById(id); };

  // Only ever send clients to Stripe's own checkout domain over HTTPS.
  var link = null;
  try {
    var u = new URL(cfg.stripeLink || "");
    if (u.protocol === "https:" && u.hostname === "buy.stripe.com") link = u;
  } catch (e) { link = null; }

  if (new URLSearchParams(location.search).get("paid") === "1") {
    $("pay-thanks").hidden = false;
    $("pay-main").hidden = true;
    return;
  }
  if (link && /\/test_/.test(link.pathname)) $("test-banner").hidden = false;
  if (!link) {
    $("p-go").disabled = true;
    $("pay-unavailable").hidden = false;
  }

  var form = $("pay-form");
  form.addEventListener("input", function (e) {
    var f = e.target.closest(".field"); if (f) f.classList.remove("invalid");
    var c = e.target.closest(".check"); if (c) c.classList.remove("invalid");
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!link) return;
    var bad = null;
    var user = $("p-user");
    if (!user.value.trim()) { user.closest(".field").classList.add("invalid"); bad = bad || user; }
    ["p-accepted", "p-tos"].forEach(function (id) {
      var cb = $(id);
      if (!cb.checked) { cb.closest(".check").classList.add("invalid"); bad = bad || cb; }
    });
    if (bad) { bad.focus(); return; }

    // Tag the payment with the client's username so Jamzie can match it up.
    var ref = user.value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 190) || "client";
    var url = new URL(link.toString());
    url.searchParams.set("client_reference_id", ref);
    location.href = url.toString();
  });
})();
