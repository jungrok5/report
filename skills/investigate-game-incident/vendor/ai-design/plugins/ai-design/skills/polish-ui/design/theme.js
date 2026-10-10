// Design system "Clear" (ai-design): light/dark switch. Load in <head> so the saved theme applies before first paint.
// Without a saved choice the page follows the OS (tokens.css). A .theme-toggle button flips it and the choice is
// remembered per browser. Fires a "themechange" event on document so diagrams can redraw.
(() => {
  const root = document.documentElement, KEY = "clear-theme";
  const dark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  try { const saved = localStorage.getItem(KEY); if (saved) root.dataset.theme = saved; } catch {}
  const sync = () => document.querySelectorAll(".theme-toggle").forEach((b) => {
    b.setAttribute("aria-pressed", String(dark()));
    b.textContent = dark() ? "라이트 모드" : "다크 모드";
  });
  window.clearTheme = { isDark: dark };
  document.addEventListener("DOMContentLoaded", sync);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".theme-toggle")) return;
    root.dataset.theme = dark() ? "light" : "dark";
    try { localStorage.setItem(KEY, root.dataset.theme); } catch {}
    sync();
    document.dispatchEvent(new Event("themechange"));
  });
})();
