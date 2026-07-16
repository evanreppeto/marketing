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
 *   5. exposes `window.arcJourney.{anonymousId, track(kind, opts)}` for custom
 *      events (form_view, video_view, ad_click…).
 *
 * The attributable-arrival rule mirrors the pure `readSnippetTouch` in
 * `@/domain` (kept in sync by the served-script test). `origin` is the app origin
 * the script was served from, so a cross-origin first-party page calls back to
 * the right host; same-origin includes get "".
 */
export function buildCollectorScript(origin = ""): string {
  const api = JSON.stringify(origin);
  return `(function () {
  var API = ${api};
  var LS = "bsg_aid";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function param(n) { try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; } }
  function stored() {
    try { var v = localStorage.getItem(LS); if (v) return v; } catch (e) {}
    var m = document.cookie.match(/(?:^|;\\s*)bsg_aid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function keep(id) { try { localStorage.setItem(LS, id); } catch (e) {} }
  function post(body) {
    return fetch(API + "/api/v1/journey/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      mode: API ? "cors" : "same-origin"
    });
  }
  var token = param("bsg_at");
  var utmCampaign = param("utm_campaign");
  var campaignId = utmCampaign && UUID.test(utmCampaign) ? utmCampaign : null;
  var channel = param("utm_source");
  var anonId = stored();
  function expose(id) {
    window.arcJourney = {
      anonymousId: id || null,
      track: function (kind, opts) {
        opts = opts || {};
        var b = { kind: kind, anonymousId: (window.arcJourney && window.arcJourney.anonymousId) || undefined, token: token || undefined, campaignId: campaignId || undefined, channel: channel || undefined, path: location.pathname };
        for (var k in opts) b[k] = opts[k];
        return post(b);
      }
    };
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
  // Only track attributable campaign arrivals (mirrors domain readSnippetTouch).
  if (!token && !campaignId) { expose(anonId); return; }
  post({ kind: "site_visit", anonymousId: anonId || undefined, token: token || undefined, campaignId: campaignId || undefined, channel: channel || undefined, path: location.pathname })
    .then(function (r) { return r && r.ok ? r.json() : null; })
    .then(function (res) {
      var id = (res && res.anonymousId) || anonId;
      if (id) keep(id);
      expose(id);
      if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function () { injectForms(id); }); }
      else { injectForms(id); }
    })
    .catch(function () { expose(anonId); });
})();
`;
}
