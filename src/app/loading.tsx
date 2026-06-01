import { PageSkeleton } from "./_components/page-skeleton";

// The shell is now persistent (ConsoleFrame in the root layout), so the route
// loading fallback only needs the content-area skeleton. It renders inside the
// layout's content slot while a page's dynamic Supabase data streams in.
export default function Loading() {
  return <PageSkeleton />;
}
