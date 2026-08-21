const CACHE_NAME = 'pongcrush-v6'; // 버전업 (새로운 SW 설치 유도)

// 캐싱할 정적, 미디어 자원 및 엑셀 파일 리스트
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './favicon.png',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    
    // 📌 고정 단어장 엑셀 파일 URL 캐싱 (라잎 단어장 포함)
    'https://docs.google.com/spreadsheets/d/1m7KXifCB6txkKEOHqApMWOR4MQwqb6Ji1Dm-hRJYzLc/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1UYTEv88wdKsSS2kkB-UylHAfQAlV6yrvjwVNecG6m64/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1VCSxOUY7bDuZlp3JtRPANYFXxBAzFBxrYCj6tC89n1U/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1ElLraPc80Uez8innH6RfXOBz36IV9ARXnkAiUembWH0/export?format=xlsx',

    // 오디오 파일 (1~8.mp3)
    ...Array.from({ length: 8 }, (_, i) => `./sounds/${i + 1}.mp3`),
    
    // 🐱 이미지 파일 다시 복구 (type1, type2, type3 / 1~4.jpg)
    ...['type1', 'type2', 'type3'].flatMap(type => 
        Array.from({ length: 4 }, (_, i) => `./images/${type}/${i + 1}.jpg`)
    )
];

// 서비스 워커 설치 및 리소스 캐싱
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 [Service Worker] 정적 파일 및 엑셀 리소스 캐싱 완료');
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(url => 
                    cache.add(new Request(url, { mode: 'cors' })).catch(err => {
                        return cache.add(new Request(url, { mode: 'no-cors' })).catch(e => console.warn('Cache fetch skip:', url));
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

// 구버전 캐시 정리
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 네트워크 패치 전략 (Cache First -> Fetch & Auto Cache)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                if (!response || (response.status !== 200 && response.type !== 'opaque')) {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            }).catch(() => caches.match('./index.html'));
        })
    );
});

// 🔔 알림 클릭 이벤트 처리 (앱 열기 및 파라미터 전달)
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // 열려있는 탭이 있으면 포커스 맞추고 해당 URL로 이동
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // 없으면 새 창 열기
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});