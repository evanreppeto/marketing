import { PageSkeleton } from "./_components/page-skeleton";

/**
 * Route-level loading fallback for the whole app. Next renders this instantly on
 * navigation (the sidebar layout stays mounted) while a page's dynamic Supabase
 * data resolves, so clicking a nav item feels immediate instead of blank. The
 * nav already prefetches, so this skeleton is ready before the click lands.
 *
 * Routes with a distinct shape (e.g. /arc) provide their own loading.tsx to
 * override this generic dashboard skeleton.
 */
export default function Loading() {
  return <PageSkeleton />;
}
