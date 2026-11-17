/*
 * Offline support (BRIEF-UI section 11): the app opens without a network once it has been
 * opened online, and shows the games and analyses kept on the device.
 *
 * - Pages: network first, but after NAVIGATION_WAIT ms without an answer the cached app shell
 *   is shown (every address is the same app), so a half-open connection does not leave a blank
 *   screen (Fable review A6-05).
 * - Files of the app (hashed scripts and styles, fonts, icons): cache first; cached the first
 *   time they load, in a cache named after the build. A new build gets a new cache and the old
 *   one is deleted, so old files do not pile up and a changed icon or manifest reaches everyone
 *   (A6-04).
 * - The engine (/engines/): its own cache, named after its files, kept across app builds: it is
 *   7 MB and changes only with Stockfish.
 * - A file is stored only when what came back is that kind of file: the server answers a missing
 *   file with the app's page, and that page must never be kept under a script's address (A3-03).
 * - Other sites (Lichess, Chess.com) are never cached: their answers go to the app as they are.
 * Plain JavaScript, no Capacitor-incompatible API. Registered only in production builds.
 *
 * The two names below are filled in by the build (vite.config.ts, plugin "service-worker-names").
 */
const CACHE = 'chessbyme-app-__BUILD_ID__';
const ENGINE_CACHE = 'chessbyme-engine-__ENGINE_ID__';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/apple-touch-icon.png'];
const NAVIGATION_WAIT = 3000;

/** The content types a file of each kind may come back with. */
const TYPES = {
  js: ['javascript'],
  mjs: ['javascript'],
  css: ['text/css'],
  woff2: ['font/woff2', 'application/font-woff2', 'application/octet-stream'],
  wasm: ['application/wasm'],
  png: ['image/png'],
  svg: ['image/svg+xml'],
  webmanifest: ['manifest+json', 'application/json'],
  json: ['json'],
  txt: ['text/plain'],
};

/** True when `response` is a file of the kind `path` names, and safe to keep. */
function fits(path, response) {
  if (!response.ok || response.type === 'opaque') return false;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (path === '/') return type.includes('text/html');
  const name = path.split('/').pop() ?? '';
  const allowed = name.includes('.') ? TYPES[name.split('.').pop()] : undefined;
  if (allowed) return allowed.some((part) => type.includes(part));
  return type !== '' && !type.includes('text/html');
}

function cacheFor(path) {
  return path.startsWith('/engines/') ? ENGINE_CACHE : CACHE;
}

async function store(path, response) {
  if (!fits(path, response)) return;
  const cache = await caches.open(cacheFor(path));
  await cache.put(path, response);
}

/** Fetches every file and keeps it, failing if one is not the file it names. */
async function addAll(paths) {
  await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!fits(path, response)) throw new Error(`precache: ${path} is not the file it names`);
      await store(path, response);
    }),
  );
}

/** The app shell and every file it needs to start: the scripts and styles named in index.html,
 *  and the fonts named in those styles. Read from the build itself, so no list goes stale. */
async function precache() {
  await addAll(SHELL);
  const cache = await caches.open(CACHE);
  const html = await (await cache.match('/')).text();
  const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await addAll(files);
  for (const css of files.filter((file) => file.endsWith('.css'))) {
    const text = await (await cache.match(css)).text();
    const fonts = [...text.matchAll(/url\(([^)]+\.woff2)\)/g)].map(
      (m) => new URL(m[1].replace(/["']/g, ''), self.location.origin + css).pathname,
    );
    await addAll([...new Set(fonts)]);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // The caches of other builds go, and an engine cache of other engine files.
  const keep = new Set([CACHE, ENGINE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function cachedShell() {
  return caches.match('/', { cacheName: CACHE });
}

/** The network's page, or the cached shell once the network has taken NAVIGATION_WAIT ms. */
function navigate(request) {
  const network = fetch(request).then((response) => {
    void store('/', response.clone());
    return response;
  });
  network.catch(() => {}); // a late failure after the cached page was shown is not an error
  const afterWait = new Promise((resolve) => setTimeout(resolve, NAVIGATION_WAIT))
    .then(cachedShell)
    .then((cached) => cached ?? network);
  return Promise.race([network, afterWait]).catch(() =>
    cachedShell().then((cached) => cached ?? Response.error()),
  );
}

/**
 * A stored copy handed to a worker as a response of its own (1.1.0, 2026-11-17). A worker runs
 * at the address its script response carries, and in Chromium a stored copy carries the address
 * it was first fetched at, the part after `#` included. The engine's worker is started at
 * `stockfish.js#<blob address of this page's WebAssembly>`, so from the stored copy every later
 * page started its engine with the blob address of the page that first stored it, long revoked:
 * the second analysis in a browser failed at once. A new response has no address of its own, so
 * the worker runs at the address it was asked for.
 */
function asNewResponse(cached) {
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers,
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }

  // Files are kept by path; the app never asks for one with a query, so leave such a request alone.
  if (url.search !== '') return;
  const path = url.pathname;
  event.respondWith(
    // By address alone: module scripts are asked for with an Origin header the stored copy lacks.
    caches.match(path, { ignoreVary: true, cacheName: cacheFor(path) }).then(
      (cached) =>
        (cached && request.destination === 'worker' ? asNewResponse(cached) : cached) ??
        fetch(request).then((response) => {
          void store(path, response.clone());
          return response;
        }),
    ),
  );
});
