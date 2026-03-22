let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;

// Init Kaart
const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
const userMarker = L.circleMarker([0, 0], { radius: 8, fillColor: '#2ecc71', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);

function toggleMenu() {
    const m = document.getElementById('main-menu');
    m.style.display = (m.style.display === 'block') ? 'none' : 'block';
}

function showRoutes() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('route-page').style.display = 'block';
    renderRouteList();
}

function closePages() {
    document.querySelectorAll('.full-page').forEach(p => p.style.display = 'none');
}

// Nieuwe route toevoegen
document.getElementById('gpx-file').addEventListener('change', function (e) {
    Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const gpxData = evt.target.result;
            const tempLayer = new L.GPX(gpxData, { async: true }).on('loaded', (event) => {
                const dist = (event.target.get_distance() / 1000).toFixed(1);
                // We gebruiken een unieke ID
                const newId = 'route-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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
        <div class="route-card ${r.id === activeRouteId ? 'active' : ''}" onclick="loadRoute('${r.id}')">
            <div style="flex:1">
                <strong>${r.name}</strong><br>
                <small style="color:var(--accent-bright)">${r.distance} km</small>
            </div>
            <button onclick="event.stopPropagation(); deleteRoute('${r.id}')" style="background:none; border:none; color:#ff4444; font-size:1.8rem;">&times;</button>
        </div>
    `).join('');
}

function loadRoute(id) {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) {
        console.error("Route niet gevonden:", id);
        return;
    }

    // Update ID en bewaar in geheugen
    activeRouteId = id;
    localStorage.setItem('active_route_id', id);

    // Maak de kaart leeg
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
    }

    // Toon visueel dat de route geselecteerd is
    renderRouteList();

    // Laad de GPX
    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        const gpx = e.target;
        map.fitBounds(gpx.getBounds());
        routePoints = gpx.get_planar_coords();
        totalDistance = gpx.get_distance() / 1000;

        // FORCEER UPDATE VAN DE TEKST
        updateUI(0, totalDistance);

        console.log("Route geladen: " + totalDistance + " km");
        closePages();
    }).addTo(map);
}

function deleteRoute(id) {
    if (confirm("Route verwijderen?")) {
        savedRoutes = savedRoutes.filter(r => r.id !== id);
        localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
        if (id === activeRouteId) {
            activeRouteId = null;
            localStorage.removeItem('active_route_id');
            if (activeRouteLayer) map.removeLayer(activeRouteLayer);
            document.getElementById('dist-todo').innerText = "Geen route";
            document.getElementById('progress-fill').style.width = "0%";
        }
        renderRouteList();
    }
}

// GPS & Voortgang
navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed, altitude } = pos.coords;
    const p = L.latLng(latitude, longitude);
    userMarker.setLatLng(p);

    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;
    document.getElementById('altitude').innerText = altitude ? Math.round(altitude) + 'm' : '-';

    if (activeRouteId && routePoints.length > 0) {
        calculateProgress(p);
    }
}, null, { enableHighAccuracy: true });

function calculateProgress(userLatLng) {
    if (routePoints.length === 0) return;

    let minDist = Infinity;
    let index = 0;

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
    const pct = total > 0 ? (done / total) * 100 : 0;

    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = done.toFixed(1) + " km";
    document.getElementById('dist-todo').innerText = todo.toFixed(1) + " km over";
}

// Opstarten
window.onload = () => {
    renderRouteList(); // Zorg dat de lijst er staat
    if (activeRouteId) {
        setTimeout(() => loadRoute(activeRouteId), 800);
    }
    map.locate({ setView: true, maxZoom: 14 });
};

// Klok update
setInterval(() => {
    const n = new Date();
    document.getElementById('time').innerText = n.getHours().toString().padStart(2, '0') + ":" + n.getMinutes().toString().padStart(2, '0');
}, 1000);
