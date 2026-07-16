/**
 * The browser collector script served at GET /api/v1/journey/snippet.js.
 *
 * A self-contained, dependency-free IIFE a first-party landing page includes via
 * `<script src=".../snippet.js" defer>`. On an attributable campaign arrival it:
 *   1. reuses the visitor's anonymous id (localStorage, then the bsg_aid cookie),
 *   2. POSTs a `site_visit` touch to /api/v1/journey/collect,
 *   3. persists the id the server returns,
 *   4. injects a hidden `anonymousId` field into every <form> so a lead
 *      submission carries it → the ingest route stitches the pre-lead journey
 *      onto the new contact,
 *   5. exposes `window.arcJourney` — `{ anonymousId, blocked, track, consent,
 *      optOut, optIn }`.
 *
 * Consent (P4). The server is the gate (workspace mode + Sec-GPC + suppression
 * list), but the snippet applies the same rules early so a refusing visitor never
 * sends a beacon at all:
 *   • Global Privacy Control / DNT, or a stored opt-out → nothing is sent, ever.
 *   • `<script ... data-consent="required">` defers everything until the page's
 *     banner calls `arcJourney.consent(true)`.
 *   • `consent` is only claimed in the body when the page affirmatively said so
 *     (via `window.arcConsent = true` or `consent(true)`) — never by default, so
 *     a workspace in `explicit` mode is still protected if a page forgets the
 *     attribute.
 *   • `optOut()` erases server-side (POST /opt-out) and clears local state.
 *
 * The attributable-arrival rule mirrors the pure `readSnippetTouch` in `@/domain`.
 * `origin` is the app origin the script was served from, so a cross-origin
 * first-party page calls back to the right host.
 */
export function buildCollectorScript(origin = ""): string {
  const api = JSON.stringify(origin);
  return `(function () {
  var API = ${api};
  var LS = "bsg_aid", OPT = "bsg_optout";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var tag = document.currentScript;
  var deferUntilConsent = !!(tag && tag.getAttribute("data-consent") === "required");
  var consentSignal = window.arcConsent === true;
  var fired = false;

  function param(n) { try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; } }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setLs(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function delLs(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function cookieId() { var m = document.cookie.match(/(?:^|;\\s*)bsg_aid=([^;]+)/); return m ? decodeURIComponent(m[1]) : null; }
  function gpc() {
    try {
      if (navigator.globalPrivacyControl === true) return true;
      var d = navigator.doNotTrack || window.doNotTrack;
      return d === "1" || d === "yes";
    } catch (e) { return false; }
  }
  function post(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      mode: API ? "cors" : "same-origin"
    });
  }
  function injectForms(id) {
    if (!id) return;
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) {
      if (forms[i].querySelector('input[name="anonymousId"]')) continue;
      var input = document.createElement("input");
      input.type = "hidden"; input.name = "anonymousId"; input.value = id;
      forms[i].appendChild(input);
    }
  }

  var token = param("bsg_at");
  var utmCampaign = param("utm_campaign");
  var campaignId = utmCampaign && UUID.test(utmCampaign) ? utmCampaign : null;
  var channel = param("utm_source");
  var anonId = ls(LS) || cookieId();
  var refused = ls(OPT) === "1" || gpc();

  function body(kind, extra) {
    var b = {
      kind: kind,
      anonymousId: (window.arcJourney && window.arcJourney.anonymousId) || anonId || undefined,
      token: token || undefined,
      campaignId: campaignId || undefined,
      channel: channel || undefined,
      path: location.pathname,
      consent: consentSignal || undefined
    };
    for (var k in (extra || {})) b[k] = extra[k];
    return b;
  }
  function blocked() { return refused || (deferUntilConsent && !consentSignal); }

  window.arcJourney = {
    anonymousId: refused ? null : anonId,
    blocked: refused,
    track: function (kind, opts) {
      if (blocked()) return Promise.resolve(null);
      return post("/api/v1/journey/collect", body(kind, opts));
    },
    consent: function (granted) {
      consentSignal = granted !== false;
      if (consentSignal) { delLs(OPT); refused = gpc(); window.arcJourney.blocked = refused; fire(); }
      return consentSignal;
    },
    optOut: function () {
      var id = window.arcJourney.anonymousId || anonId;
      setLs(OPT, "1"); delLs(LS);
      document.cookie = "bsg_aid=; Max-Age=0; path=/";
      refused = true;
      window.arcJourney.anonymousId = null;
      window.arcJourney.blocked = true;
      return id ? post("/api/v1/journey/opt-out", { anonymousId: id }) : Promise.resolve(null);
    },
    optIn: function () { delLs(OPT); refused = gpc(); window.arcJourney.blocked = refused; return !refused; }
  };

  function fire() {
    if (fired || blocked()) return;
    // Only attributable campaign arrivals (mirrors domain readSnippetTouch).
    if (!token && !campaignId) return;
    fired = true;
    post("/api/v1/journey/collect", body("site_visit"))
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (res) {
        var id = (res && res.anonymousId) || anonId;
        if (!id) return;
        setLs(LS, id);
        window.arcJourney.anonymousId = id;
        if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { injectForms(id); }); }
        else { injectForms(id); }
      })
      .catch(function () {});
  }

  fire();
})();
`;
}
