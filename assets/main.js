/* ==========================================================================
   JamzieBites — site scripts
   Everything is driven by config.js (window.JAMZIE). Each feature only runs
   if its elements exist on the current page, so this file is shared by
   index.html, tos.html and 404.html.
   ========================================================================== */
(function () {
  "use strict";

  var C = window.JAMZIE || {};
  var P = C.pricing || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Only allow https:// links (or site-relative paths when allowRelative) — blocks javascript:, data:, etc.
  function safeUrl(u, allowRelative) {
    u = String(u || "").trim();
    if (allowRelative && /^[A-Za-z0-9_\-./]+$/.test(u) && u.indexOf("..") === -1) return u;
    try { var p = new URL(u); return p.protocol === "https:" ? p.href : ""; } catch (e) { return ""; }
  }
  function num(n) { n = parseInt(n, 10); return isFinite(n) && n > 0 ? n : ""; }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function range(min, max) { return Math.round(min) === Math.round(max) ? money(min) : money(min) + "–" + money(max); }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  /* ---------- Theme ---------- */
  $$(".theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("jb-theme", next);
      toast(next === "dark" ? "✦ Stargazer mode" : "☁ Daydream mode");
    });
  });

  /* ---------- Header, menu, back-to-top ---------- */
  var header = $(".site-header");
  var toTop = $(".to-top");
  function onScroll() {
    var y = window.scrollY || 0;
    if (header) header.classList.toggle("scrolled", y > 20);
    if (toTop) toTop.classList.toggle("show", y > 900);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });

  var menuBtn = $(".menu-toggle"), links = $("#nav-links");
  function setMenu(open) {
    if (!menuBtn || !links) return;
    links.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  if (menuBtn) {
    menuBtn.addEventListener("click", function () { setMenu(!links.classList.contains("open")); });
    $$("a", links).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    document.addEventListener("click", function (e) {
      if (links.classList.contains("open") && !links.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
  }

  /* ---------- Scroll spy (nav + ToS table of contents) ---------- */
  var spyLinks = $$('.nav-links a[href^="#"], .toc a[href^="#"]');
  if ("IntersectionObserver" in window && spyLinks.length) {
    var byId = {};
    spyLinks.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) (byId[id] = byId[id] || []).push(a);
    });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        spyLinks.forEach(function (a) { a.classList.remove("active"); });
        (byId[en.target.id] || []).forEach(function (a) { a.classList.add("active"); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) { spy.observe(document.getElementById(id)); });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); ro.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = (i % 3) * 70 + "ms";
      ro.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Footer bits ---------- */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- ToS page bits ---------- */
  var tosUpd = $("#tos-updated");
  if (tosUpd && C.tosUpdated) { tosUpd.textContent = "Last updated: " + C.tosUpdated; tosUpd.hidden = false; }
  $$("[data-print]").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });

  var ICONS = {
    x: '<path d="M4 4l16 16M20 4 4 20" stroke-width="2.6"/>',
    bluesky: '<path d="M12 11c-1.5-3-5-6.5-7-6.5-1.5 0-1.5 2-1 4 .6 2.5 2.5 3.4 5 3-3 .8-4 2.6-2 4.5 2.5 2.4 4-1 5-3 1 2 2.5 5.4 5 3 2-1.9 1-3.7-2-4.5 2.5.4 4.4-.5 5-3 .5-2 .5-4-1-4-2 0-5.5 3.5-7 6.5z" fill="currentColor" stroke="none"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/>',
    tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.8 2.4 4.5 5 4.7"/>',
    paw: '<g fill="currentColor" stroke="none"><ellipse cx="6" cy="10" rx="2" ry="2.6"/><ellipse cx="10" cy="6.2" rx="2" ry="2.6"/><ellipse cx="14.5" cy="6.2" rx="2" ry="2.6"/><ellipse cx="18.5" cy="10" rx="2" ry="2.6"/><path d="M12.2 11.5c-3 0-6 4.5-6 6.5 0 2.2 2.6 2.4 6 1.2 3.4 1.2 6 1 6-1.2 0-2-3-6.5-6-6.5z"/></g>',
    kofi: '<path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M10 15.5s-2.6-1.6-2.6-3.2c0-1.6 2-2 2.6-.6.6-1.4 2.6-1 2.6.6 0 1.6-2.6 3.2-2.6 3.2z" fill="currentColor" stroke="none"/>',
    discord: '<path d="M8 6.5c-1.5.3-2.8.8-4 1.6C2.5 11.5 2 14.7 2.4 18c1.5 1.1 3 1.8 4.6 2.2l1-1.7M16 6.5c1.5.3 2.8.8 4 1.6 1.5 3.4 2 6.6 1.6 9.9-1.5 1.1-3 1.8-4.6 2.2l-1-1.7M6.5 17c3.6 1.6 7.4 1.6 11 0M7 7.5c3.3-1.2 6.7-1.2 10 0"/><circle cx="9" cy="13" r="1.4" fill="currentColor"/><circle cx="15" cy="13" r="1.4" fill="currentColor"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.link) + "</svg>";
  }
  var socialsEl = $("#socials");
  if (socialsEl) {
    var html = "";
    (C.socials || []).forEach(function (s) {
      var su = safeUrl(s.url);
      if (su) html += '<a href="' + esc(su) + '" target="_blank" rel="noopener me" aria-label="' + esc(s.label) + '" title="' + esc(s.label) + '">' + icon(s.icon) + "</a>";
    });
    if (C.contact && C.contact.email) html += '<a href="mailto:' + esc(C.contact.email) + '" aria-label="Email" title="Email">' + icon("mail") + "</a>";
    socialsEl.innerHTML = html;
    if (!html) socialsEl.hidden = true;
  }

  /* ---------- Soft art protection ---------- */
  document.addEventListener("contextmenu", function (e) {
    if (e.target.tagName === "IMG" && e.target.closest(".protect")) {
      e.preventDefault();
      toast("♡ Art © JamzieBites — please credit, don't edit, and never feed it to AI!");
    }
  });
  document.addEventListener("dragstart", function (e) {
    if (e.target.tagName === "IMG" && e.target.closest(".protect")) e.preventDefault();
  });

  /* ---------- Sparkle cursor trail ---------- */
  if (!reduceMotion && window.matchMedia && matchMedia("(pointer: fine)").matches) {
    var last = 0, glyphs = ["✦", "♡", "✧", "⋆"], colors = ["#ff8fc4", "#b892ff", "#8c8ff2", "#ffcf4d", "#9ad8ff"];
    document.addEventListener("pointermove", function (e) {
      var now = performance.now();
      if (now - last < 70) return;
      last = now;
      var s = document.createElement("span");
      s.className = "sparkle";
      s.textContent = glyphs[(Math.random() * glyphs.length) | 0];
      s.style.left = e.clientX + "px";
      s.style.top = e.clientY + "px";
      s.style.color = colors[(Math.random() * colors.length) | 0];
      s.style.fontSize = 10 + Math.random() * 8 + "px";
      s.style.setProperty("--dx", (Math.random() * 30 - 15) + "px");
      s.style.setProperty("--dy", (Math.random() * 24 + 10) + "px");
      s.setAttribute("aria-hidden", "true");
      document.body.appendChild(s);
      s.addEventListener("animationend", function () { s.remove(); });
    }, { passive: true });
  }

  /* ---------- Night sky / daydream canvas ---------- */
  var sky = $("#sky");
  if (sky && sky.getContext) {
    var ctx = sky.getContext("2d"), stars = [], W = 0, H = 0, raf = 0, visible = true, shooting = null;
    var isDark = function () { return document.documentElement.getAttribute("data-theme") === "dark"; };
    var sizeSky = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = sky.clientWidth; H = sky.clientHeight;
      sky.width = W * dpr; sky.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round((W * H) / 5200);
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.4 + 0.3, p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.6,
          big: Math.random() < 0.06,
          c: ["#ffffff", "#ffd6ef", "#d9ccff", "#c9e9ff", "#fff1b8"][(Math.random() * 5) | 0]
        });
      }
    };
    var sparkle4 = function (x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    };
    var draw = function (t) {
      ctx.clearRect(0, 0, W, H);
      var dark = isDark();
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var tw = 0.55 + 0.45 * Math.sin(st.p + (t || 0) / 1000 * st.s);
        if (dark) {
          ctx.globalAlpha = tw;
          ctx.fillStyle = st.c;
          if (st.big) sparkle4(st.x, st.y, st.r * 4.5 * tw + 1.5);
          else { ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill(); }
        } else if (st.big || i % 4 === 0) {
          ctx.globalAlpha = tw * 0.75;
          ctx.fillStyle = ["#ff9cc9", "#b892ff", "#ffffff", "#ffcf4d"][i % 4];
          sparkle4(st.x, st.y, (st.big ? 6 : 2.6) * (0.6 + tw * 0.5));
        }
      }
      if (dark && !reduceMotion) {
        if (!shooting && Math.random() < 0.004) shooting = { x: Math.random() * W * 0.7 + W * 0.2, y: Math.random() * H * 0.3, life: 1 };
        if (shooting) {
          ctx.globalAlpha = shooting.life;
          var g = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x + 90, shooting.y - 40);
          g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = g; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(shooting.x, shooting.y); ctx.lineTo(shooting.x + 90, shooting.y - 40); ctx.stroke();
          shooting.x -= 9; shooting.y += 4; shooting.life -= 0.025;
          if (shooting.life <= 0) shooting = null;
        }
      }
      ctx.globalAlpha = 1;
      if (!reduceMotion && visible) raf = requestAnimationFrame(draw);
    };
    sizeSky();
    draw(0);
    var resizeT;
    window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(function () { sizeSky(); if (reduceMotion) draw(0); }, 150); });
    new MutationObserver(function () { if (reduceMotion) draw(0); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if ("IntersectionObserver" in window && !reduceMotion) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        cancelAnimationFrame(raf);
        if (visible) raf = requestAnimationFrame(draw);
      }).observe(sky);
    }
  }

  /* ======================================================================
     Homepage-only features below
     ====================================================================== */

  /* ---------- Status, slots & queue ----------
     Rendered from config.js first, then refreshed live from the database
     (her admin studio controls it). Falls back silently if offline. */
  var STAGES = ["waiting", "sketch", "lineart", "color", "render", "done"];
  var STAGE_LABEL = { waiting: "In line", sketch: "Sketch", lineart: "Lineart", color: "Color", render: "Rendering", done: "Done ♡" };
  var status = "open";
  var leadDefault = $("#request-lead") ? $("#request-lead").textContent : "";
  function renderStatus(st) {
    var total = Math.max(0, parseInt(st.slots_total, 10) || 0);
    var taken = Math.max(0, parseInt(st.slots_taken, 10) || 0);
    var left = Math.max(0, total - taken);
    status = /^(open|waitlist|closed)$/.test(st.status) ? st.status : "open";
    if (status === "open" && total && left === 0) status = "waitlist";

    var pill = $("#status-pill");
    if (pill) {
      pill.setAttribute("data-status", status);
      $("#status-text").textContent = status === "open" ? "Commissions open" : status === "waitlist" ? "Waitlist open" : "Commissions closed";
      $("#status-slots").textContent = status === "open" && total ? "· " + left + " of " + total + " slots left" : status === "closed" ? "· check back soon" : "· slots are full";
    }
    if ($("#slots-big")) {
      $("#slots-big").textContent = status === "closed" ? "Commissions are closed" : status === "waitlist" ? "All slots are full ♡" : left + " of " + total + " slots open";
      $("#slots-small").textContent = status === "closed" ? "Follow my socials to hear when they reopen!" : status === "waitlist" ? "You can still send a request to join the waitlist." : "Grab one while they last!";
      var dots = "";
      for (var d = 0; d < Math.min(total, 30); d++) dots += "<i" + (d < taken ? ' class="taken"' : "") + "></i>";
      $("#slot-dots").innerHTML = dots;
    }
    var qList = $("#queue-list");
    if (qList) {
      var q = Array.isArray(st.queue) ? st.queue : [];
      if (!q.length) {
        qList.innerHTML = '<li class="card q-empty"><span class="big-emoji" aria-hidden="true">🍓</span><b style="font-family:var(--font-display);font-size:1.2rem">The queue is empty!</b><p style="color:var(--ink-soft);margin:6px 0 16px">Which means your piece could start soon.</p><a class="btn btn-primary btn-sm" href="#request">Be the first ✦</a></li>';
      } else {
        qList.innerHTML = q.map(function (item, i) {
          var idx = Math.max(0, STAGES.indexOf(item.stage));
          var bars = "";
          for (var b = 1; b < STAGES.length; b++) bars += "<i" + (b <= idx ? ' class="on"' : "") + "></i>";
          return '<li class="card q-item"><span class="q-num">' + (i + 1) + "</span><div><b>" + esc(item.client || "Anonymous") + "</b><small>" + esc(item.type || "") + '</small></div><span class="q-stage' + (item.stage === "done" ? " done" : "") + '">' + esc(STAGE_LABEL[item.stage] || item.stage) + '</span><div class="q-progress" aria-label="Progress: ' + esc(STAGE_LABEL[item.stage] || "") + '">' + bars + "</div></li>";
        }).join("") + '<li class="q-legend" aria-hidden="true"><span>Sketch</span><span>Lineart</span><span>Color</span><span>Render</span><span>Done</span></li>';
      }
    }
    if ($("#f-submit") && !$("#f-submit").disabled) $("#f-submit").textContent = status === "open" ? "Send my request ✦" : "Join the waitlist ✦";
    if ($("#request-lead")) {
      $("#request-lead").textContent = status === "closed"
        ? "Commissions are closed right now, but you can still send a request to join the waitlist — I'll reach out when a slot opens!"
        : status === "waitlist" ? "All slots are taken right now — send your request and I'll add you to the waitlist!" : leadDefault;
    }
  }
  renderStatus({ status: C.status, slots_total: (C.slots || {}).total, slots_taken: (C.slots || {}).taken, queue: C.queue || [] });
  $$(".js-turnaround").forEach(function (el) { el.textContent = C.turnaround || "2–12 weeks"; });
  if ($("#stat-turnaround") && C.turnaround) $("#stat-turnaround").textContent = C.turnaround.replace(" weeks", " wks");

  /* ---------- Database (public functions only) ---------- */
  var BK = C.backend || {};
  function backendOk() { return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(BK.url || "") && /^sb_publishable_[A-Za-z0-9_-]+$/.test(BK.key || ""); }
  function rpc(name, body) {
    return fetch(BK.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { apikey: BK.key, "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || "Something went wrong");
        return j;
      });
    });
  }
  if (backendOk() && ($("#status-pill") || $("#queue-list"))) {
    rpc("public_status").then(function (st) { if (st && st.status) renderStatus(st); }).catch(function () {});
  }

  /* ---------- About & lists ---------- */
  var aboutEl = $("#about-text");
  if (aboutEl) aboutEl.innerHTML = (C.about || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
  [["#list-loves", C.loves], ["#list-ask", C.askFirst], ["#list-wont", C.wontDraw]].forEach(function (pair) {
    var el = $(pair[0]);
    if (el) el.innerHTML = (pair[1] || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
  });

  /* ---------- Gallery + lightbox ---------- */
  var CAT = { cinematic: "Cinematic", fullbody: "Full Body", halfbody: "Half Body", headshot: "Headshots", chibi: "Chibis & Stickers", refsheet: "Ref Sheets" };
  var grid = $("#gallery-grid");
  var art = C.gallery || [];
  if (grid) {
    grid.innerHTML = art.map(function (a, i) {
      return '<button type="button" class="gallery-item" data-cat="' + esc(a.category) + '" data-i="' + i + '" aria-label="View ' + esc(a.title) + ' larger">' +
        '<img src="' + esc(safeUrl(a.src, true)) + '" width="' + num(a.w) + '" height="' + num(a.h) + '" alt="' + esc(a.alt || a.title) + '" loading="lazy" decoding="async">' +
        '<span class="meta"><strong>' + esc(a.title) + "</strong><span>" + esc(a.tier || CAT[a.category] || "") + "</span></span></button>";
    }).join("");

    var counts = {};
    art.forEach(function (a) { counts[a.category] = (counts[a.category] || 0) + 1; });
    var fHtml = '<button type="button" class="chip" data-f="all" aria-pressed="true">All<span class="count">' + art.length + "</span></button>";
    Object.keys(CAT).forEach(function (k) {
      if (counts[k]) fHtml += '<button type="button" class="chip" data-f="' + k + '" aria-pressed="false">' + CAT[k] + '<span class="count">' + counts[k] + "</span></button>";
    });
    var filters = $("#gallery-filters");
    filters.innerHTML = fHtml;
    filters.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      var f = chip.getAttribute("data-f");
      $$(".chip", filters).forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      $$(".gallery-item", grid).forEach(function (it) { it.classList.toggle("hidden", f !== "all" && it.getAttribute("data-cat") !== f); });
    });

    var lb = $("#lightbox"), lbImg = $("#lb-img"), cur = 0, lastFocus = null;
    var visibleIdx = function () { return $$(".gallery-item:not(.hidden)", grid).map(function (el) { return +el.getAttribute("data-i"); }); };
    var show = function (i) {
      var a = art[i]; if (!a) return;
      cur = i;
      lbImg.src = safeUrl(a.src, true); lbImg.alt = a.alt || a.title;
      $("#lb-title").textContent = a.title;
      $("#lb-tier").textContent = (a.tier || "") + "  ·  © JamzieBites";
    };
    var open = function (i) { lastFocus = document.activeElement; show(i); lb.classList.add("open"); document.body.style.overflow = "hidden"; $(".lb-close", lb).focus(); };
    var close = function () { lb.classList.remove("open"); document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); };
    var step = function (dir) {
      var v = visibleIdx(); if (!v.length) return;
      var pos = v.indexOf(cur);
      show(v[(pos + dir + v.length) % v.length]);
    };
    grid.addEventListener("click", function (e) {
      var it = e.target.closest(".gallery-item");
      if (it) open(+it.getAttribute("data-i"));
    });
    $(".lb-close", lb).addEventListener("click", close);
    $(".lb-prev", lb).addEventListener("click", function () { step(-1); });
    $(".lb-next", lb).addEventListener("click", function () { step(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") { // keep focus inside the viewer
        var f = $$(".lb-btn", lb), first = f[0], lastB = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastB.focus(); }
        else if (!e.shiftKey && document.activeElement === lastB) { e.preventDefault(); first.focus(); }
      }
    });
    var tx = null;
    lb.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (tx === null) return;
      var dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      tx = null;
    });
  }

  /* ---------- Price lists ---------- */
  var ICON_SIZE = {
    headshot: '<svg class="pc-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="26" fill="var(--pink-soft)"/><circle cx="27" cy="25" r="11" fill="var(--pink)"/><path d="M12 48c2-9 8-12 15-12s13 3 15 12" fill="var(--lilac)"/></svg>',
    half: '<svg class="pc-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="26" fill="var(--pink-soft)"/><circle cx="27" cy="17" r="8" fill="var(--pink)"/><path d="M13 50c0-14 6-22 14-22s14 8 14 22" fill="var(--lilac)"/></svg>',
    full: '<svg class="pc-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="26" fill="var(--pink-soft)"/><circle cx="27" cy="12" r="6" fill="var(--pink)"/><path d="M19 34c0-10 3-15 8-15s8 5 8 15z" fill="var(--lilac)"/><path d="M22 33l-1 14M32 33l1 14" stroke="var(--peri)" stroke-width="4.5" stroke-linecap="round"/></svg>'
  };
  var stdEl = $("#price-standard");
  if (stdEl) {
    stdEl.innerHTML = (P.sizes || []).map(function (s, i) {
      return '<div class="card price-card' + (i === 2 ? " featured" : "") + '">' + (i === 2 ? '<span class="ribbon">most loved</span>' : "") +
        (ICON_SIZE[s.id] || "") + "<h3>" + esc(s.label) + '</h3><div class="price">' + money(s.price) + '<small>+</small></div><p class="desc">Clean lineart &amp; flat colors.</p>' +
        '<ul class="price-rows"><li><span>+ Simple shading</span><span>+' + money(s.simple) + '</span></li><li><span>+ Full rendering</span><span>+' + money(s.render) + "</span></li>" +
        '<li class="total"><span>Fully rendered</span><span>' + money(s.price + s.render) + "+</span></li></ul></div>";
    }).join("");
  }
  var rows = function (list, extra) {
    return list.map(function (x) { return "<li><span>" + esc(x.label) + (extra ? extra(x) : "") + "</span><span>" + money(x.price) + "</span></li>"; }).join("");
  };
  if ($("#price-chibi")) $("#price-chibi").innerHTML = rows(P.chibi || []);
  if ($("#price-stickers")) $("#price-stickers").innerHTML = rows(P.stickers || [], function (x) {
    return x.count > 1 ? ' <small style="color:var(--muted)">(' + money(x.price / x.count) + " each)</small>" : "";
  });
  if ($("#price-ref")) {
    $("#price-ref").innerHTML = (P.refSheets || []).map(function (r, i) {
      return '<div class="card price-card' + (i === 1 ? " featured" : "") + '">' + (i === 1 ? '<span class="ribbon">deluxe</span>' : "") +
        "<h3>" + esc(r.label) + '</h3><div class="price">' + money(r.price) + '<small>+</small></div><ul class="check-list">' +
        r.includes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }).join("");
  }
  if ($("#expr-price")) $("#expr-price").textContent = "+" + money(P.expression || 15);
  if ($("#price-cine")) $("#price-cine").textContent = money(P.cinematic || 190);
  if ($("#price-bg")) {
    $("#price-bg").innerHTML = (P.backgrounds || []).map(function (b) {
      return '<div class="card bg-item"><div class="bg-prev bgp-' + esc(b.id) + '"></div><div class="row"><span>' + esc(b.label) + "</span><span>" + (b.price ? "+" + money(b.price) : "FREE") + "</span></div></div>";
    }).join("");
  }
  if ($("#price-addons")) {
    var pct = function (r) { return "+" + Math.round(r * 100) + "%"; };
    var ad = [["Additional character", pct(P.extraCharacterRate || 0.85) + " of base price"]];
    (P.addons || []).forEach(function (a) {
      var note = a.only && a.only.length === 1 && a.only[0] === "ref" ? " (ref sheets only)" : "";
      ad.push([a.label + note, "+" + range(a.min, a.max)]);
    });
    ad.push(["Additional ref sheet expression", "+" + money(P.expression || 15)]);
    ad.push(["NSFW / mature content (18+ only)", "+" + money(P.nsfw || 95)]);
    ad.push(["Rush commission", pct(P.rushRate || 0.35)]);
    ad.push(["Commercial usage", pct(P.commercialRate || 1)]);
    $("#price-addons").innerHTML = ad.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>"; }).join("");
  }

  /* ---------- Tabs ---------- */
  var tabs = $$('[role="tab"]');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); });
    t.addEventListener("keydown", function (e) {
      var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (e.key === "Home") { e.preventDefault(); selectTab(tabs[0], true); }
      if (e.key === "End") { e.preventDefault(); selectTab(tabs[tabs.length - 1], true); }
      if (n) { e.preventDefault(); selectTab(tabs[(i + n + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- Quote calculator ---------- */
  var calc = $("#calc");
  var attachedQuote = null;
  if (calc) {
    calc.addEventListener("submit", function (e) { e.preventDefault(); });
    var seg = function (el, name, list, sub, checkedIdx) {
      el.innerHTML = list.map(function (x, i) {
        return '<label><input type="radio" name="' + name + '" value="' + esc(x.id) + '"' + (i === checkedIdx ? " checked" : "") + "><span>" + esc(x.label) + (sub ? " <em>" + sub(x) + "</em>" : "") + "</span></label>";
      }).join("");
    };
    var sizes = P.sizes || [];
    seg($("#calc-size"), "size", sizes, function (x) { return money(x.price); }, sizes.length - 1);
    seg($("#calc-finish"), "finish", [{ id: "flat", label: "Flat colors" }, { id: "simple", label: "Simple shading" }, { id: "render", label: "Full render" }], null, 0);
    seg($("#calc-chibi"), "chibi", P.chibi || [], function (x) { return money(x.price); }, 0);
    seg($("#calc-sticker"), "sticker", P.stickers || [], function (x) { return money(x.price); }, 0);
    seg($("#calc-ref"), "ref", P.refSheets || [], function (x) { return money(x.price); }, 0);
    $("#calc-bg").innerHTML = (P.backgrounds || []).map(function (b) {
      return '<option value="' + esc(b.id) + '">' + esc(b.label) + " — " + (b.price ? "+" + money(b.price) : "free") + "</option>";
    }).join("");
    $("#calc-addons").innerHTML = (P.addons || []).map(function (a) {
      return '<label class="check" data-only="' + esc((a.only || []).join(" ")) + '"><input type="checkbox" name="addon" value="' + esc(a.id) + '"> ' + esc(a.label) + " <em>+" + esc(range(a.min, a.max)) + "</em></label>";
    }).join("");
    $("#expr-hint").textContent = "+" + money(P.expression || 15) + " each";
    if ($("#calc-nsfw-price")) $("#calc-nsfw-price").textContent = "+" + money(P.nsfw || 95);

    var counters = { chars: 0, expr: 0 };
    var finishLabel = function (sizeObj) {
      return {
        simple: ["Simple shading", sizeObj ? sizeObj.simple : 0],
        render: ["Full rendering", sizeObj ? sizeObj.render : 0]
      };
    };
    var val = function (name) { var el = calc.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : null; };
    var find = function (list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; };

    var compute = function () {
      var type = val("type"), lines = [], min = 0, max = 0, base = 0, baseLabel = "", formType = "";
      var add = function (label, lo, hi, cls) { if (hi === undefined) hi = lo; min += lo; max += hi; lines.push({ label: label, lo: lo, hi: hi, cls: cls }); };

      if (type === "standard") {
        var s = find(sizes, val("size")) || sizes[0];
        base = s.price; baseLabel = s.label; formType = s.label;
        add(s.label + " (lineart + flats)", base);
        var fin = finishLabel(s)[val("finish")];
        if (fin) add(fin[0], fin[1]);
        var bg = find(P.backgrounds, $("#calc-bg").value);
        if (bg && bg.price) add(bg.label + " background", bg.price);
      } else if (type === "chibi") {
        var c = find(P.chibi, val("chibi")) || P.chibi[0];
        base = c.price; baseLabel = "Chibi " + c.label; formType = "Chibi";
        add(baseLabel, base);
      } else if (type === "sticker") {
        var st = find(P.stickers, val("sticker")) || P.stickers[0];
        base = st.price; baseLabel = st.label; formType = "Sticker(s)";
        add(st.label, base);
      } else if (type === "ref") {
        var r = find(P.refSheets, val("ref")) || P.refSheets[0];
        base = r.price; baseLabel = r.label; formType = r.label;
        add(r.label, base);
        if (counters.expr) add(counters.expr + " extra expression" + (counters.expr > 1 ? "s" : ""), counters.expr * (P.expression || 15));
      } else {
        base = P.cinematic || 190; baseLabel = "Cinematic Illustration"; formType = "Cinematic Illustration";
        add(baseLabel, base);
      }

      var allowChars = type === "standard" || type === "chibi" || type === "cinematic";
      if (allowChars && counters.chars) add(counters.chars + " extra character" + (counters.chars > 1 ? "s" : "") + " (×" + Math.round((P.extraCharacterRate || 0.85) * 100) + "%)", counters.chars * base * (P.extraCharacterRate || 0.85));

      $$('input[name="addon"]:checked', calc).forEach(function (cb) {
        var a = find(P.addons, cb.value);
        if (a) add(a.label, a.min, a.max);
      });

      if ($("#calc-nsfw") && $("#calc-nsfw").checked) add("NSFW / mature content", P.nsfw || 95);

      var subMin = min, subMax = max;
      if ($("#calc-rush").checked) add("Rush (+" + Math.round((P.rushRate || 0.35) * 100) + "%)", subMin * (P.rushRate || 0.35), subMax * (P.rushRate || 0.35), "mult");
      if ($("#calc-commercial").checked) add("Commercial license (+" + Math.round((P.commercialRate || 1) * 100) + "%)", subMin * (P.commercialRate || 1), subMax * (P.commercialRate || 1), "mult");

      return { type: type, lines: lines, min: min, max: max, baseLabel: baseLabel, formType: formType, allowChars: allowChars };
    };

    var render = function () {
      var type = val("type");
      $$(".calc-panel", calc).forEach(function (p) { p.hidden = p.getAttribute("data-for") !== type; });
      // Add-ons limited to certain types (e.g. custom design → ref sheets only)
      $$("#calc-addons .check", calc).forEach(function (lab) {
        var only = lab.getAttribute("data-only");
        var ok = !only || only.split(" ").indexOf(type) > -1;
        lab.hidden = !ok;
        if (!ok) lab.querySelector("input").checked = false;
      });
      var q = compute();
      $("#chars-group").hidden = !q.allowChars;
      $("#calc-chars").textContent = counters.chars;
      $("#calc-expr").textContent = counters.expr;
      $("#chars-total").textContent = (counters.chars + 1) + " character" + (counters.chars ? "s" : "") + " total";
      $("#quote-total").innerHTML = esc(range(q.min, q.max)) + '<span class="plus">+</span>';
      $("#quote-sub").textContent = Math.round(q.min) === Math.round(q.max) ? "estimated starting price" : "estimated range, depending on complexity";
      $("#quote-lines").innerHTML = q.lines.map(function (l) {
        return '<li class="' + (l.cls || "") + '"><span>' + esc(l.label) + "</span><span>" + (l.cls ? "+" : "") + esc(range(l.lo, l.hi)) + "</span></li>";
      }).join("");
      return q;
    };

    calc.addEventListener("change", render);
    calc.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]");
      if (!b) return;
      var k = b.getAttribute("data-step");
      counters[k] = Math.max(0, Math.min(k === "chars" ? 9 : 12, counters[k] + +b.getAttribute("data-delta")));
      render();
    });
    render();

    $("#quote-send").addEventListener("click", function () {
      var q = compute();
      var summary = q.lines.map(function (l) { return "• " + l.label + ": " + (l.cls ? "+" : "") + range(l.lo, l.hi); }).join("\n");
      attachedQuote = { short: q.baseLabel + " — est. " + range(q.min, q.max) + "+", full: summary + "\nEstimated total: " + range(q.min, q.max) + "+", formType: q.formType, nsfw: $("#calc-nsfw").checked };
      applyQuote();
      var req = $("#request");
      if (req) req.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      setTimeout(function () { var n = $("#f-name"); if (n) n.focus({ preventScroll: true }); }, 600);
      toast("✦ Quote attached to your request!");
    });
  }

  function applyQuote() {
    var note = $("#prefill-note");
    if (!note) return;
    if (attachedQuote) {
      $("#prefill-text").textContent = attachedQuote.short;
      note.classList.add("show");
      var sel = $("#f-type");
      if (sel && attachedQuote.formType) sel.value = attachedQuote.formType;
      var m = $("#f-mature");
      if (m && attachedQuote.nsfw && !m.checked) { m.checked = true; m.dispatchEvent(new Event("change")); }
    } else {
      note.classList.remove("show");
    }
    saveDraft();
  }
  if ($("#prefill-clear")) $("#prefill-clear").addEventListener("click", function () { attachedQuote = null; applyQuote(); });

  /* ---------- FAQ search ---------- */
  var faqSearch = $("#faq-search");
  if (faqSearch) {
    faqSearch.addEventListener("input", function () {
      var term = faqSearch.value.trim().toLowerCase(), any = false;
      var syn = { nsfw: "mature", "18+": "mature", money: "pay", price: "pay", time: "long", ai: "ai" };
      var t2 = syn[term] || term;
      $$("#faq-list details").forEach(function (d) {
        var text = d.textContent.toLowerCase();
        var hit = !term || text.indexOf(term) > -1 || text.indexOf(t2) > -1;
        d.hidden = !hit;
        if (hit) any = true;
        d.open = !!term && hit;
      });
      $("#faq-empty").hidden = any;
    });
  }

  /* ---------- Request form ---------- */
  var form = $("#request-form");
  var DRAFT_KEY = "jb-request-draft";
  function saveDraft() {
    if (!form) return;
    var data = {};
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.id || el.type === "checkbox" || el.id === "f-website") return; // agreements must be ticked fresh each time
      data[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });
    data.quote = attachedQuote;
    store(DRAFT_KEY, JSON.stringify(data));
  }
  if (form) {
    var contact = C.contact || {};
    if (contact.email && !/^[^@\s"'<>?&]+@[^@\s"'<>?&]+\.[a-z]{2,}$/i.test(contact.email)) contact = Object.assign({}, contact, { email: "" });

    var cl = "";
    if (contact.discord) cl += '<div class="contact-line">' + icon("discord") + "<span>Discord: <strong>" + esc(contact.discord) + "</strong></span></div>";
    if (contact.email) cl += '<div class="contact-line">' + icon("mail") + '<a href="mailto:' + esc(contact.email) + '">' + esc(contact.email) + "</a></div>";
    $("#contact-lines").innerHTML = cl;

    // Restore draft
    try {
      var saved = JSON.parse(store(DRAFT_KEY) || "null");
      if (saved) {
        Object.keys(saved).forEach(function (id) {
          var el = document.getElementById(id);
          if (!el || !form.contains(el)) return;
          if (el.type === "checkbox") el.checked = !!saved[id]; else el.value = saved[id];
        });
        if (saved.quote) { attachedQuote = saved.quote; applyQuote(); }
      }
    } catch (e) {}

    // "How should I reach you?" -> email and/or Discord fields
    var via = $("#f-via"), fEmail = $("#f-email"), fDiscord = $("#f-discord");
    var invite = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(contact.discordInvite || "") ? contact.discordInvite : "";
    if (invite) {
      $("#contact-lines").innerHTML += '<div class="contact-line">' + icon("discord") + '<a href="' + esc(invite) + '" target="_blank" rel="noopener">Join my Discord server</a></div>';
      $("#dc-help").innerHTML = "Your <strong>username</strong> (lowercase), not your display name. Please <a href=\"" + esc(invite) +
        "\" target=\"_blank\" rel=\"noopener\">join my Discord server</a> so my bot can message you!";
    }
    var syncVia = function () {
      var v = via.value;
      var useEmail = v !== "discord", useDiscord = v !== "email";
      $("#fld-email").hidden = !useEmail; fEmail.required = useEmail;
      $("#fld-discord").hidden = !useDiscord; fDiscord.required = useDiscord;
      if (!useEmail) $("#fld-email").classList.remove("invalid");
      if (!useDiscord) $("#fld-discord").classList.remove("invalid");
    };
    via.addEventListener("change", syncVia);
    syncVia();

    // "Do you already have a character?" + attached pictures
    var hasChar = $("#f-hasChar"), fRefs = $("#f-refs"), fFiles = $("#f-files");
    var pickedFiles = [];
    var FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
    var MAX_FILES = 10, MAX_BYTES = 25 * 1024 * 1024;
    var prettySize = function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; };
    var syncRefs = function () {
      var design = hasChar.value === "design";
      $("#refs-label").innerHTML = design ? "Inspiration &amp; ideas <span class=\"hint\">(optional)</span>" : 'Character ref sheet <span class="req">*</span>';
      $("#refs-help").innerHTML = design
        ? "Tell me about the character you'd love: species, colors, vibe. Links or pictures of inspiration help a lot!"
        : "A character ref sheet is <strong>required</strong> for all commissions. Add a link, attach pictures, or both.";
      fRefs.placeholder = design ? "Species, colors, personality, outfits, anything that inspires you…"
        : "Paste links to your character's ref sheet (Toyhouse, Google Drive, imgur…) one per line, or attach pictures below";
      fRefs.required = !design && !pickedFiles.length;
      if (!fRefs.required) $("#fld-refs").classList.remove("invalid");
      if (design) {
        var t = $("#f-type");
        if (t && t.value !== "Custom Design Ref Sheet") { t.value = "Custom Design Ref Sheet"; var tf = t.closest(".field"); if (tf) tf.classList.remove("invalid"); }
      }
    };
    var renderFiles = function () {
      $("#f-files-list").innerHTML = pickedFiles.map(function (f, i) {
        return '<li><span>' + esc(f.name) + ' <small>' + esc(prettySize(f.size)) + '</small></span><button type="button" class="file-x" data-rm="' + i + '" aria-label="Remove ' + esc(f.name) + '">✕</button></li>';
      }).join("");
      syncRefs();
    };
    hasChar.addEventListener("change", syncRefs);
    fFiles.addEventListener("change", function () {
      var skipped = [];
      Array.prototype.forEach.call(fFiles.files || [], function (f) {
        if (pickedFiles.length >= MAX_FILES) { skipped.push(f.name + " (10 files max)"); return; }
        if (FILE_TYPES.indexOf(f.type) < 0) { skipped.push(f.name + " (not a picture or PDF)"); return; }
        if (f.size > MAX_BYTES) { skipped.push(f.name + " (over 25 MB)"); return; }
        pickedFiles.push(f);
      });
      fFiles.value = "";
      renderFiles();
      if (skipped.length) toast("Skipped: " + skipped.join(", "));
    });
    $("#f-files-list").addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm]"); if (!b) return;
      pickedFiles.splice(Number(b.getAttribute("data-rm")), 1);
      renderFiles();
    });
    syncRefs();

    // Upload the picked files into the new request's private thread (via the portal function).
    var portal = function (body) {
      return fetch(BK.url + "/functions/v1/portal", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Upload failed");
        return j;
      }); });
    };
    var uploadFiles = function (token, files, onStep) {
      var paths = [], failed = [];
      return files.reduce(function (chain, f, i) {
        return chain.then(function () {
          onStep(i + 1, files.length);
          return portal({ token: token, action: "upload", name: f.name, type: f.type, size: f.size }).then(function (u) {
            var u2 = null; try { u2 = new URL(u.url); } catch (e) {}
            if (!u2 || u2.origin !== BK.url) throw new Error("bad upload link");
            var fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", f);
            return fetch(u2.toString(), { method: "PUT", headers: { "x-upsert": "false" }, body: fd }).then(function (r) {
              if (!r.ok) throw new Error("upload " + r.status);
              paths.push(u.path);
            });
          }).catch(function () { failed.push(f.name); });
        });
      }, Promise.resolve()).then(function () {
        if (!paths.length) return failed;
        return portal({ token: token, action: "send", body: "📎 Character references from my request", files: paths })
          .then(function () { return failed; }, function () { return files.map(function (f) { return f.name; }); });
      });
    };
    var contactValues = function () {
      var v = via.value;
      return {
        email: v !== "discord" ? fEmail.value.trim() : "",
        discord: v !== "email" ? fDiscord.value.trim().replace(/^@+/, "").toLowerCase() : ""
      };
    };
    var contactText = function () {
      var c = contactValues();
      return [c.email && "Email: " + c.email, c.discord && "Discord: " + c.discord].filter(Boolean).join(" · ");
    };

    var mature = $("#f-mature"), adultRow = $("#agree-adult"), adultBox = $("#f-adult");
    var syncMature = function () {
      adultRow.hidden = !mature.checked;
      adultBox.required = mature.checked;
      if (!mature.checked) { adultBox.checked = false; adultRow.classList.remove("invalid"); }
    };
    mature.addEventListener("change", syncMature);
    syncMature();

    var saveT;
    form.addEventListener("input", function (e) {
      clearTimeout(saveT); saveT = setTimeout(saveDraft, 300);
      var f = e.target.closest(".field");
      if (f) f.classList.remove("invalid");
      var ch = e.target.closest(".check");
      if (ch) ch.classList.remove("invalid");
    });

    var buildMessage = function () {
      var v = function (id) { return ($(id).value || "").trim(); };
      var lines = [
        "✦ JamzieBites Commission Request ✦",
        "",
        "Name: " + v("#f-name"),
        "Contact: " + contactText(),
        "Type: " + v("#f-type"),
        "Character(s): " + (v("#f-char") || "—")
      ];
      if (attachedQuote) lines.push("", "Estimate from the quote calculator:", attachedQuote.full);
      lines.push("", "References:", v("#f-refs"), "", "Idea:", v("#f-desc"), "",
        "Deadline: " + (v("#f-deadline") || "none"),
        "Privacy: " + v("#f-privacy"),
        "NSFW / mature: " + (mature.checked ? "Yes (+" + money(P.nsfw || 95) + ") — client & all characters confirmed 18+" : "No"),
        "",
        "✓ My character has a ref sheet (or I'm ordering a custom design ref sheet)",
        "✓ I own this character or have permission",
        "✓ I have read and agree to the Terms of Service");
      return lines.join("\n");
    };

    var modal = $("#modal");
    var openModal = function (title, bodyHtml) {
      $("#modal-title").textContent = title;
      $("#modal-body").innerHTML = bodyHtml;
      modal.classList.add("open");
      document.body.style.overflow = "hidden";
      var f = $(".modal-close", modal); if (f) f.focus();
    };
    var closeModal = function () { modal.classList.remove("open"); document.body.style.overflow = ""; $("#f-submit").focus(); };
    $(".modal-close", modal).addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });

    var copy = function (text, msg) {
      var done = function () { toast(msg || "Copied! ♡"); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy — please select the text and copy it manually."); }
        ta.remove();
      }
    };

    var showCopyModal = function (msg, note) {
      var body = (note ? '<p style="color:#e23b62;font-weight:700">' + esc(note) + "</p>" : "") +
        "<p>Copy your request and send it to Jamzie" + (contact.discord ? " on Discord (<strong>" + esc(contact.discord) + "</strong>)" : contact.email ? " by email" : " in a DM") + ". Remember: <strong>no payment until you're accepted!</strong></p>" +
        "<pre id=\"msg-pre\">" + esc(msg) + "</pre><div class=\"modal-actions\">" +
        '<button class="btn btn-primary" type="button" id="m-copy">Copy message</button>' +
        (contact.email ? '<a class="btn" href="mailto:' + esc(contact.email) + "?subject=" + encodeURIComponent("Commission request — " + $("#f-name").value) + "&body=" + encodeURIComponent(msg) + '">Send by email</a>' : "") +
        (contact.discord ? '<button class="btn" type="button" id="m-copy-dc">Copy Discord username</button>' : "") +
        "</div>";
      openModal("Your request is ready! ✦", body);
      $("#m-copy").addEventListener("click", function () { copy(msg, "Request copied — paste it into your message! ♡"); });
      if ($("#m-copy-dc")) $("#m-copy-dc").addEventListener("click", function () { copy(contact.discord, "Discord username copied!"); });
    };

    var formOpenedAt = Date.now();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // Spam guard: bots fill the hidden field or submit instantly. Pretend it worked, send nothing.
      var hp = $("#f-website");
      if ((hp && hp.value) || Date.now() - formOpenedAt < 4000) {
        openModal("Request sent! ♡", "<p>Thank you!</p>");
        return;
      }
      var firstBad = null;
      $$("[required]", form).forEach(function (el) {
        var bad = el.type === "checkbox" ? !el.checked : !el.value.trim();
        var wrap = el.type === "checkbox" ? el.closest(".check") : el.closest(".field");
        if (wrap) wrap.classList.toggle("invalid", bad);
        if (bad && !firstBad) firstBad = el;
      });
      syncRefs();
      if (fRefs.required && !fRefs.value.trim()) { $("#fld-refs").classList.add("invalid"); if (!firstBad) firstBad = fRefs; }
      var cv = contactValues();
      if (!firstBad && cv.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(cv.email)) { $("#fld-email").classList.add("invalid"); firstBad = fEmail; }
      if (!firstBad && cv.discord && !/^[a-z0-9_.]{2,32}$/.test(cv.discord)) { $("#fld-discord").classList.add("invalid"); firstBad = fDiscord; }
      if (firstBad) { firstBad.focus(); toast("Almost! Please fill in the highlighted bits ♡"); return; }

      var msg = buildMessage();
      var btn = $("#f-submit");

      var endpoint = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(contact.formEndpoint || "") ? contact.formEndpoint : "";
      var resetBtn = function () { btn.disabled = false; btn.textContent = status === "open" ? "Send my request ✦" : "Join the waitlist ✦"; };
      if (backendOk()) {
        var val = function (id) { return ($(id).value || "").trim(); };
        btn.disabled = true; btn.textContent = "Sending…";
        var sentTo = cv.email && cv.discord ? "by email and Discord DM" : cv.email ? "by email" : "by Discord DM";
        var filesToSend = pickedFiles.slice();
        rpc("submit_request3", {
          p_name: val("#f-name"), p_email: cv.email, p_discord: cv.discord, p_type: val("#f-type"),
          p_character: val("#f-char"), p_refs: val("#f-refs"), p_description: val("#f-desc"),
          p_deadline: val("#f-deadline") || null, p_privacy: val("#f-privacy"),
          p_nsfw: mature.checked, p_adult: $("#f-adult").checked,
          p_quote: attachedQuote ? attachedQuote.full : "", p_has_character: hasChar.value
        }).then(function (res) {
          var tok0 = String((res && res.token) || "");
          if (!filesToSend.length || !/^[0-9a-f]{36}$/.test(tok0)) return { res: res, failed: [] };
          return uploadFiles(tok0, filesToSend, function (i, n) { btn.textContent = "Uploading picture " + i + " of " + n + "…"; })
            .then(function (failed) { return { res: res, failed: failed }; });
        }).then(function (out) {
          var res = out.res, failedFiles = out.failed;
          var code = String((res && res.code) || "");
          var tok = String((res && res.token) || "");
          var link = /^[0-9a-f]{36}$/.test(tok) ? location.origin + location.pathname.replace(/[^/]*$/, "") + "request.html?t=" + tok : "";
          store(DRAFT_KEY, null);
          form.reset(); attachedQuote = null; applyQuote(); syncMature(); syncVia();
          pickedFiles = []; renderFiles();
          openModal("Request sent! ♡",
            "<p>Thank you so much! Jamzie will look over your request. You'll get updates " + sentTo + ": when it's accepted (with your price and a pay link), when it's paid, and as it's finished.</p>" +
            (failedFiles.length ? '<p style="color:#e23b62;font-weight:700">' + esc(failedFiles.length + " picture" + (failedFiles.length > 1 ? "s" : "") + " didn't upload (" + failedFiles.join(", ") + "). You can add them on your request page.") + "</p>" : "") +
            (link ? '<p><strong>Your private request page:</strong> check your status and pay there anytime. Bookmark it!</p><pre id="m-link">' + esc(link) + "</pre>" : "") +
            '<p>Request code: <strong class="req-code">' + esc(code) + "</strong></p>" +
            "<p><strong>Please don't send any payment until your commission is accepted.</strong></p>" +
            '<div class="modal-actions">' + (link ? '<a class="btn btn-primary" href="' + esc(link) + '">Open my request page</a><button class="btn" type="button" id="m-copy-link">Copy link</button>' : '<button class="btn btn-primary" type="button" id="m-copy-code">Copy my code</button>') + "</div>");
          if ($("#m-copy-link")) $("#m-copy-link").addEventListener("click", function () { copy(link, "Link copied ✓"); });
          if ($("#m-copy-code")) $("#m-copy-code").addEventListener("click", function () { copy(code, "Code copied ✓"); });
        }).catch(function (err) {
          showCopyModal(msg, "The request couldn't be sent (" + (err && err.message ? err.message : "network error") + "). Here it is so nothing is lost — you can send it to Jamzie directly.");
        }).then(resetBtn);
      } else if (endpoint) {
        btn.disabled = true; btn.textContent = "Sending…";
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            _subject: "Commission request — " + $("#f-name").value,
            name: $("#f-name").value, contact: contactText(), type: $("#f-type").value,
            message: msg, _gotcha: ""
          })
        }).then(function (r) {
          if (!r.ok) throw new Error("bad status");
          store(DRAFT_KEY, null);
          form.reset(); attachedQuote = null; applyQuote(); syncMature();
          openModal("Request sent! ♡", "<p>Thank you so much! I'll look over your request and get back to you at the contact you gave me. Please don't send any payment until I've accepted your commission.</p><div class=\"modal-actions\"><a class=\"btn btn-primary\" href=\"#gallery\">Back to the gallery</a></div>");
          $$("#modal-body a").forEach(function (a) { a.addEventListener("click", closeModal); });
        }).catch(function () {
          showCopyModal(msg, "Hmm, the form couldn't send right now — but here's your request so nothing is lost!");
        }).then(resetBtn);
      } else {
        showCopyModal(msg);
      }
    });
  }
})();
