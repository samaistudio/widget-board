// Keeps the app shell available offline. Data is never cached here: the app keeps its own small copies.
const CACHE = "widget-board-v1", SHELL = ["./", "./index.html", "./shim.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "../widget.js"]
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())))
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
// network first for our own files (so updates arrive), cache as the fallback; other hosts (GitHub API, weather) pass through
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url)
  if (u.origin !== location.origin || e.request.method !== "GET") return
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r }).catch(() => caches.match(e.request)))
})
