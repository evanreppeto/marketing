// Wires the mockup sidebar nav items together so the gallery feels like a real app.
// Each <a class="nav"> gets an href based on its visible text label.
(function () {
  const MAP = {
    "home": "/build-home.html",
    "arc": "/build-arc-v2.html",
    "campaigns": "/campaigns",
    "campaign builder": "/build-campaign-builder.html",
    "campaign package": "/build-campaign-builder.html",
    "crm": "/crm",
    "opportunities": "/build-opportunities.html",
    "analytics": "/build-analytics.html",
    "brain": "/build-brain.html",
    "personas": "/build-personas.html",
    "studio": "/build-studio.html",
    "creative studio": "/build-studio.html",
    "library": "/build-library.html",
    "brand": "/build-brand.html",
    "outbox": "/build-outbox.html",
    "settings": "/build-settings.html",
  };

  function wire() {
    const anchors = document.querySelectorAll("a.nav");
    anchors.forEach((a) => {
      if (a.getAttribute("href")) return;
      const label = (a.textContent || "").trim().toLowerCase();
      const url = MAP[label];
      if (url) {
        a.setAttribute("href", url);
        a.style.cursor = "pointer";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();


/* =====================================================================
   Prefetch-on-hover for cross-document nav — makes clicks feel instant.
   Tiny, idempotent, no dependencies.
   ===================================================================== */
(function () {
  if (window.__galleryPrefetchInstalled) return;
  window.__galleryPrefetchInstalled = true;

  var prefetched = new Set();

  function prefetch(href) {
    if (!href || prefetched.has(href)) return;
    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;
    } catch (_) { return; }

    prefetched.add(href);
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    try { document.head.appendChild(link); } catch (_) { prefetched.delete(href); }
  }

  function handler(e) {
    var a = e.target.closest('a.nav, .nav a, a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) return;
    prefetch(a.href);
  }

  document.addEventListener('mouseover', handler, { passive: true });
  document.addEventListener('focusin', handler, { passive: true });
  document.addEventListener('touchstart', handler, { passive: true });
})();


/* =====================================================================
   Accessibility + orientation polish. Idempotent, dependency-free.
   - Mirror any title="" on icon-only controls into aria-label (the gallery
     has zero aria-labels otherwise).
   - Mark the nav item matching the current page with aria-current.
   - Make the workspace logo / wordmark route Home like a real app.
   ===================================================================== */
(function () {
  if (window.__galleryA11yInstalled) return;
  window.__galleryA11yInstalled = true;

  function labelIconButtons() {
    document.querySelectorAll('button, [role="button"]').forEach(function (b) {
      if (b.getAttribute('aria-label')) return;
      if ((b.textContent || '').trim()) return; // has a visible text name
      var t = b.getAttribute('title');
      if (t) b.setAttribute('aria-label', t);
    });
  }

  function markActiveNav() {
    var here = (location.pathname.split('/').pop() || 'build-home.html');
    document.querySelectorAll('a.nav[href]').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('/').pop();
      if (href && href === here) a.setAttribute('aria-current', 'page');
    });
  }

  function wireLogoHome() {
    document.querySelectorAll('.ws img, .crumb img, .empty .logo').forEach(function (img) {
      if (img.closest('a')) return;
      img.style.cursor = 'pointer';
      img.setAttribute('role', 'link');
      img.setAttribute('tabindex', '0');
      if (!img.getAttribute('aria-label')) img.setAttribute('aria-label', 'Go to Home');
      function go() { location.href = '/build-home.html'; }
      img.addEventListener('click', go);
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function run() { labelIconButtons(); markActiveNav(); wireLogoHome(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();


/* =====================================================================
   Persistent app shell — shared across every screen, one implementation.
   The sidebar lives in the host page and NEVER reloads. Clicking ANY nav
   item swaps the main content to that page inside an iframe overlay (no
   page load, no sidebar flicker), instead of navigating the whole document
   — the same smooth behavior Arc/Home already had, now for every screen.
   Each embedded page hides its own rail via the html.is-embedded class
   (an inline <head> script) so only the host's sidebar shows. The Arc chat
   loads build-arc-embed.html; every other page loads its normal build-*.html.
   A CAPTURE-phase listener intercepts nav clicks BEFORE any per-page
   location.href handlers, so the shell wins on every screen.
   ===================================================================== */
(function () {
  if (window.__galleryShell) return;
  window.__galleryShell = true;
  if (window.top !== window.self) return; // inside the shell iframe: no nested shell

  function base(href) { return (href || '').split('?')[0].split('#')[0].split('/').pop(); }
  function currentFile() { return base(location.pathname) || 'build-home.html'; }

  // The document to load in the iframe for a destination. The Arc chat needs
  // its rail-less embed; every other page hides its rail via is-embedded.
  function frameSrcFor(file) {
    return file === 'build-arc-v2.html' ? 'build-arc-embed.html' : file;
  }

  function setActive(target) {
    document.querySelectorAll('a.nav').forEach(function (x) {
      x.classList.remove('on');
      x.removeAttribute('aria-current');
      var t = x.querySelector('.tick');
      if (t) t.remove();
    });
    if (!target) return;
    target.classList.add('on');
    target.setAttribute('aria-current', 'page');
    if (!target.querySelector('.tick')) {
      var s = document.createElement('span');
      s.className = 'tick';
      target.insertBefore(s, target.firstChild);
    }
  }
  function anchorForFile(file) {
    var hit = null;
    document.querySelectorAll('a.nav').forEach(function (a) {
      if (base(a.getAttribute('href')) === file) hit = a;
    });
    return hit;
  }
  function naturalActive() { return anchorForFile(currentFile()); }

  function ensureFrame() {
    var f = document.getElementById('arcFrame');
    if (f) return f;
    var main = document.querySelector('.main');
    if (!main) return null;
    if (getComputedStyle(main).position === 'static') main.style.position = 'relative';
    f = document.createElement('iframe');
    f.id = 'arcFrame';
    f.title = 'Workspace';
    f.style.cssText = 'display:none;position:absolute;inset:0;width:100%;height:100%;border:0;z-index:30;background:var(--canvas,#16161a)';
    main.appendChild(f);
    return f;
  }

  var overlaySrc = null;
  function hideOverlay() {
    var f = document.getElementById('arcFrame');
    if (f) f.style.display = 'none';
    document.body.classList.remove('shell-open', 'arc-open');
    overlaySrc = null;
  }
  function showOverlay(src) {
    var f = ensureFrame();
    if (!f) return;
    if (overlaySrc !== src) { f.src = src; overlaySrc = src; }
    f.style.display = 'block';
    document.body.classList.add('shell-open');
  }

  // Navigate the shell to a destination page (e.g. "build-crm.html"), keeping
  // the host sidebar in place. If the destination IS the host's own page, the
  // overlay just hides to reveal it underneath — no reload either way.
  function shellNav(file, anchor) {
    file = base(file);
    if (!file) return;
    anchor = anchor || anchorForFile(file);
    if (file === currentFile()) {
      hideOverlay();
      setActive(anchor || naturalActive());
      return;
    }
    showOverlay(frameSrcFor(file));
    if (file === 'build-arc-v2.html') document.body.classList.add('arc-open');
    else document.body.classList.remove('arc-open');
    setActive(anchor);
  }
  window.__shellNav = shellNav;
  window.__arcOpen = function () { shellNav('build-arc-v2.html'); };
  window.__arcClose = function () { hideOverlay(); setActive(naturalActive()); };

  // One capture-phase delegate fires BEFORE any per-page bubble handlers, and
  // stopImmediatePropagation prevents their full-page location.href reloads.
  document.addEventListener('click', function (e) {
    var el = e.target;
    var a = el && el.closest ? el.closest('a.nav') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return; // not a wired destination
    // On phones the sidebar is an off-canvas drawer (see gallery-fix.css +
    // the drawer module below). The iframe overlay would cover the top bar's
    // hamburger, so on mobile we skip the shell entirely and let the anchor
    // navigate as a normal full page load — each page shows its own drawer.
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Ported real Next.js screens (no .html) are full pages with their own shell —
    // navigate the whole document into the real app. Not-yet-ported gallery
    // screens (build-*.html) keep the smooth in-shell iframe swap.
    if (!/\.html($|[?#])/.test(href)) { window.location.href = href; return; }
    shellNav(href, a);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('shell-open')) {
      hideOverlay();
      setActive(naturalActive());
    }
  });
})();


/* =====================================================================
   Profile settings cog. The sidebar's user row shipped with a bare
   unicode glyph (<span class="cog">⚙</span>) that was tiny and inert —
   it neither looked like the rest of the SVG icon set nor opened the
   settings screen. Upgrade it in place, everywhere, to a properly sized
   gear that routes to build-settings.html through the persistent shell
   (falling back to a full navigation when the shell isn't installed).
   Inline sizing keeps it identical across all pages regardless of each
   page's per-file .cog CSS. Idempotent.
   ===================================================================== */
(function () {
  var GEAR = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  function go(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof window.__shellNav === 'function') window.__shellNav('/build-settings.html');
    else location.href = '/build-settings.html';
  }

  function wireCogs() {
    document.querySelectorAll('.user .cog').forEach(function (cog) {
      if (cog.dataset.settingsWired) return;
      cog.dataset.settingsWired = '1';
      cog.innerHTML = GEAR;
      cog.setAttribute('role', 'link');
      cog.setAttribute('tabindex', '0');
      cog.setAttribute('title', 'Settings');
      cog.setAttribute('aria-label', 'Settings');
      cog.style.cursor = 'pointer';
      cog.style.display = 'inline-flex';
      cog.style.alignItems = 'center';
      cog.style.justifyContent = 'center';
      cog.addEventListener('click', go);
      cog.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireCogs);
  } else {
    wireCogs();
  }
})();


/* =====================================================================
   Mobile navigation drawer. On phones the fixed sidebar is pulled off-canvas
   (see the MOBILE block in gallery-fix.css). This injects the hamburger
   toggle into the top bar plus a dim scrim, and wires open/close: tap the
   toggle, tap the scrim, choose a nav item, press Escape, or resize back to
   desktop. Idempotent, dependency-free. Skipped inside the persistent-shell
   iframe (its rail is hidden via html.is-embedded, so there's nothing to
   toggle).
   ===================================================================== */
(function () {
  if (window.__galleryDrawer) return;
  window.__galleryDrawer = true;
  if (document.documentElement.classList.contains('is-embedded')) return;

  var MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';

  function setExpanded(v) {
    var b = document.querySelector('.navtoggle');
    if (b) b.setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  function open() { document.body.classList.add('nav-open'); setExpanded(true); }
  function close() { document.body.classList.remove('nav-open'); setExpanded(false); }
  function toggle() { document.body.classList.contains('nav-open') ? close() : open(); }

  function build() {
    var top = document.querySelector('.main > .top') || document.querySelector('.top');
    var rail = document.querySelector('.rail, aside.rail, .sidebar');
    if (!top || !rail || document.querySelector('.navtoggle')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'navtoggle';
    btn.setAttribute('aria-label', 'Open navigation');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = MENU;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    top.insertBefore(btn, top.firstChild);

    var scrim = document.createElement('div');
    scrim.className = 'navscrim';
    scrim.setAttribute('aria-hidden', 'true');
    scrim.addEventListener('click', close);
    document.body.appendChild(scrim);

    // Choosing a destination closes the drawer. On mobile the shell is
    // bypassed so this is followed by a normal full-page navigation.
    rail.addEventListener('click', function (e) {
      if (e.target.closest('a.nav, a[href]')) close();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) close();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 760 && document.body.classList.contains('nav-open')) close();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
