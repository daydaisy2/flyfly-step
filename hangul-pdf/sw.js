/* 세은 한글·PDF 서비스워커 — 오프라인에서도 마지막 화면과 변환 도구가 열리게 */
const CACHE = 'seeun-hangul-pdf-v1';
const KOREAN_CMAPS = [
  'Adobe-Korea1-0.bcmap', 'Adobe-Korea1-1.bcmap', 'Adobe-Korea1-2.bcmap', 'Adobe-Korea1-UCS2.bcmap',
  'KSC-EUC-H.bcmap', 'KSC-EUC-V.bcmap', 'KSC-H.bcmap', 'KSC-Johab-H.bcmap', 'KSC-Johab-V.bcmap',
  'KSC-V.bcmap', 'KSCms-UHC-H.bcmap', 'KSCms-UHC-HW-H.bcmap', 'KSCms-UHC-HW-V.bcmap',
  'KSCms-UHC-V.bcmap', 'KSCpc-EUC-H.bcmap', 'KSCpc-EUC-V.bcmap', 'UniKS-UCS2-H.bcmap',
  'UniKS-UCS2-V.bcmap', 'UniKS-UTF16-H.bcmap', 'UniKS-UTF16-V.bcmap', 'UniKS-UTF32-H.bcmap',
  'UniKS-UTF32-V.bcmap', 'UniKS-UTF8-H.bcmap', 'UniKS-UTF8-V.bcmap'
].map((n) => './libs/cmaps/' + n);

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './hwpx-template.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './libs/jszip.min.js',
  './libs/pako.min.js',
  './libs/cfb.min.js',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js'
].concat(KOREAN_CMAPS);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
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

/* 화면(HTML)은 항상 서버에 먼저 확인하고, 나머지는 캐시 먼저 → 뒤에서 조용히 새로 받아 둔다 */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
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

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
      if (hit) {
        net.catch(() => {});
        return hit;
      }
      return net.catch(() => hit);
    })
  );
});
