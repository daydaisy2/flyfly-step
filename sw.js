/* 리훨 임챌 서비스워커 — 마지막 화면은 오프라인에서도 열리게.
   Firebase(다른 출처) 통신은 절대 캐시하지 않는다. */
const CACHE = 'imchall-v16';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 다른 출처(Firebase 등)는 서비스워커가 건드리지 않는다
  if (url.origin !== self.location.origin) return;

  // robots.txt 는 서비스워커가 가로채지 않는다 — 검색 로봇이 늘 서버 응답을 받도록
  if (url.pathname.endsWith('/robots.txt')) return;

  // 화면(HTML)은 네트워크 우선, 실패하면 캐시
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    /* cache:'no-cache' — 브라우저가 들고 있는 10분짜리 사본을 쓰지 않고 매번 서버에 새 버전인지 물어본다
       (바뀌지 않았으면 가볍게 304 로 끝나고, 바뀌었으면 바로 새 화면) */
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 정적 파일은 캐시 우선
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
