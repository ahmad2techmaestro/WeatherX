// Applies the saved theme before first paint (no light/dark flash). Kept as an external
// file so the production Content-Security-Policy can stay `script-src 'self'`.
try {
  var s = JSON.parse(localStorage.getItem("wx.settings") || "{}");
  var t = s.theme === "dark" || s.theme === "light" ? s.theme : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
