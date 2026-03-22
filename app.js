// Bikepack Pro - Navigatie App
// Geoptimaliseerde en opgekuiste versie

// --- Globale variabelen ---
let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || [];
let activeRouteLayer = null;
let activeRouteId = localStorage.getItem('active_route_id') || null;
let routePoints = [];
let totalDistance = 0;
let isNavigating = false;
let gpsWatchId = null;
let orientationWatchId = null;
let currentHeading = 0;
let autoRotateEnabled = true;

// --- Kaart initialisatie ---
const map = L.map('map', {
    zoomControl: false,
    center: [51.05, 3.73],
    zoom: 13
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

const userMarker = L.marker([0, 0], {
    icon: L.divIcon({
        className: 'user-icon',
        html: '<div class="user-dot"></div>'
    })
}).addTo(map);

// --- UI Elementen ---
const elements = {
    speed: document.getElementById('speed'),
    altitude: document.getElementById('altitude'),
    avgSpeed: document.getElementById('avg-speed'),
    time: document.getElementById('time'),
    distDone: document.getElementById('dist-done'),
    distTodo: document.getElementById('dist-todo'),
    progressFill: document.getElementById('progress-fill'),
    startBtn: document.getElementById('start-nav-btn'),
    stopBtn: document.getElementById('stop-nav-btn'),
    navInstruction: document.getElementById('nav-instruction'),
    navIcon: document.getElementById('nav-icon'),
    navStep: document.getElementById('nav-step'),
    navDist: document.getElementById('nav-dist'),
    routeList: document.getElementById('route-list'),
    gpxFile: document.getElementById('gpx-file'),
    mainMenu: document.getElementById('main-menu'),
    routePage: document.getElementById('route-page'),
    settingsPage: document.getElementById('settings-page'),
    autoRotateToggle: document.getElementById('auto-rotate-toggle')
};

// --- Menu Functies ---
function toggleMenu() {
    elements.mainMenu.style.display = elements.mainMenu.style.display === 'block' ? 'none' : 'block';
}

function showRoutes() {
    closePages();
    elements.routePage.style.display = 'block';
    renderRouteList();
}

function showSettings() {
    closePages();
    elements.settingsPage.style.display = 'block';
}

function closePages() {
    elements.mainMenu.style.display = 'none';
    elements.routePage.style.display = 'none';
    elements.settingsPage.style.display = 'none';
}

function resetApp() {
    if (confirm("Weet u zeker dat u alle gegevens wilt wissen?")) {
        localStorage.clear();
        location.reload();
    }
}

// --- Route Management ---
function loadRoute(id) {
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;

    activeRouteId = id;
    localStorage.setItem('active_route_id', id);
    totalDistance = parseFloat(route.distance);
    isNavigating = false;

    // UI direct updaten
    elements.distTodo.innerText = `${route.distance} km over`;
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';
    elements.navInstruction.style.display = 'none';

    closePages();
    renderRouteList();

    // Vorige route verwijderen
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
    }

    // Nieuwe route laden
    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: {
            color: '#2ecc71',
            weight: 6,
            opacity: 0.8
        }
    }).on('loaded', (e) => {
        map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
        routePoints = e.target.get_planar_coords();
    }).addTo(map);
}

function deleteRoute(id) {
    savedRoutes = savedRoutes.filter(r => r.id !== id);
    localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));

    if (id === activeRouteId) {
        activeRouteId = null;
        localStorage.removeItem('active_route_id');
        location.reload();
    } else {
        renderRouteList();
    }
}

function renderRouteList() {
    if (!elements.routeList) return;

    elements.routeList.innerHTML = savedRoutes.map(route => `
        <div class="route-card ${route.id === activeRouteId ? 'active' : ''}" onclick="loadRoute('${route.id}')">
            <div style="flex:1">
                <strong>${route.name}</strong>
                <br><small>${route.distance} km</small>
            </div>
            <button onclick="event.stopPropagation(); deleteRoute('${route.id}')" 
                    class="delete-btn" title="Verwijder route">
                ×
            </button>
        </div>
    `).join('');
}

