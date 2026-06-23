import LibraryBrandPage, { metadata } from "../library/brand/page";

export { metadata };
export const dynamic = "force-dynamic";

/** The brand kit lives inside the Library nav, but /brand remains a stable entry point. */
export default LibraryBrandPage;
