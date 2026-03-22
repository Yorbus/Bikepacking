let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let routePoints = [];
let totalDistance = 0;

// Initialize Map
const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

// User Marker
const userMarker = L.circleMarker([0, 0], { radius: 8, fillColor: '#2ecc71', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);

// 1. UI Navigation
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

// 2. Route Management
document.getElementById('gpx-file').addEventListener('change', function (e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const gpxData = evt.target.result;
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
        <div class="route-card">
            <div onclick="loadRoute('${r.id}')" style="flex:1">
                <strong>${r.name}</strong><br><small style="color:var(--accent-bright)">${r.distance} km</small>
            </div>
            <button onclick="deleteRoute('${r.id}')" style="background:none; border:none; color:red; font-size:1.5rem;">&times;</button>
        </div>
    `).join('');
}

function loadRoute(id) {
    const route = savedRoutes.find(r => r.id == id);
    if (activeRouteLayer) map.removeLayer(activeRouteLayer);

    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds());
        routePoints = e.target.get_planar_coords(); // Punten voor afstandsberekening
        totalDistance = e.target.get_distance() / 1000;
        document.getElementById('dist-todo').innerText = totalDistance.toFixed(1) + " km te gaan";
        closePages();
    }).addTo(map);
}

function deleteRoute(id) {
    savedRoutes = savedRoutes.filter(r => r.id != id);
    localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
    renderRouteList();
}

// 3. GPS & Math (Balkje update)
navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed, altitude } = pos.coords;
    const p = L.latLng(latitude, longitude);
    userMarker.setLatLng(p);

    // Update Stats
    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;
    document.getElementById('altitude').innerText = altitude ? Math.round(altitude) + 'm' : '-';

    if (routePoints.length > 0) {
        updateProgress(p);
    }
}, null, { enableHighAccuracy: true });

function updateProgress(userLatLng) {
    // Zoek dichtstbijzijnde punt op de route (simpele versie)
    let minDist = Infinity;
    let index = 0;

    routePoints.forEach((pt, i) => {
        const d = userLatLng.distanceTo([pt.lat, pt.lon]);
        if (d < minDist) { minDist = d; index = i; }
    });

    // Bereken afstand over de lijn
    let distanceDone = 0;
    for (let i = 0; i < index; i++) {
        distanceDone += L.latLng(routePoints[i]).distanceTo(L.latLng(routePoints[i + 1]));
    }

    const doneKm = distanceDone / 1000;
    const todoKm = totalDistance - doneKm;
    const pct = (doneKm / totalDistance) * 100;

    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = doneKm.toFixed(1) + " km gedaan";
    document.getElementById('dist-todo').innerText = todoKm.toFixed(1) + " km te gaan";
}

// Clock
setInterval(() => {
    const n = new Date();
    document.getElementById('time').innerText = n.getHours().toString().padStart(2, '0') + ":" + n.getMinutes().toString().padStart(2, '0');
}, 1000);