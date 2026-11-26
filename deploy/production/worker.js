// chessby.me (Fable review A9-01). The app is static files; this script only sends
// www.chessby.me to chessby.me (permanent redirect, same path and query) and hands every other
// request to the files, with their _headers and the single-page fallback.
//
// 1.1.1 (Fable review 1.1 B1-01): a file under /assets/ or /engines/ that is not there would be
// answered by the single-page fallback with the app's page, status 200, and the year-long cache
// of those folders. A browser then keeps the page under a script's address for a year (a white
// page for a first visit during a deploy), and a tab left open across an update reads the page
// as its opening book (B1-02). Such an answer becomes a 404 that is never kept.
//
// The trial copy (deploy/preview) runs this same file.
const NEVER_THE_PAGE = /^\/(assets|engines)\//;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.chessby.me') {
      url.hostname = 'chessby.me';
      return Response.redirect(url.toString(), 301);
    }
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('Content-Type') ?? '';
    if (NEVER_THE_PAGE.test(url.pathname) && type.includes('text/html')) {
      // The site's security headers stay; the cache and the type are those of a missing file.
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('Content-Type', 'text/plain; charset=utf-8');
      headers.delete('ETag');
      headers.delete('Content-Length');
      return new Response('Not found', { status: 404, headers });
    }
    return response;
  },
};
