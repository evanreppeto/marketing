// gallery-keys.js — operator-grade keyboard nav + state persistence for the gallery.
//   j / k (or ↓ / ↑ once active)  move a cursor through the screen's primary list
//   Enter                          open the cursored item
//   Esc                            clear the cursor
// Plus: remembers the active tab (data-t panes) per screen so revisiting a screen
// restores where you were. (Pane sizes + sidebar width are already persisted by
// gallery-panes.js.) Inert while typing or while the command palette is open.
(function () {
  if (window.__galleryKeysInstalled) return;
  window.__galleryKeysInstalled = true;

  var screen = location.pathname.split("/").pop() || "build-home.html";

  /* ---------- active-tab persistence (data-t / data-pane pattern) ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-t]");
    if (t && t.getAttribute("data-t")) {
      try { localStorage.setItem("tab:" + screen, t.getAttribute("data-t")); } catch (_) {}
    }
  });
  function restoreTab() {
    try {
      var saved = localStorage.getItem("tab:" + screen);
      if (!saved) return;
      var el = document.querySelector('[data-t="' + saved + '"]');
      if (el && !el.classList.contains("on")) el.click();
    } catch (_) {}
  }

  /* ---------- keyboard list navigation ---------- */
  // Candidate primary-list item selectors; the one with the most visible items
  // on the current screen wins, so j/k lands on the right list per screen.
  var CANDIDATES = [
    ".orow", ".prow", ".thread", ".connrow", ".tev", ".trow",
    ".qitem", ".ritem", ".cr", ".crow", ".lane .card", ".card", ".signal",
  ];
  var listEls = [];
  var cursor = -1;

  function vis(el) {
    var r = el.getBoundingClientRect();
    return el.offsetParent && r.height > 8 && r.width > 8;
  }
  function findList() {
    var best = [], bestN = 0;
    CANDIDATES.forEach(function (sel) {
      var els = Array.prototype.filter.call(document.querySelectorAll(sel), vis);
      if (els.length > bestN && els.length >= 3) { best = els; bestN = els.length; }
    });
    return best;
  }
  function clearCursor() {
    listEls.forEach(function (el) { el.classList.remove("kbd-cursor"); });
    cursor = -1;
  }
  function setCursor(i) {
    listEls.forEach(function (el) { el.classList.remove("kbd-cursor"); });
    cursor = (i + listEls.length) % listEls.length;
    var el = listEls[cursor];
    el.classList.add("kbd-cursor");
    el.scrollIntoView({ block: "nearest" });
  }
  function move(delta) {
    listEls = findList();
    if (!listEls.length) return;
    if (cursor < 0 || !listEls[cursor]) setCursor(delta > 0 ? 0 : listEls.length - 1);
    else setCursor(cursor + delta);
  }
  function activate() {
    if (cursor < 0 || !listEls[cursor]) return;
    var el = listEls[cursor];
    var hit = el.matches("a, button") ? el : el.querySelector('a, button, [role="button"]') || el;
    hit.click();
  }
  function typing(t) {
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
  }

  document.addEventListener("keydown", function (e) {
    if (document.body.classList.contains("cmdk-open")) return; // palette owns the keys
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target)) return;

    if (e.key === "j") { e.preventDefault(); move(1); }
    else if (e.key === "k") { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowDown" && cursor >= 0) { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp" && cursor >= 0) { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); activate(); }
    else if (e.key === "Escape" && cursor >= 0) { e.preventDefault(); clearCursor(); }
  });

  // Clear a stale cursor if the layout shifts under it.
  window.addEventListener("resize", function () { if (cursor >= 0) clearCursor(); }, { passive: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restoreTab);
  else restoreTab();
})();
