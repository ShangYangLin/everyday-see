// ============================================
// Service Worker - 提供離線快取能力
// ============================================

const CACHE_NAME = "everyday-see-v1";

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/js/i18n.js",
  "/js/db.js",
  "/js/app.js",
  "/js/scoring.js",
  "/js/levels.js"
];

// 安裝階段：預先快取核心檔案
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 啟用階段：清除舊版快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 攔截請求：先看快取，沒有再去網路抓
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // 離線且無快取時，可在此回傳預設離線頁面
        return caches.match("/index.html");
      });
    })
  );
});
