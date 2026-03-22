let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;
let isNavigating = false;

// Kaart setup
const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
const userMarker = L.circleMarker([0, 0], { radius: 10, fillColor: '#3498db', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(map);

// MENU LOGICA - Nu met geforceerde display check
function toggleMenu() {
    const m = document.getElementById('main-menu');
    if (m.style.display === 'block') {
        m.style.display = 'none';
    } else {
        closePages(); // Sluit andere schermen eerst
        m.style.display = 'block';
    }
}

function showRoutes() {
    closePages();
    document.getElementById('route-page').style.display = 'block';
    renderRouteList();
}

function showSettings() {
    closePages();
    document.getElementById('settings-page').style.display = 'block';
}

function closePages() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('route-page').style.display = 'none';
    document.getElementById('settings-page').style.display = 'none';
}

function resetApp() {
    if (confirm("Wis alle data?")) {
        localStorage.clear();
        location.reload();
    }
}

// GPX Laden
document.getElementById('gpx-file').addEventListener('change', function (e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const gpxData = evt.target.result;
            new L.GPX(gpxData, { async: true }).on('loaded', (ev) => {
                const dist = (ev.target.get_distance() / 1000).toFixed(1);
                const newId = 'r-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
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
    list.innerHTML = savedRoutes.map(r => `
        <div class="route-card ${r.id == activeRouteId ? 'active' : ''}" onclick="loadRoute('${r.id}')">
            <div style="flex:1"><strong>${r.name}</strong><br><small>${r.distance} km</small></div>
            <button onclick="event.stopPropagation(); deleteRoute('${r.id}')" style="background:none; border:none; color:#ff4444; font-size:1.5rem;">&times;</button>
        </div>
    `).join('');
}

function loadRoute(id) {
    const route = savedRoutes.find(r => r.id == id);
    if (!route) return;
    activeRouteId = id;
    localStorage.setItem('active_route_id', id);

    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';
    document.getElementById('dist-todo').innerText = route.distance + " km over";
    isNavigating = false;

    if (activeRouteLayer) map.removeLayer(activeRouteLayer);
    renderRouteList();

    activeRouteLayer = new L.GPX(route.data, {
        async: true, polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
        routePoints = e.target.get_planar_coords();
        totalDistance = parseFloat(route.distance);
        closePages();
    }).addTo(map);
}

// Navigatie
function startNavigation() {
    isNavigating = true;
    document.getElementById('start-nav-btn').style.display = 'none';
    document.getElementById('stop-nav-btn').style.display = 'block';
    if (userMarker.getLatLng().lat !== 0) {
        map.setView(userMarker.getLatLng(), 17);
    }
}

function stopNavigation() {
    isNavigating = false;
    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';
    if (activeRouteLayer) map.fitBounds(activeRouteLayer.getBounds());
}

// GPS
navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed } = pos.coords;
    const p = L.latLng(latitude, longitude);
    userMarker.setLatLng(p);
    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;
    if (isNavigating) map.panTo(p);
    if (activeRouteId && routePoints.length > 0) calculateProgress(p);
}, null, { enableHighAccuracy: true });

function calculateProgress(p) {
    let minDist = Infinity, index = 0;
    routePoints.forEach((pt, i) => {
        const d = p.distanceTo([pt.lat, pt.lon]);
        if (d < minDist) { minDist = d; index = i; }
    });
    let done = 0;
    for (let i = 0; i < index; i++) done += L.latLng(routePoints[i]).distanceTo(L.latLng(routePoints[i + 1]));
    updateUI(done / 1000, totalDistance);
}

function updateUI(done, total) {
    const todo = Math.max(0, total - done);
    const pct = (done / total) * 100;
    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = done.toFixed(1) + " km";
    document.getElementById('dist-todo').innerText = todo.toFixed(1) + " km over";
}

function deleteRoute(id) {
    savedRoutes = savedRoutes.filter(r => r.id != id);
    localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
    if (id == activeRouteId) location.reload();
    renderRouteList();
}

window.onload = () => {
    renderRouteList();
    if (activeRouteId) setTimeout(() => loadRoute(activeRouteId), 800);
    map.locate({ setView: true, maxZoom: 14 });
};

setInterval(() => {
    const n = new Date();
    document.getElementById('time').innerText = n.getHours().toString().padStart(2, '0') + ":" + n.getMinutes().toString().padStart(2, '0');
}, 1000);