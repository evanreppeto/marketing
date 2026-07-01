// gallery-panes.js — drag-to-resize + double-click-to-collapse for the app-shell
// panes. Generic and defensive: it detects each known grid shell, treats the
// widest column as the flexible one, and makes the fixed side-panes resizable.
// Widths persist per (screen, container, column) in localStorage. Auto-disabled
// when gallery-fix.css has stacked the panes on narrow screens (display:block).
(function () {
  if (window.__galleryPanesInstalled) return;
  window.__galleryPanesInstalled = true;

  // Grid containers we make resizable, with the candidate fixed (side) columns
  // and clamp bounds. The flexible column is auto-detected (widest), so the
  // 2-col / 3-col / detail variants all work without per-variant config.
  //
  // NOTE: only grids that keep a STABLE column layout are listed. Panes that
  // toggle their own grid via a class (Personas .pbody → .cmp Compare, Library
  // .lib → .lib.detail, Arc .chat → .tcollapsed) are intentionally excluded:
  // our inline grid-template-columns would override those class changes (inline
  // beats a class) and break the mode switch — e.g. the Compare view collapsing
  // into a narrow column. The sidebar + content rails are what matter to resize.
  var GRIDS = [
    { sel: ".app",     fixed: [0],    min: 206, max: 300 }, // sidebar — resize only, labels always shown
    { sel: ".scroll",  fixed: [1],    min: 240, max: 560 }, // home right rail
    { sel: ".studio",  fixed: [0, 2], min: 180, max: 460 }, // sources + design rail
    { sel: ".oppgrid", fixed: [0],    min: 260, max: 540 }, // opportunities list
    { sel: ".web",     fixed: [1],    min: 260, max: 520 }, // brain inspector
    { sel: ".pkggrid", fixed: [1],    min: 260, max: 520 }, // campaign rail
    { sel: ".recbody", fixed: [1],    min: 260, max: 520 }, // crm record rail
    { sel: ".bbody",   fixed: [1],    min: 260, max: 520 }, // brand rail
    { sel: ".setbody", fixed: [0],    min: 190, max: 420 }, // settings nav
  ];

  var DEFAULTS = { min: 160, max: 560 };
  var screenKey = (location.pathname.split("/").pop() || "build-home.html");

  function store(sel, idx, w) {
    try { localStorage.setItem("gp:" + screenKey + ":" + sel + ":" + idx, String(Math.round(w))); } catch (_) {}
  }
  function recall(sel, idx) {
    try {
      var v = localStorage.getItem("gp:" + screenKey + ":" + sel + ":" + idx);
      return v == null ? null : parseFloat(v);
    } catch (_) { return null; }
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Read the resolved column widths (px) of a grid container.
  function colWidths(el) {
    var t = getComputedStyle(el).gridTemplateColumns;
    if (!t || t === "none") return [];
    return t.split(" ").map(function (s) { return parseFloat(s); }).filter(function (n) { return !isNaN(n); });
  }

  function isGrid(el) { return getComputedStyle(el).display === "grid"; }

  // Per-container live state lives on the element so re-applies are idempotent.
  function build(cfg, el) {
    if (el.__gp) return el.__gp;
    var gp = { cfg: cfg, el: el, cols: {}, flex: -1, count: 0, handles: [] };
    el.__gp = gp;
    return gp;
  }

  function rebuildTemplate(gp) {
    var parts = [];
    for (var i = 0; i < gp.count; i++) {
      if (i === gp.flex) parts.push("minmax(0,1fr)");
      else if (gp.cols[i] != null) parts.push(gp.cols[i] + "px");
      else parts.push("auto");
    }
    gp.el.style.gridTemplateColumns = parts.join(" ");
  }

  function clearHandles(gp) {
    gp.handles.forEach(function (h) { if (h.parentNode) h.parentNode.removeChild(h); });
    gp.handles = [];
  }

  function teardown(gp) {
    clearHandles(gp);
    gp.el.classList.remove("gp-grid");
    gp.el.style.gridTemplateColumns = "";
    gp.count = 0;
  }

  function apply(cfg, el) {
    var gp = build(cfg, el);

    // Stacked (narrow) — gallery-fix.css owns the layout; stand down.
    if (!isGrid(el)) { teardown(gp); return; }

    var widths = colWidths(el);
    if (widths.length < 2) { teardown(gp); return; }
    el.classList.add("gp-grid");

    // Capture the authored widths once (first apply, before any inline override)
    // so double-click can reset a pane to its default.
    if (!gp.natural) gp.natural = widths.slice();

    // Flexible column = the widest column that is NOT a configured side-pane.
    // (Restricting to non-fixed columns avoids a load-time trap: before the page
    // injects content, the main column can measure 0px and a fixed side-pane
    // would otherwise look "widest" and wrongly become the flexible one.)
    var fixedSet = cfg.fixed || [];
    var flex = -1;
    for (var i = 0; i < widths.length; i++) {
      if (fixedSet.indexOf(i) !== -1) continue;
      if (flex === -1 || widths[i] > widths[flex]) flex = i;
    }
    if (flex === -1) { teardown(gp); return; }

    var changed = gp.count !== widths.length || gp.flex !== flex;
    gp.count = widths.length;
    gp.flex = flex;

    // Seed each column's px from recalled or current width.
    for (var c = 0; c < widths.length; c++) {
      if (c === flex) continue;
      if (gp.cols[c] == null) {
        var saved = recall(cfg.sel, c);
        gp.cols[c] = saved != null ? clamp(saved, cfg.min || DEFAULTS.min, cfg.max || DEFAULTS.max) : widths[c];
      }
    }
    rebuildTemplate(gp);

    var kids = Array.prototype.filter.call(el.children, function (n) { return n.nodeType === 1; });

    // (Re)create handles only on the configured, in-range, non-flex columns.
    if (changed || gp.handles.length === 0) {
      clearHandles(gp);
      (cfg.fixed || []).forEach(function (idx) {
        if (idx === flex || idx >= widths.length) return;
        var pane = kids[idx];
        if (!pane) return;
        if (getComputedStyle(pane).position === "static") pane.style.position = "relative";
        var side = idx < flex ? "right" : "left"; // handle faces the flex column
        addHandle(gp, pane, idx, side);
      });
    }
  }

  function addHandle(gp, pane, idx, side) {
    var h = document.createElement("div");
    h.className = "gp-handle gp-" + side;
    h.setAttribute("role", "separator");
    h.setAttribute("aria-orientation", "vertical");
    h.title = "Drag to resize · double-click to reset";
    pane.appendChild(h);
    gp.handles.push(h);

    var startX = 0, startW = 0, dragging = false;
    var lo = gp.cfg.min || DEFAULTS.min, hi = gp.cfg.max || DEFAULTS.max;

    function move(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      gp.cols[idx] = clamp(side === "right" ? startW + dx : startW - dx, lo, hi);
      rebuildTemplate(gp);
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      h.classList.remove("gp-dragging");
      document.body.classList.remove("gp-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      store(gp.cfg.sel, idx, gp.cols[idx]);
    }
    h.addEventListener("pointerdown", function (e) {
      if (!isGrid(gp.el)) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = gp.cols[idx];
      h.classList.add("gp-dragging");
      document.body.classList.add("gp-resizing");
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    // Double-click the divider resets the pane to its default width.
    h.addEventListener("dblclick", function (e) {
      e.preventDefault();
      var nat = gp.natural && gp.natural[idx] != null ? gp.natural[idx] : gp.cols[idx];
      gp.cols[idx] = clamp(nat, lo, hi);
      rebuildTemplate(gp);
      store(gp.cfg.sel, idx, gp.cols[idx]);
    });
  }

  function applyAll() {
    GRIDS.forEach(function (cfg) {
      var nodes = document.querySelectorAll(cfg.sel);
      Array.prototype.forEach.call(nodes, function (el) { try { apply(cfg, el); } catch (_) {} });
    });
  }

  function run() {
    applyAll();
    var raf = null;
    window.addEventListener("resize", function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyAll);
    }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
