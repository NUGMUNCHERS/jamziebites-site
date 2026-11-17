/* Runs in <head> before paint: picks the theme (no flash) and refuses to be
   framed by other sites (clickjacking protection — GitHub Pages can't send a
   frame-ancestors header, so this does it in script). */
(function () {
  var d = document.documentElement;
  if (window.top !== window.self) {
    d.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (e) {}
  }
  var t = null;
  try { t = localStorage.getItem("jb-theme"); } catch (e) {}
  if (!t) t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  d.setAttribute("data-theme", t);
})();
