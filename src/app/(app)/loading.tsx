// Instant navigation feedback for every signed-in screen.
//
// These routes are dynamic (they read live per-workspace Supabase data on each
// request), so per the Next 16 prefetching contract they are NOT prefetched and
// do a blocking server roundtrip on click *unless* a loading boundary exists.
// Without this file, clicking a nav item froze the whole shell for the full
// render (~0.5–1.4s) with no feedback. With it, Next prefetches the shell up to
// this boundary and paints the skeleton instantly, then streams the real page
// in. The skeleton also fades in on a short delay (see .route-skel in
// arc-app.css) so genuinely fast routes never flash it.
export default function Loading() {
  return (
    <div className="route-skel" aria-hidden="true">
      <div className="rs-head">
        <div className="rs-line rs-eyebrow" />
        <div className="rs-line rs-title" />
        <div className="rs-line rs-sub" />
      </div>
      <div className="rs-body">
        <div className="rs-main">
          <div className="rs-panel rs-tall" />
          <div className="rs-panel" />
        </div>
        <div className="rs-side">
          <div className="rs-panel rs-med" />
          <div className="rs-panel rs-med" />
        </div>
      </div>
    </div>
  );
}
