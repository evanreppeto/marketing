// A consistent entrance for every signed-in screen.
//
// `template.tsx` re-mounts on each navigation (unlike `layout.tsx`, which
// persists), so this wrapper's CSS entrance animation replays every time a page
// opens. That gives every screen the same subtle fade-and-rise on open instead
// of the uneven per-page animations (some screens had none). The wrapper is a
// transparent flex passthrough so it doesn't change any page's layout.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
