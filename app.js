let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;
let isNavigating = false;

// Kaart setup
const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

const userMarker = L.marker([0, 0], {
    icon: L.divIcon({
        className: 'user-icon',
        html: '<div style="width:20px;height:20px;background:#2ecc71;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>'
    })
}).addTo(map);

// --- Menu & Navigatie UI ---
function toggleMenu() {
    const m = document.getElementById('main-menu');
    m.style.display = (m.style.display === 'block') ? 'none' : 'block';
}
function showRoutes() { closePages(); document.getElementById('route-page').style.display = 'block'; renderRouteList(); }
function showSettings() { closePages(); document.getElementById('settings-page').style.display = 'block'; }
function closePages() { document.querySelectorAll('.full-page').forEach(p => p.style.display = 'none'); }
function resetApp() { if (confirm("Wis alles?")) { localStorage.clear(); location.reload(); } }

// --- Route laden (De Fix zit hier) ---
function loadRoute(id) {
    const route = savedRoutes.find(r => r.id == id);
    if (!route) return;

    activeRouteId = id;
    localStorage.setItem('active_route_id', id);

    // 1. FORCEER DIRECTE UI UPDATE (Geen vertraging meer)
    document.getElementById('dist-todo').innerText = route.distance + " km over";
    document.getElementById('dist-done').innerText = "0.0 km";
    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';

    totalDistance = parseFloat(route.distance);
    isNavigating = false;
    closePages();

    // 2. Laad de kaartlaag op de achtergrond
    if (activeRouteLayer) map.removeLayer(activeRouteLayer);
    renderRouteList();

    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
        routePoints = e.target.get_planar_coords();
    }).addTo(map);
}

// --- Route Toevoegen ---
document.getElementById('gpx-file').addEventListener('change', function (e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const gpxData = evt.target.result;
            new L.GPX(gpxData, { async: true }).on('loaded', (ev) => {
                const dist = (ev.target.get_distance() / 1000).toFixed(1);
                const newId = 'r-' + Date.now();
                savedRoutes.push({ id: newId, name: file.name.replace('.gpx', ''), distance: dist, data: gpxData });
                localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
                renderRouteList();
            });
        };
        reader.readAsText(file);
    });
});

function renderRouteList() {
    const list = document.getElementById('route-list');
    if (!list) return;
    list.innerHTML = savedRoutes.map(r => `
        <div class="route-card ${r.id == activeRouteId ? 'active' : ''}" onclick="loadRoute('${r.id}')">
            <div style="flex:1"><strong>${r.name}</strong><br><small>${r.distance} km</small></div>
            <button onclick="event.stopPropagation(); deleteRoute('${r.id}')" style="color:#ff4444; background:none; border:none; font-size:1.5rem;">&times;</button>
        </div>
    `).join('');
}

// --- Offline Navigatie Logica ---
function startNavigation() {
    isNavigating = true;
    document.getElementById('nav-instruction').style.display = 'flex';
    document.getElementById('start-nav-btn').style.display = 'none';
    document.getElementById('stop-nav-btn').style.display = 'block';
    if (userMarker.getLatLng().lat !== 0) map.setView(userMarker.getLatLng(), 18);
}

function stopNavigation() {
    isNavigating = false;
    document.getElementById('nav-instruction').style.display = 'none';
    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';
}

navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed } = pos.coords;
    const p = L.latLng(latitude, longitude);
    userMarker.setLatLng(p);
    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;

    if (isNavigating) {
        map.panTo(p);
        analyzeRouteAhead(p);
    }
}, null, { enableHighAccuracy: true });

function analyzeRouteAhead(userPos) {
    if (!routePoints || routePoints.length < 5) return;

    let minDist = Infinity, idx = 0;
    routePoints.forEach((pt, i) => {
        const d = userPos.distanceTo([pt.lat, pt.lon]);
        if (d < minDist) { minDist = d; idx = i; }
    });

    let lookAheadIdx = Math.min(idx + 10, routePoints.length - 1);
    let distToAction = userPos.distanceTo([routePoints[lookAheadIdx].lat, routePoints[lookAheadIdx].lon]);

    let b1 = getBearing(routePoints[idx], routePoints[Math.min(idx + 3, routePoints.length - 1)]);
    let b2 = getBearing(routePoints[Math.min(idx + 3, routePoints.length - 1)], routePoints[lookAheadIdx]);
    let diff = b2 - b1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    let icon = "↑", text = "Weg volgen";
    if (diff > 25) { icon = "→"; text = "Sla rechtsaf"; }
    else if (diff < -25) { icon = "←"; text = "Sla linksaf"; }

    document.getElementById('nav-icon').innerText = icon;
    document.getElementById('nav-step').innerText = text;
    document.getElementById('nav-dist').innerText = Math.round(distToAction) + " m";

    updateUI((idx / routePoints.length) * totalDistance, totalDistance);
}

function getBearing(p1, p2) {
    if (!p1 || !p2) return 0;
    const lat1 = p1.lat * Math.PI / 180, lat2 = p2.lat * Math.PI / 180;
    const lon1 = p1.lon * Math.PI / 180, lon2 = p2.lon * Math.PI / 180;
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return Math.atan2(y, x) * 180 / Math.PI;
}

function updateUI(done, total) {
    const pct = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = done.toFixed(1) + " km";
    document.getElementById('dist-todo').innerText = Math.max(0, total - done).toFixed(1) + " km over";
}

function deleteRoute(id) {
    savedRoutes = savedRoutes.filter(r => r.id != id);
    localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
    if (id == activeRouteId) location.reload();
    renderRouteList();
}

window.onload = () => {
    renderRouteList();
    if (activeRouteId) setTimeout(() => loadRoute(activeRouteId), 500);
};

setInterval(() => {
    const n = new Date();
    document.getElementById('time').innerText = n.getHours().toString().padStart(2, '0') + ":" + n.getMinutes().toString().padStart(2, '0');
}, 1000);