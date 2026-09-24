const SHELL = "tetromine-shell";
const FONTS = "tetromine-fonts";
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const NAV_TIMEOUT_MS = 3000;

// Every URL index.html pulls in: hashed build output, icons, manifest, font CSS.
function shellUrls(html) {
  const urls = new Set(["/", "/manifest.webmanifest"]);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin || FONT_HOSTS.has(url.hostname)) urls.add(url.href);
  }
  return [...urls];
}

async function cacheFontFiles(css) {
  const cache = await caches.open(FONTS);
  const files = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((match) => match[1]);
  await Promise.all(files.map((file) => cache.add(file).catch(() => {})));
}

// Cache the fresh shell and drop build assets the new index.html no longer references.
async function refreshShell(html) {
  const cache = await caches.open(SHELL);
  const wanted = new Set(shellUrls(html).map((url) => new URL(url, self.location.origin).href));
  await cache.put("/", new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  await Promise.all([...wanted].map(async (url) => {
    if (await cache.match(url)) return;
    const font = FONT_HOSTS.has(new URL(url).hostname);
    const response = await fetch(url, font ? { mode: "cors" } : undefined).catch(() => null);
    if (!response?.ok) return;
    if (font) {
      const fonts = await caches.open(FONTS);
      await fonts.put(url, response.clone());
      await cacheFontFiles(await response.text());
      return;
    }
    await cache.put(url, response);
  }));
  for (const request of await cache.keys()) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/assets/") && !wanted.has(url.href)) await cache.delete(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const response = await fetch("/", { cache: "no-store" });
    if (response.ok) await refreshShell(await response.text());
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, FONTS]);
    for (const key of await caches.keys()) {
      if (!keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function navigate(event) {
  const cache = await caches.open(SHELL);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) {
      const html = await response.clone().text();
      event.waitUntil(refreshShell(html));
    }
    return response;
  });
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), NAV_TIMEOUT_MS);
  });
  const fresh = await Promise.race([network.catch(() => null), timeout]);
  if (fresh) return fresh;
  const cached = await cache.match("/");
  return cached ?? network;
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(url.hostname === "fonts.gstatic.com" ? cacheFirst(request, FONTS) : staleWhileRevalidate(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, SHELL));
});
