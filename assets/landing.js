/* Fills [data-price="…"] on the landing pages from config.js, so prices stay in sync
   with the main price list. The HTML already contains today's prices as a fallback. */
(function () {
  var C = window.JAMZIE || {};
  var P = C.pricing;
  if (!P) return;
  var money = function (n) { return "$" + Math.round(n); };
  var find = function (list, id) { for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i]; return null; };
  var addon = function (id) { var a = find(P.addons, id); return a ? a.min : null; };
  var get = {
    "headshot": function () { var s = find(P.sizes, "headshot"); return s && s.price; },
    "half": function () { var s = find(P.sizes, "half"); return s && s.price; },
    "full": function () { var s = find(P.sizes, "full"); return s && s.price; },
    "full-render": function () { var s = find(P.sizes, "full"); return s && s.price + s.render; },
    "chibi-headshot": function () { var s = find(P.chibi, "headshot"); return s && s.price; },
    "chibi-half": function () { var s = find(P.chibi, "half"); return s && s.price; },
    "chibi-full": function () { var s = find(P.chibi, "full"); return s && s.price; },
    "sticker-single": function () { var s = find(P.stickers, "single"); return s && s.price; },
    "sticker-pack5": function () { var s = find(P.stickers, "pack5"); return s && s.price; },
    "sticker-pack10": function () { var s = find(P.stickers, "pack10"); return s && s.price; },
    "ref-simple": function () { var s = find(P.refSheets, "simple"); return s && s.price; },
    "ref-deluxe": function () { var s = find(P.refSheets, "deluxe"); return s && s.price; },
    "design": function () { return addon("design"); },
    "expression": function () { return P.expression; },
    "cinematic": function () { return P.cinematic; },
    "bg-detailed": function () { var b = find(P.backgrounds, "detailed"); return b && b.price; }
  };
  document.querySelectorAll("[data-price]").forEach(function (el) {
    var f = get[el.getAttribute("data-price")];
    var v = f ? f() : null;
    if (typeof v === "number" && isFinite(v)) el.textContent = money(v);
  });
  document.querySelectorAll("[data-turnaround]").forEach(function (el) {
    if (C.turnaround) el.textContent = C.turnaround;
  });
})();
