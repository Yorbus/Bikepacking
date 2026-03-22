let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;

const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

const userMarker = L.circleMarker([0, 0], { radius: 8, fillColor: '#2ecc71', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);

function toggleMenu() {
    const m = document.getElementById('main-menu');
    m.style.display = m.style.display === 'block' ? 'none' : 'block';
}

function showRoutes() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('route-page').style.display = 'block';
    renderRouteList();
}

function closePages() {
    document.querySelectorAll('.full-page').forEach(p => p.style.display = 'none');
}

document.getElementById('gpx-file').addEventListener('change', function (e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const gpxData = evt.target.result;
            // Alleen toevoegen aan lijst, niet direct laden
            new L.GPX(gpxData, { async: true }).on('loaded', (e) => {
                const dist = (e.target.get_distance() / 1000).toFixed(1);
                savedRoutes.push({ id: Date.now() + Math.random(), name: file.name.replace('.gpx', ''), distance: dist, data: gpxData });
                localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
                renderRouteList();
            });
        };
        reader.readAsText(file);
    });
});

function renderRouteList() {
    const list = document.getElementById('route-list');
    list.innerHTML = savedRoutes.map(r => `
        <div class="route-card ${r.id == activeRouteId ? 'active' : ''}" onclick="loadRoute('${r.id}')">
            <div style="flex:1">
                <strong>${r.name}</strong><br>
                <small style="color:var(--accent-bright)">${r.distance} km</small>
            </div>
            <button onclick="event.stopPropagation(); deleteRoute('${r.id}')" style="background:none; border:none; color:#ff4444; font-size:1.8rem; padding:0 10px;">&times;</button>
        </div>
    `).join('');
}

function loadRoute(id) {
    const route = savedRoutes.find(r => r.id == id);
    if (!route) return;

    activeRouteId = id;
    localStorage.setItem('active_route_id', id);

    if (activeRouteLayer) map.removeLayer(activeRouteLayer);

    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds());
        routePoints = e.target.get_planar_coords();
        totalDistance = e.target.get_distance() / 1000;

        // Update UI direct na laden
        updateUI(0, totalDistance);
        closePages();
    }).addTo(map);
}

function deleteRoute(id) {
    if (confirm("Route verwijderen?")) {
        savedRoutes = savedRoutes.filter(r => r.id != id);
        localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
        if (id == activeRouteId) {
            activeRouteId = null;
            localStorage.removeItem('active_route_id');
            if (activeRouteLayer) map.removeLayer(activeRouteLayer);
            document.getElementById('dist-todo').innerText = "Geen route";
            document.getElementById('progress-fill').style.width = "0%";
        }
        renderRouteList();
    }
}

navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed, altitude } = pos.coords;
    const p = L.latLng(latitude, longitude);
    userMarker.setLatLng(p);
    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;
    document.getElementById('altitude').innerText = altitude ? Math.round(altitude) + 'm' : '-';

    // Alleen voortgang berekenen als er een route actief is
    if (activeRouteId && routePoints.length > 0) calculateProgress(p);
}, null, { enableHighAccuracy: true });

function calculateProgress(userLatLng) {
    let minDist = Infinity; let index = 0;
    routePoints.forEach((pt, i) => {
        const d = userLatLng.distanceTo([pt.lat, pt.lon]);
        if (d < minDist) { minDist = d; index = i; }
    });
    let distanceDone = 0;
    for (let i = 0; i < index; i++) {
        distanceDone += L.latLng(routePoints[i]).distanceTo(L.latLng(routePoints[i + 1]));
    }
    updateUI(distanceDone / 1000, totalDistance);
}

function updateUI(done, total) {
    const todo = Math.max(0, total - done);
    const pct = (done / total) * 100;
    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = done.toFixed(1) + " km";
    document.getElementById('dist-todo').innerText = todo.toFixed(1) + " km over";
}

// Startup: Alleen laden als er een opgeslagen ID is
map.locate({ setView: true, maxZoom: 15 });
if (activeRouteId) {
    setTimeout(() => loadRoute(activeRouteId), 500); // Kleine delay voor stabiliteit
}

setInterval(() => {
    const n = new Date();
    document.getElementById('time').innerText = n.getHours().toString().padStart(2, '0') + ":" + n.getMinutes().toString().padStart(2, '0');
}, 1000);