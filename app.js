let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;
let isNavigating = false;

const map = L.map('map', { zoomControl: false }).setView([51.05, 3.73], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);
const userMarker = L.circleMarker([0, 0], { radius: 10, fillColor: '#3498db', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(map);

// ... (houd toggleMenu, showRoutes, showSettings, closePages, resetApp hetzelfde) ...

function loadRoute(id) {
    const route = savedRoutes.find(r => r.id == id);
    if (!route) return;

    activeRouteId = id;
    localStorage.setItem('active_route_id', id);

    // Toon de startknop
    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';
    isNavigating = false;

    if (activeRouteLayer) map.removeLayer(activeRouteLayer);
    renderRouteList();

    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: { color: '#2ecc71', weight: 6, opacity: 0.8 }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds(), { padding: [50, 50] });
        routePoints = e.target.get_planar_coords();
        totalDistance = parseFloat(route.distance);
        updateUI(0, totalDistance);
        closePages();
    }).addTo(map);
}

// Navigatie Functies
function startNavigation() {
    isNavigating = true;
    document.getElementById('start-nav-btn').style.display = 'none';
    document.getElementById('stop-nav-btn').style.display = 'block';

    // Zoom in op de gebruiker
    if (userMarker.getLatLng().lat !== 0) {
        map.setView(userMarker.getLatLng(), 18);
    }

    // Verberg menu knop voor meer 'focus'
    document.getElementById('menu-toggle').style.opacity = '0.3';
}

function stopNavigation() {
    isNavigating = false;
    document.getElementById('start-nav-btn').style.display = 'block';
    document.getElementById('stop-nav-btn').style.display = 'none';
    document.getElementById('menu-toggle').style.opacity = '1';

    if (activeRouteLayer) {
        map.fitBounds(activeRouteLayer.getBounds());
    }
}

navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, speed, heading } = pos.coords;
    const p = L.latLng(latitude, longitude);

    userMarker.setLatLng(p);

    // Update Stats
    document.getElementById('speed').innerText = Math.round(speed * 3.6) || 0;

    // Als we navigeren: volg de gebruiker
    if (isNavigating) {
        map.panTo(p);
        // Optioneel: draai de kaart mee (werkt alleen goed op sommige browsers)
        if (heading) map.setBearing(heading);
    }

    if (activeRouteId && routePoints.length > 0) calculateProgress(p);
}, null, { enableHighAccuracy: true });

function updateUI(done, total) {
    if (!total) return;
    const todo = Math.max(0, total - done);
    const pct = (done / total) * 100;

    document.getElementById('progress-fill').style.width = pct + "%";
    document.getElementById('dist-done').innerText = done.toFixed(1) + " km";
    document.getElementById('dist-todo').innerText = todo.toFixed(1) + " km over";

    // In navigatie-modus maken we de tekst groen en dikker
    if (isNavigating) {
        document.getElementById('dist-todo').style.color = 'var(--accent-bright)';
    } else {
        document.getElementById('dist-todo').style.color = 'white';
    }
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