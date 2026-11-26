self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// List PWA service worker: cache same-origin app resources, never Supabase/API data.
const CACHE_NAME = "list-app-shell-v1";
const BASE_PATH = new URL("./", self.location.href).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.add(BASE_PATH);
      } catch {
        // The shell will be cached from the first successful navigation.
      }
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("list-app-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.includes("/api/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/")
  )
    return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const isNavigate = request.mode === "navigate";
      try {
        // Never abort a navigation because a slow mobile/PWA connection may still succeed.
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (isNavigate) {
          return (
            (await cache.match(BASE_PATH)) ||
            new Response(
              "Você está offline. Abra novamente quando houver conexão para carregar o app.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })(),
  );
});
