/* 세은 독서 서비스워커 — 오프라인에서도 마지막 화면은 열리게.
   캐시 이름은 seeun-library- 로 시작한다. 같은 daydaisy2.github.io 안의 다른 앱(bubudaily·부부 할일·리훨 임챌)
   캐시는 절대 건드리지 않는다. */
const CACHE = 'seeun-library-v1';
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
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf('seeun-library-') === 0 && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 파이어베이스 실시간 통신과 다른 사이트는 서비스워커가 건드리지 않는다
  if (url.origin !== self.location.origin) return;
  // 이 앱 폴더 밖(/library/ 바깥)은 다른 앱 영역이므로 손대지 않는다
  if (url.pathname.indexOf('/library/') !== 0) return;
  // robots.txt 는 늘 서버 응답을 받게 한다
  if (url.pathname.endsWith('/robots.txt')) return;

  // 화면(HTML)은 네트워크 우선, 실패하면 캐시
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 나머지 정적 파일은 캐시 우선
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
