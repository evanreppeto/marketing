// Wires the mockup sidebar nav items together so the gallery feels like a real app.
// Each <a class="nav"> gets an href based on its visible text label.
(function () {
  const MAP = {
    "home": "/build-home.html",
    "arc": "/build-arc-v2.html",
    "campaigns": "/build-campaigns.html",
    "campaign builder": "/build-campaign-builder.html",
    "campaign package": "/build-campaign-builder.html",
    "crm": "/build-crm.html",
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

  // The served document never changes under us, so capture it once. Every "is
  // this the host's own screen?" decision keys off HOST_FILE — NOT the live URL,
  // which we now rewrite as the operator navigates (see history sync below).
  var HOST_FILE = currentFile();
  var HOST_URL = location.pathname + location.search;
  var HOST_TITLE = document.title;

  // The document to load in the iframe for a destination. The Arc chat needs
  // its rail-less embed; every other page hides its rail via is-embedded.
  function frameSrcFor(file) {
    return file === 'build-arc-v2.html' ? 'build-arc-embed.html' : file;
  }

  // Move keyboard/screen-reader focus onto a freshly shown screen so navigating
  // doesn't strand focus on the sidebar. We focus the CONTENT region (.main),
  // not a visible header, and hard-suppress its outline — a route-change focus
  // target must never draw a ring (after keyboard/palette nav, programmatic
  // focus can otherwise match :focus-visible and box the header in gold).
  function focusInto(win, doc) {
    try {
      var t = doc && (doc.querySelector('.main') || doc.body);
      if (!t) { if (win && win.focus) win.focus(); return; }
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
      t.style.outline = 'none';
      t.focus({ preventScroll: true });
    } catch (_) {}
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
  function naturalActive() { return anchorForFile(HOST_FILE); }

  // Two stacked iframes let the current screen stay visible while the next one
  // loads hidden, then crossfade between them — no blank flash, no glimpse of
  // the page underneath. Both live inside the host's .main and, being
  // position:absolute, never affect its layout. The fade + lift is driven by
  // the `.gm-frame` / `.gm-ready` classes in gallery-fix.css.
  var activeFrame = null;

  function ensureFrames() {
    var main = document.querySelector('.main');
    if (!main) return null;
    if (getComputedStyle(main).position === 'static') main.style.position = 'relative';
    return ['arcFrame', 'arcFrame2'].map(function (id) {
      var f = document.getElementById(id);
      if (!f) {
        f = document.createElement('iframe');
        f.id = id;
        f.title = 'Workspace';
        main.appendChild(f);
      }
      // Normalise every time: the home page ships a hardcoded #arcFrame (the
      // old Arc-embed overlay) with its own inline display:none / z-index. Adopt
      // it into the crossfade system instead of fighting those inline styles —
      // give both frames the gm-frame class and one canonical style so they
      // hide via opacity (transitionable) rather than display (not).
      if (!f.classList.contains('gm-frame')) f.classList.add('gm-frame');
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;z-index:30;background:var(--canvas,#16161a)';
      return f;
    });
  }

  // An opaque canvas layer behind the crossfade frames (z-index 29, under the
  // frames' 30/31) and above the host page's own .main content. While an overlay
  // screen shows it hides the host content, so the host page — usually Home, when
  // you enter at `/` — never bleeds through the frames' opacity crossfade. It
  // snaps on/off with no transition: it is the flat canvas colour, so there's
  // nothing to animate and no home-ghost to glimpse mid-fade.
  function ensureBackdrop() {
    var main = document.querySelector('.main');
    if (!main) return null;
    var b = document.getElementById('gmBackdrop');
    if (!b) {
      b = document.createElement('div');
      b.id = 'gmBackdrop';
      b.setAttribute('aria-hidden', 'true');
      main.appendChild(b);
    }
    // `animation:none` opts the backdrop out of the `.main > *` gm-rise entrance
    // animation (gallery-fix.css) — otherwise that keyframe drives opacity and
    // overrides the inline value we toggle here (CSS animations beat inline
    // styles). It's a flat colour layer; it just snaps on/off via opacity.
    b.style.cssText = 'position:absolute;inset:0;z-index:29;background:var(--canvas,#16161a);opacity:0;pointer-events:none;animation:none';
    return b;
  }

  // Reveal the host page underneath by fading BOTH frames out and dropping the
  // backdrop so the host content shows again.
  function hideOverlay() {
    ['arcFrame', 'arcFrame2'].forEach(function (id) {
      var f = document.getElementById(id);
      if (f) f.classList.remove('gm-ready');
    });
    var bd = document.getElementById('gmBackdrop');
    if (bd) bd.style.opacity = '0';
    activeFrame = null;
    document.body.classList.remove('shell-open', 'arc-open');
  }

  function showOverlay(src) {
    var frames = ensureFrames();
    if (!frames) return;
    document.body.classList.add('shell-open');
    // Cover the host page (e.g. Home) so it can't ghost through the crossfade.
    var backdrop = ensureBackdrop();
    if (backdrop) backdrop.style.opacity = '1';

    // Already the active document — just make sure it is the one showing.
    if (activeFrame && activeFrame.__src === src) {
      activeFrame.style.zIndex = '31';
      activeFrame.classList.add('gm-ready');
      return;
    }

    var incoming = (frames[0] === activeFrame) ? frames[1] : frames[0];
    var outgoing = activeFrame;

    incoming.style.zIndex = '31';           // incoming rides above the outgoing
    incoming.classList.remove('gm-ready');  // hidden + lifted until loaded

    var done = false;
    function crossfade() {
      if (done) return;
      done = true;
      // Force a reflow so the pre-reveal state is committed before we flip to
      // `.gm-ready` — that's what makes the transition actually play. (A
      // requestAnimationFrame would be cleaner but gets paused in a hidden or
      // backgrounded tab, which would leave the incoming screen stuck hidden.)
      void incoming.offsetWidth;
      incoming.classList.add('gm-ready');
      if (outgoing && outgoing !== incoming) {
        outgoing.classList.remove('gm-ready');
        outgoing.style.zIndex = '30';
      }
      activeFrame = incoming;
      // Reflect the shown screen to the tab title + assistive tech.
      try {
        var idoc = incoming.contentDocument;
        if (idoc && idoc.title) document.title = idoc.title;
        focusInto(incoming.contentWindow, idoc);
      } catch (_) {}
    }

    if (incoming.__src === src) {
      crossfade(); // this frame already holds the document — reuse, no reload
    } else {
      incoming.__src = src;
      incoming.onload = crossfade;
      loadFrame(incoming, src);
      setTimeout(crossfade, 650); // safety net if a load stalls or is blocked
    }
  }

  // Point a frame at `src` WITHOUT adding a browser-history entry once it already
  // holds a document — a plain `iframe.src =` pushes onto the session history,
  // which would double every nav and break Back/Forward (our pushState is the
  // single source of truth). The very first load uses `.src` (initial frame
  // loads add no entry); every load after that uses location.replace().
  function loadFrame(frame, src) {
    var w = frame.contentWindow, hasDoc = false;
    try { hasDoc = !!(w && w.location && w.location.href && w.location.href !== 'about:blank'); } catch (_) { hasDoc = false; }
    if (hasDoc) {
      try { w.location.replace(src); return; } catch (_) {}
    }
    frame.src = src;
  }

  // Navigate the shell to a destination page (e.g. "build-crm.html"), keeping
  // the host sidebar in place. If the destination IS the host's own page, the
  // overlay just hides to reveal it underneath — no reload either way.
  function shellNav(file, anchor, opts) {
    opts = opts || {};
    file = base(file);
    if (!file) return;
    anchor = anchor || anchorForFile(file);
    var isHost = (file === HOST_FILE);

    if (isHost) {
      hideOverlay();
      setActive(anchor || naturalActive());
      document.title = HOST_TITLE;
      focusInto(window, document);
    } else {
      showOverlay(frameSrcFor(file)); // crossfade() syncs title + focus on load
      if (file === 'build-arc-v2.html') document.body.classList.add('arc-open');
      else document.body.classList.remove('arc-open');
      setActive(anchor);
    }

    // Keep the address bar, Back/Forward and deep-links honest: each screen has
    // a real URL (its own static file, or the host's URL for the home screen).
    // popstate replays a nav with push:false so we don't re-stack history.
    if (opts.push !== false) {
      var url = isHost ? HOST_URL : ('/' + file);
      if ((location.pathname + location.search) !== url) {
        try { history.pushState({ shellFile: file }, '', url); } catch (_) {}
      }
    }
  }
  window.__shellNav = shellNav;
  window.__arcOpen = function () { shellNav('build-arc-v2.html'); };
  window.__arcClose = function () { shellNav(HOST_FILE); };

  // Tag the initial entry so a Back to it carries the host file in its state.
  try { history.replaceState({ shellFile: HOST_FILE }, '', HOST_URL); } catch (_) {}
  window.addEventListener('popstate', function (e) {
    var file = (e.state && e.state.shellFile) || base(location.pathname) || HOST_FILE;
    shellNav(file, null, { push: false });
  });

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
      shellNav(HOST_FILE);
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
    if (window.innerWidth > 1024 && document.body.classList.contains('nav-open')) close();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
