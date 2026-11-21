const CACHE_NAME = "grandpa-offline-pos-v1";
const SAFE_SHELL = ["/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("grandpa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Next's versioned build assets are immutable and contain no user data.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // API and authorization responses are always network-only.
  if (request.headers.has("authorization") || url.pathname.startsWith("/api/")) return;

  if (request.mode !== "navigate" && request.headers.has("cookie")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname === "/offline-pos" && response.ok) {
            const copy = response.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) =>
                cache.put(
                  new Request(new URL("/offline-pos", self.location.origin)),
                  copy,
                ),
              );
          } else if (
            url.pathname === "/" &&
            response.ok &&
            !request.headers.has("cookie")
          ) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => {
          if (url.pathname === "/pos" || url.pathname === "/offline-pos") {
            const offlinePos = await caches.match(
              new Request(new URL("/offline-pos", self.location.origin)),
            );
            if (offlinePos && url.pathname === "/pos") {
              return Response.redirect(
                new URL("/offline-pos", self.location.origin),
                302,
              );
            }
            if (offlinePos) return offlinePos;
          }
          return (await caches.match("/")) || (await caches.match("/offline.html"));
        }),
    );
    return;
  }

  if (SAFE_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
