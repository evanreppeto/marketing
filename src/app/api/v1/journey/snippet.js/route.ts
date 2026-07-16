import { buildCollectorScript } from "@/lib/journey/collector-script";

/**
 * GET /api/v1/journey/snippet.js — serves the first-party collector script.
 *
 * The script is stamped with the origin it was served from, so a landing page on
 * any first-party domain calls the collector back on the right host. Public,
 * cacheable, CORS-open (the script itself is not sensitive).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new Response(buildCollectorScript(origin), {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
