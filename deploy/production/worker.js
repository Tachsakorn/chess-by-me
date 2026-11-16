// chessby.me (Fable review A9-01). The app is static files; this script only sends
// www.chessby.me to chessby.me (permanent redirect, same path and query) and hands every other
// request to the files, with their _headers and the single-page fallback.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.chessby.me') {
      url.hostname = 'chessby.me';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