// --- Navigatie ---
function startNavigation() {
    isNavigating = true;

    elements.navInstruction.style.display = 'flex';
    elements.startBtn.style.display = 'none';
    elements.stopBtn.style.display = 'block';

    // Zoom naar gebruiker als locatie bekend is
    const currentPos = userMarker.getLatLng();
    if (currentPos.lat !== 0) {
        map.setView(currentPos, 18, { animate: true });
    }

    // Start orientatie tracking
    initOrientationTracking();
}

function stopNavigation() {
    isNavigating = false;

    elements.navInstruction.style.display = 'none';
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';

    if (activeRouteLayer) {
        map.fitBounds(activeRouteLayer.getBounds());
    }

    // Stop orientatie tracking
    stopOrientationTracking();
}

// --- GPS Tracking ---
function initGPS() {
    if (gpsWatchId) return;

    gpsWatchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleGPSError,
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 5000
        }
    );
}

// --- Orientatie Tracking ---
function initOrientationTracking() {
    if (!window.DeviceOrientationEvent) {
        console.warn('DeviceOrientation niet ondersteund');
        return;
    }

    if (orientationWatchId) return;

    orientationWatchId = window.addEventListener('deviceorientation', handleOrientation, true);
}

function stopOrientationTracking() {
    if (orientationWatchId) {
        window.removeEventListener('deviceorientation', handleOrientation, true);
        orientationWatchId = null;

        // Reset kaart rotatie
        map.getContainer().style.transform = 'rotate(0deg)';
    }
}

function handleOrientation(event) {
    if (!isNavigating || !autoRotateEnabled) return;

    // Gebruik alpha (kompass richting) als beschikbaar, anders gamma (hoek links/rechts)
    let heading = event.alpha;

    if (typeof heading !== 'number' || isNaN(heading)) {
        // Fallback naar gamma (hoek van het apparaat)
        heading = event.gamma;
        if (typeof heading !== 'number' || isNaN(heading)) return;
    }

    // Normalizeer heading naar 0-360 graden
    heading = (heading + 360) % 360;

    // Sla huidige heading op
    currentHeading = heading;

    // Roteer de kaart container
    rotateMap(heading);
}

function rotateMap(degrees) {
    const mapContainer = map.getContainer();
    mapContainer.style.transform = `rotate(${degrees}deg)`;
    mapContainer.style.transition = 'transform 0.3s ease-out';
}

function handlePosition(position) {
    const { latitude, longitude, speed, altitude } = position.coords;
    const userPos = L.latLng(latitude, longitude);

    userMarker.setLatLng(userPos);

    // Snelheid updaten
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    elements.speed.innerText = speedKmH;

    // Hoogte updaten
    if (altitude) {
        elements.altitude.innerText = `${Math.round(altitude)}m`;
    }

    if (isNavigating) {
        map.panTo(userPos);
        analyzeRouteAhead(userPos);
    }
}

function handleGPSError(error) {
    console.error('GPS fout:', error.message);
    elements.speed.innerText = 'N/A';
}

// --- Route Analyse ---
function analyzeRouteAhead(userPos) {
    if (!routePoints || routePoints.length < 5) return;

    const nearestPoint = findNearestPoint(userPos);
    const lookAheadPoint = getLookAheadPoint(nearestPoint.index);

    const distanceToAction = userPos.distanceTo([
        lookAheadPoint.lat,
        lookAheadPoint.lon
    ]);

    const turnDirection = calculateTurnDirection(nearestPoint.index);

    updateNavigationUI(turnDirection, distanceToAction);
    updateProgress(nearestPoint.index);
}

function findNearestPoint(userPos) {
    let minDist = Infinity;
    let nearestIndex = 0;

    routePoints.forEach((point, index) => {
        const distance = userPos.distanceTo([point.lat, point.lon]);
        if (distance < minDist) {
            minDist = distance;
            nearestIndex = index;
        }
    });

    return { index: nearestIndex, distance: minDist };
}

function getLookAheadPoint(startIndex) {
    const lookAheadIndex = Math.min(startIndex + 10, routePoints.length - 1);
    return routePoints[lookAheadIndex];
}

