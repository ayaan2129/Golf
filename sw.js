// Golf Tracker Service Worker
// Strategy: cache-first for static assets, network-first for API calls.
// Version bump = cache invalidation.

const CACHE_NAME = "golf-tracker-v1";

// Static assets to pre-cache on install
const PRECACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./icon.svg",
  "./manifest.webmanifest",
  "./src/core/storage.js",
  "./src/core/utils.js",
  "./src/data/practice.js",
  "./src/data/courses.js",
  "./src/ai/insights.js",
  "./src/screens/login.js",
  "./src/screens/practice-ui.js",
  "./src/screens/stats-categories.js",
  "./src/screens/videos-ui.js",
];

self.addEventListener("install", function (evt) {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Pre-cache what we can; ignore individual failures so a missing
      // optional file doesn't break install.
      return Promise.allSettled(
        PRECACHE.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    })
  );
});

self.addEventListener("activate", function (evt) {
  evt.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (evt) {
  const url = new URL(evt.request.url);

  // Skip non-GET and cross-origin (weather API, etc.) — let them go to network
  if (evt.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // For navigation requests (HTML): network-first so updates deploy immediately
  if (evt.request.mode === "navigate") {
    evt.respondWith(
      fetch(evt.request).then(function (resp) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(evt.request, clone); });
        return resp;
      }).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  // For JS/CSS/SVG: cache-first (fast offline), refresh in background
  evt.respondWith(
    caches.match(evt.request).then(function (cached) {
      const networkFetch = fetch(evt.request).then(function (resp) {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(evt.request, clone); });
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
