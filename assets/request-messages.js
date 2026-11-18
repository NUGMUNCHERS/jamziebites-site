/* JamzieBites: message thread on a client's private request page.
   Everything goes through the "portal" Edge Function using the private token;
   files are uploaded straight to private storage with one-time upload links. */
(function () {
  "use strict";
  var C = window.JAMZIE || {};
  var BK = C.backend || {};
  var $ = function (id) { return document.getElementById(id); };
  var token = (new URLSearchParams(location.search).get("t") || "").toLowerCase();
  if (!/^[0-9a-f]{36}$/.test(token) || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(BK.url || "") || !$("m-card")) return;

  var TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "application/zip", "application/x-zip-compressed"];
  var MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 10;
  var picked = [], lastCount = -1, busy = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function when(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; } }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function safeUrl(u) {
    try { var x = new URL(u); return x.origin === BK.url && /^\/storage\/v1\/object\/sign\//.test(x.pathname) ? x.toString() : null; } catch (e) { return null; }
  }
  function portal(body) {
    body.token = token;
    return fetch(BK.url + "/functions/v1/portal", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
        return j;
      });
    });
  }

  function fileHtml(f) {
    var url = safeUrl(f.url);
    if (!url) return '<span class="doc">' + esc(f.name) + "</span>";
    if (/^image\//.test(f.type || "")) {
      return '<a class="thumb" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><img src="' + esc(url) + '" alt="' + esc(f.name) + '" loading="lazy"><span>' + esc(f.name) + "</span></a>";
    }
    return '<a class="doc" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">📄 ' + esc(f.name) + " · " + esc(size(f.size || 0)) + "</a>";
  }

  function render(j) {
    $("m-card").hidden = false;
    var list = j.messages || [];
    $("m-form").hidden = !!j.closed;
    $("m-closed").hidden = !j.closed;
    if (!list.length) {
      $("m-thread").innerHTML = '<div class="msg-empty">No messages yet. Jamzie will post sketches and updates here, and you can say hi anytime ✨</div>';
    } else {
      $("m-thread").innerHTML = list.map(function (m) {
        var mine = m.from === "client";
        return '<div class="msg ' + (mine ? "me" : "artist") + '"><div class="msg-meta">' + (mine ? "You" : "Jamzie 🍓") + " · " + esc(when(m.at)) + "</div>" +
          (m.body ? '<p class="msg-body">' + esc(m.body) + "</p>" : "") +
          (m.files && m.files.length ? '<div class="msg-files">' + m.files.map(fileHtml).join("") + "</div>" : "") + "</div>";
      }).join("");
    }
    if (list.length !== lastCount) { var t = $("m-thread"); t.scrollTop = t.scrollHeight; lastCount = list.length; }
  }
  function load() {
    return portal({ action: "thread" }).then(render).catch(function () { /* the status card already explains load problems */ });
  }

  function renderPicked() {
    $("m-files-list").innerHTML = picked.map(function (f, i) {
      return '<li><span>' + esc(f.name) + " <small>" + esc(size(f.size)) + '</small></span><button type="button" class="file-x" data-rm="' + i + '" aria-label="Remove ' + esc(f.name) + '">✕</button></li>';
    }).join("");
  }
  $("m-files").addEventListener("change", function () {
    var err = [];
    Array.prototype.forEach.call(this.files || [], function (f) {
      if (picked.length >= MAX_FILES) return err.push(f.name + " (10 files max)");
      if (TYPES.indexOf(f.type) < 0) return err.push(f.name + " (unsupported type)");
      if (f.size > MAX_BYTES) return err.push(f.name + " (over 25 MB)");
      picked.push(f);
    });
    this.value = "";
    $("m-err").textContent = err.length ? "Skipped: " + err.join(", ") : "";
    renderPicked();
  });
  $("m-files-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    picked.splice(Number(b.getAttribute("data-rm")), 1); renderPicked();
  });

  $("m-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var text = $("m-text").value.trim();
    if (!text && !picked.length) { $("m-err").textContent = "Write a message or attach a file."; return; }
    busy = true; $("m-err").textContent = "";
    var btn = $("m-send"), files = picked.slice(), paths = [];
    btn.disabled = true;
    files.reduce(function (chain, f, i) {
      return chain.then(function () {
        btn.textContent = "Uploading " + (i + 1) + " of " + files.length + "…";
        return portal({ action: "upload", name: f.name, type: f.type, size: f.size }).then(function (u) {
          var url = null; try { url = new URL(u.url); } catch (x) {}
          if (!url || url.origin !== BK.url) throw new Error("Upload failed.");
          var fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", f);
          return fetch(url.toString(), { method: "PUT", headers: { "x-upsert": "false" }, body: fd }).then(function (r) {
            if (!r.ok) throw new Error(f.name + " didn't upload. Please try again.");
            paths.push(u.path);
          });
        });
      });
    }, Promise.resolve()).then(function () {
      btn.textContent = "Sending…";
      return portal({ action: "send", body: text, files: paths });
    }).then(function () {
      $("m-text").value = ""; picked = []; renderPicked();
      return load();
    }).catch(function (x) {
      $("m-err").textContent = x.message;
    }).then(function () {
      busy = false; btn.disabled = false; btn.textContent = "Send ✦";
    });
  });

  load();
  setInterval(function () { if (!document.hidden && !busy) load(); }, 30000);
})();