function calculateTurnDirection(index) {
    const p1 = routePoints[index];
    const p2 = routePoints[Math.min(index + 3, routePoints.length - 1)];
    const p3 = routePoints[Math.min(index + 10, routePoints.length - 1)];

    const bearing1 = getBearing(p1, p2);
    const bearing2 = getBearing(p2, p3);

    let diff = bearing2 - bearing1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    if (diff > 25) return { icon: '→', text: 'Sla rechtsaf' };
    if (diff < -25) return { icon: '←', text: 'Sla linksaf' };
    return { icon: '↑', text: 'Weg volgen' };
}

function getBearing(p1, p2) {
    if (!p1 || !p2) return 0;

    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon1 = p1.lon * Math.PI / 180;
    const lon2 = p2.lon * Math.PI / 180;

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function updateNavigationUI(direction, distance) {
    elements.navIcon.innerText = direction.icon;
    elements.navStep.innerText = direction.text;
    elements.navDist.innerText = `${Math.round(distance)} m`;
}

function updateProgress(index) {
    const progress = totalDistance > 0 ? (index / routePoints.length) * 100 : 0;
    const distanceDone = (index / routePoints.length) * totalDistance;
    const distanceRemaining = Math.max(0, totalDistance - distanceDone);

    elements.progressFill.style.width = `${progress}%`;
    elements.distDone.innerText = `${distanceDone.toFixed(1)} km`;
    elements.distTodo.innerText = `${distanceRemaining.toFixed(1)} km over`;
}

// --- GPX Import ---
elements.gpxFile.addEventListener('change', handleGPXFiles);

function handleGPXFiles(event) {
    const files = Array.from(event.target.files);

    files.forEach(file => {
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            alert(`Bestand ${file.name} is geen GPX-bestand`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => processGPXFile(e.target.result, file.name);
        reader.readAsText(file);
    });

    // Reset file input
    event.target.value = '';
}

function processGPXFile(gpxData, fileName) {
    try {
        const gpxLayer = new L.GPX(gpxData, { async: true });

        gpxLayer.on('loaded', (e) => {
            const distance = (e.target.get_distance() / 1000).toFixed(1);
            const routeName = fileName.replace('.gpx', '');
            const routeId = `r-${Date.now()}`;

            const newRoute = {
                id: routeId,
                name: routeName,
                distance: distance,
                data: gpxData
            };

            savedRoutes.push(newRoute);
            localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
            renderRouteList();

            // Automatisch laden als dit de eerste route is
            if (savedRoutes.length === 1) {
                loadRoute(routeId);
            }
        });

        gpxLayer.on('error', (e) => {
            console.error('GPX fout:', e.error);
            alert(`Fout bij het verwerken van ${fileName}: ${e.error.message}`);
        });

    } catch (error) {
        console.error('Verwerkingsfout:', error);
        alert(`Kon ${fileName} niet verwerken: ${error.message}`);
    }
}

// --- Initialisatie ---
function init() {
    // Laad instellingen
    loadSettings();

    renderRouteList();

    if (activeRouteId) {
        setTimeout(() => loadRoute(activeRouteId), 500);
    }

    map.locate({
        setView: true,
        maxZoom: 14,
        enableHighAccuracy: true
    });

    initGPS();
    updateTime();
    setInterval(updateTime, 60000); // Update elke minuut
}

function loadSettings() {
    // Laad auto-rotate instelling
    const savedAutoRotate = localStorage.getItem('auto_rotate_enabled');
    if (savedAutoRotate !== null) {
        autoRotateEnabled = savedAutoRotate === 'true';
    } else {
        // Standaard waarde is true
        autoRotateEnabled = true;
    }

    // Update UI
    if (elements.autoRotateToggle) {
        elements.autoRotateToggle.checked = autoRotateEnabled;
        elements.autoRotateToggle.addEventListener('change', (e) => {
            autoRotateEnabled = e.target.checked;
            localStorage.setItem('auto_rotate_enabled', autoRotateEnabled.toString());
        });
    }
}

function updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    elements.time.innerText = `${hours}:${minutes}`;
}

// Start de app wanneer het document klaar is
document.addEventListener('DOMContentLoaded', init);