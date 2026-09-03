const CACHE_NAME = 'pongcrush-v6.4'; // 하드 리셋/신규 배포용 캐시 버전

// 캐싱할 정적, 미디어 자원 및 엑셀 파일 리스트
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './speaking.html',
    './privacy.html',
    './favicon.png',
    './profile.jpg',

    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',

    'https://docs.google.com/spreadsheets/d/1m7KXifCB6txkKEOHqApMWOR4MQwqb6Ji1Dm-hRJYzLc/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1UYTEv88wdKsSS2kkB-UylHAfQAlV6yrvjwVNecG6m64/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1VCSxOUY7bDuZlp3JtRPANYFXxBAzFBxrYCj6tC89n1U/export?format=xlsx',
    'https://docs.google.com/spreadsheets/d/1ElLraPc80Uez8innH6RfXOBz36IV9ARXnkAiUembWH0/export?format=xlsx',

    ...['type1', 'type2', 'type3'].flatMap(type =>
        Array.from(
            { length: 4 },
            (_, i) => `./images/${type}/${i + 1}.jpg`
        )
    )
];


// ============================================================
// Service Worker 설치
// ============================================================

self.addEventListener('install', (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME).then(async (cache) => {

            console.log(
                '📦 [Service Worker] 최신 정적 파일 precache 시작'
            );

            await Promise.allSettled(

                ASSETS_TO_CACHE.map(async (url) => {

                    try {

                        /*
                         * HTML 파일은 브라우저 HTTP 캐시에 남아 있는
                         * 오래된 HTML을 사용하지 않도록 cache-busting query를 붙인다.
                         */
                        const isHtml =
                            /\.html(?:$|[?#])/i.test(url);

                        const requestUrl = isHtml
                            ? url +
                              (url.includes('?') ? '&' : '?') +
                              'sw-precache=' +
                              Date.now()
                            : url;


                        /*
                         * cache:'no-store'
                         *
                         * 브라우저 HTTP Cache를 거치지 않고
                         * 서버에서 최신 리소스를 직접 가져온다.
                         */
                        const request = new Request(
                            requestUrl,
                            {
                                mode: 'cors',
                                cache: 'no-store'
                            }
                        );


                        const response = await fetch(request);


                        if (
                            !response ||
                            (
                                !response.ok &&
                                response.type !== 'opaque'
                            )
                        ) {
                            throw new Error(
                                `HTTP ${response.status}`
                            );
                        }


                        /*
                         * 캐시에는 query string이 없는 원래 URL로 저장한다.
                         *
                         * 예:
                         *
                         * 서버 요청
                         * speaking.html?sw-precache=123456
                         *
                         * ↓
                         *
                         * Cache Storage
                         * speaking.html
                         */
                        await cache.put(
                            new Request(url),
                            response.clone()
                        );


                    } catch (err) {

                        /*
                         * 외부 리소스처럼 CORS가 허용되지 않는 경우
                         * 기존 no-cors 방식으로 한 번 더 시도한다.
                         */
                        try {

                            await cache.add(
                                new Request(
                                    url,
                                    {
                                        mode: 'no-cors',
                                        cache: 'no-store'
                                    }
                                )
                            );

                        } catch (fallbackError) {

                            console.warn(
                                'Cache fetch skip:',
                                url,
                                fallbackError
                            );
                        }
                    }
                })
            );


            console.log(
                '📦 [Service Worker] 최신 정적 파일 precache 완료'
            );

        })
    );


    /*
     * 새로운 Service Worker가 설치되면
     * waiting 상태에서 기다리지 않고 바로 activate로 넘어간다.
     */
    self.skipWaiting();
});


// ============================================================
// Service Worker 활성화
// ============================================================

self.addEventListener('activate', (event) => {

    event.waitUntil(

        caches.keys().then((cacheNames) => {

            return Promise.all(

                cacheNames.map((cacheName) => {

                    /*
                     * 현재 버전이 아닌 모든 이전 Cache Storage 제거
                     */
                    if (cacheName !== CACHE_NAME) {

                        console.log(
                            '🗑️ [Service Worker] 이전 캐시 삭제:',
                            cacheName
                        );

                        return caches.delete(cacheName);
                    }

                })
            );
        })
    );


    /*
     * 현재 열려 있는 페이지도
     * 새 Service Worker가 즉시 제어하도록 한다.
     */
    self.clients.claim();
});


// ============================================================
// Fetch
// ============================================================

self.addEventListener('fetch', (event) => {

    const request = event.request;
    const url = new URL(request.url);


    event.respondWith(

        caches.match(request).then((cachedResponse) => {

            /*
             * 1. Cache First
             *
             * 이미 캐시되어 있다면
             * 네트워크에 접근하지 않고 캐시를 바로 사용한다.
             */
            if (cachedResponse) {

                return cachedResponse;
            }


            /*
             * 2. 캐시에 없으면 Network
             */
            return fetch(request).then((response) => {

                /*
                 * 정상 응답이 아니면 그대로 반환
                 */
                if (
                    !response ||
                    (
                        response.status !== 200 &&
                        response.type !== 'opaque'
                    )
                ) {

                    return response;
                }


                const responseToCache =
                    response.clone();


                /*
                 * reset / ts query가 붙은 URL은
                 * 일회성 Cache Busting 요청이므로
                 * Cache Storage에 저장하지 않는다.
                 *
                 * 예:
                 *
                 * index.html?reset=123456
                 * index.html?ts=123456
                 */
                const isCacheBustRequest =
                    url.searchParams.has('reset') ||
                    url.searchParams.has('ts');


                if (!isCacheBustRequest) {

                    caches.open(CACHE_NAME).then((cache) => {

                        cache.put(
                            request,
                            responseToCache
                        );

                    });

                }


                return response;

            }).catch(() => {

                /*
                 * 네트워크도 실패하고 캐시도 없는 경우
                 * 마지막 fallback으로 index.html을 반환한다.
                 */
                return caches.match('./index.html');

            });

        })
    );
});


// ============================================================
// Notification Click
// ============================================================

self.addEventListener('notificationclick', (event) => {

    event.notification.close();

    event.waitUntil(

        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {

            /*
             * 이미 열려 있는 앱 창이 있다면
             * 해당 창으로 이동
             */
            for (const client of clientList) {

                if (
                    'focus' in client &&
                    client.url.includes(self.registration.scope)
                ) {

                    return client.focus();
                }
            }


            /*
             * 열려 있는 창이 없다면
             * 새로운 창을 연다.
             */
            if (clients.openWindow) {

                return clients.openWindow(
                    self.registration.scope
                );
            }

        })
    );
});