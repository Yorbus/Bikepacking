const VERSION = 'v15';
const CACHE_NAME = `bikepack-${VERSION}`;
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet-gpx/1.7.0/gpx.min.js'
];

// Kaart tiles caching
const TILE_SERVERS = [
    'https://cartocdn.',
    'https://a.basemaps.cartocdn.com',
    'https://b.basemaps.cartocdn.com',
    'https://c.basemaps.cartocdn.com'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((ks) =>
            Promise.all(
                ks.map((k) => k !== CACHE_NAME && caches.delete(k))
            )
        )
    );
});

self.addEventListener('fetch', (e) => {
    // Cache kaart tiles
    if (e.request.url.includes('basemaps.cartocdn.com')) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(e.request).then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(e.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
        );
    } else {
        // Cache andere assets
        e.respondWith(
            caches.match(e.request).then((r) => r || fetch(e.request))
        );
    }
});
