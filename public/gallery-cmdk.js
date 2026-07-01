// gallery-cmdk.js — a real command palette for the gallery. Opens on ⌘K / Ctrl+K,
// on "/" (when not typing), or by clicking the header search bar. Fuzzy-filters a
// list of screens + actions; arrow keys move, Enter jumps, Esc closes.
(function () {
  if (window.__galleryCmdkInstalled) return;
  window.__galleryCmdkInstalled = true;

  // Glyphs mirror the sidebar nav so the palette reads as the same app.
  var ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    arc: '<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/>',
    campaigns: '<path d="M4 5h16v6H4z"/><path d="M4 15h10v4H4z"/>',
    crm: '<circle cx="9" cy="8" r="3"/><path d="M4 20c0-3 2-5 5-5s5 2 5 5"/><path d="M16 6h5M16 10h5"/>',
    opportunities: '<path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 21l-5-2.7 1-5.5-4-4 5.5-.8z"/>',
    analytics: '<path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-8"/>',
    brain: '<path d="M12 4a4 4 0 00-4 4 3 3 0 00-1 6 3 3 0 003 3 3 3 0 006 0 3 3 0 003-3 3 3 0 00-1-6 4 4 0 00-4-4z"/>',
    personas: '<circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-3 2-4.5 5-4.5M21 19c0-3-2-4.5-5-4.5M9 19c0-2 1.5-3 3-3s3 1 3 3"/>',
    studio: '<path d="M4 5h16v14H4z"/><path d="M4 14l5-4 4 3 3-2 4 3"/><circle cx="9" cy="9" r="1.4"/>',
    library: '<path d="M4 7h6l2 2h8v10H4z"/>',
    brand: '<path d="M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z"/>',
    outbox: '<path d="M3 12l18-8-8 18-2-7z"/>',
    settings: '<circle cx="8" cy="12" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="13" cy="17" r="2"/><path d="M4 12h2M10 12h10M4 7h10M18 7h2M4 17h7M15 17h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    lead: '<circle cx="10" cy="8" r="3"/><path d="M4 20c0-3.3 2.7-5 6-5"/><path d="M18 9v6M15 12h6"/>',
    spark: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 14l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>',
  };

  var PAGES = [
    { label: "Home", sub: "Command center", href: "/build-home.html", keys: "dashboard overview today", icon: ICON.home },
    { label: "Arc", sub: "Chat with Arc", href: "/build-arc-v2.html", keys: "agent assistant chat ai", icon: ICON.arc },
    { label: "Campaigns", sub: "Campaign package builder", href: "/build-campaign-builder.html", keys: "campaign builder email sms ads landing", icon: ICON.campaigns },
    { label: "CRM", sub: "Contacts & records", href: "/build-crm.html", keys: "contacts companies leads accounts", icon: ICON.crm },
    { label: "Opportunities", sub: "Opportunity inbox", href: "/build-opportunities.html", keys: "opps signals leads inbox", icon: ICON.opportunities },
    { label: "Analytics", sub: "Performance & reporting", href: "/build-analytics.html", keys: "reports metrics performance charts", icon: ICON.analytics },
    { label: "Brain", sub: "Arc's knowledge graph", href: "/build-brain.html", keys: "memory knowledge graph facts recall", icon: ICON.brain },
    { label: "Personas", sub: "Revenue intelligence", href: "/build-personas.html", keys: "segments audience playbooks", icon: ICON.personas },
    { label: "Studio", sub: "Creative studio", href: "/build-studio.html", keys: "creative ads media generate images video", icon: ICON.studio },
    { label: "Library", sub: "Media & files", href: "/build-library.html", keys: "media assets files photos documents", icon: ICON.library },
    { label: "Brand", sub: "Brand profile", href: "/build-brand.html", keys: "identity palette voice logo", icon: ICON.brand },
    { label: "Outbox", sub: "Board & dispatch", href: "/build-outbox.html", keys: "board dispatch sends queue kanban", icon: ICON.outbox },
    { label: "Settings", sub: "Workspace settings", href: "/build-settings.html", keys: "preferences account config models tokens", icon: ICON.settings },
  ];
  var ACTIONS = [
    { label: "New campaign", sub: "Action", href: "/build-campaign-builder.html", keys: "create draft package", action: true, icon: ICON.plus },
    { label: "Add a lead", sub: "Action", href: "/build-crm.html", keys: "new contact lead", action: true, icon: ICON.lead },
    { label: "Ask Arc", sub: "Action", href: "/build-arc-v2.html", keys: "chat agent question prompt", action: true, icon: ICON.spark },
  ];
  var ALL = PAGES.concat(ACTIONS);

  var overlay, input, list, empty, items = [], active = -1, open = false;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m];
    });
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "cmdk-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cmdk-backdrop"></div>' +
      '<div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<div class="cmdk-inputrow">' +
          '<svg class="cmdk-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
          '<input class="cmdk-input" type="text" placeholder="Jump to a screen or run an action…" aria-label="Command palette" autocomplete="off" spellcheck="false" />' +
          '<span class="cmdk-esc">esc</span>' +
        "</div>" +
        '<ul class="cmdk-list" role="listbox"></ul>' +
        '<div class="cmdk-empty" hidden>No matches</div>' +
      "</div>";
    document.body.appendChild(overlay);
    input = overlay.querySelector(".cmdk-input");
    list = overlay.querySelector(".cmdk-list");
    empty = overlay.querySelector(".cmdk-empty");

    overlay.querySelector(".cmdk-backdrop").addEventListener("click", close);
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", onInputKey);
    list.addEventListener("mousemove", function (e) {
      var li = e.target.closest(".cmdk-item");
      if (li) setActive(items.indexOf(li));
    });
    list.addEventListener("click", function (e) {
      var li = e.target.closest(".cmdk-item");
      if (li) go(items.indexOf(li));
    });
  }

  function score(cmd, q) {
    if (!q) return 1;
    q = q.toLowerCase();
    var label = cmd.label.toLowerCase();
    var hay = (cmd.label + " " + (cmd.keys || "") + " " + (cmd.sub || "")).toLowerCase();
    if (label === q) return 1200;
    if (label.indexOf(q) === 0) return 1000;
    if (label.indexOf(q) !== -1) return 800;
    if (hay.indexOf(q) !== -1) return 500;
    // Loosest tier: subsequence on the LABEL only (keys already covered by the
    // substring tier above) — keeps fuzzy matches tight instead of matching
    // almost everything via scattered letters across the keywords.
    var i = 0;
    for (var j = 0; j < label.length && i < q.length; j++) if (label[j] === q[i]) i++;
    return i === q.length ? 200 - label.length : -1;
  }

  function render(q) {
    var results = ALL
      .map(function (c) { return { c: c, s: score(c, q) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (x) { return x.c; });

    list.innerHTML = "";
    items = [];
    empty.hidden = results.length > 0;
    results.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "cmdk-item";
      li.setAttribute("role", "option");
      li.dataset.href = c.href;
      li.innerHTML =
        '<span class="cmdk-icon' + (c.action ? " is-action" : "") + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + (c.icon || "") + "</svg>" +
        "</span>" +
        '<span class="cmdk-lbl">' + esc(c.label) + "</span>" +
        '<span class="cmdk-sub">' + esc(c.sub || "") + "</span>";
      list.appendChild(li);
      items.push(li);
    });
    setActive(results.length ? 0 : -1);
  }

  function setActive(i) {
    active = i;
    for (var n = 0; n < items.length; n++) {
      var on = n === i;
      items[n].classList.toggle("is-active", on);
      items[n].setAttribute("aria-selected", on ? "true" : "false");
    }
    if (i >= 0 && items[i]) items[i].scrollIntoView({ block: "nearest" });
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setActive((active + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive((active - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  }

  function go(i) {
    if (i < 0 || !items[i]) return;
    var href = items[i].dataset.href;
    close();
    // Navigate in-shell (overlay on .main) like the rail — no page load, no
    // sidebar flicker. Falls back to a normal load when the shell isn't present.
    if (window.__shellNav) { window.__shellNav(href); return; }
    location.href = href;
  }

  function openPalette() {
    if (!overlay) build();
    if (open) return;
    open = true;
    overlay.hidden = false;
    document.body.classList.add("cmdk-open");
    input.value = "";
    render("");
    input.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    document.body.classList.remove("cmdk-open");
  }

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      open ? close() : openPalette();
      return;
    }
    if (e.key === "/" && !open) {
      var t = e.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
      if (!typing) { e.preventDefault(); openPalette(); }
    }
  });

  function wireSearch() {
    document.querySelectorAll(".search, .tsearch, .gsearch, .lsearch, .setsearch, .ssearch").forEach(function (el) {
      if (el.__cmdk) return;
      // Opt-out: boxes marked data-inline filter their own list in-page and must
      // NOT hijack focus into the command palette.
      if (el.hasAttribute("data-inline")) return;
      el.__cmdk = true;
      el.style.cursor = "text";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.addEventListener("click", function (e) { e.preventDefault(); openPalette(); });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPalette(); }
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireSearch);
  else wireSearch();
})();
