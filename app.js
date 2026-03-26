// Bikepack Pro - Navigatie App
// Geoptimaliseerde en opgekuiste versie

// --- Globale variabelen ---
let savedRoutes = JSON.parse(localStorage.getItem('bikepack_routes')) || []; // Lijst met opgeslagen routes uit localStorage
let activeRouteLayer = null; // Huidige actieve route op de kaart
let activeRouteId = localStorage.getItem('active_route_id') || null; // ID van de actieve route
let routePoints = []; // Coördinaten van de huidige route
let totalDistance = 0; // Totale afstand van de huidige route in km
let isNavigating = false; // Of navigatie actief is
let gpsWatchId = null; // ID van GPS tracking
let orientationWatchId = null; // ID van orientatie tracking
let currentHeading = 0; // Huidige kompaskoers
let autoRotateEnabled = true; // Of automatische kaartrotatie aan staat
let phoneOrientation = 'vertical'; // Telefoon orientatie: 'vertical' of 'horizontal'

// --- Kaart initialisatie ---
const map = L.map('map', {
    zoomControl: false, // Geen zoom knoppen tonen
    center: [51.05, 3.73], // Standaard centrum (Gent)
    zoom: 13 // Standaard zoomniveau
});

// Voeg kaartlaag toe (CARTO Voyager)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(map);

// Gebruikers marker (de groene stip)
const userMarker = L.marker([0, 0], {
    icon: L.divIcon({
        className: 'user-icon', // CSS klasse voor styling
        html: '<div class="user-dot"></div>' // HTML voor de stip
    })
}).addTo(map);

// --- UI Elementen ---
const elements = {
    speed: document.getElementById('speed'), // Snelheidsweergave
    altitude: document.getElementById('altitude'), // Hoogteweergave
    avgSpeed: document.getElementById('avg-speed'), // Gemiddelde snelheid
    time: document.getElementById('time'), // Tijdsaanduiding
    distDone: document.getElementById('dist-done'), // Afgelegde afstand
    distTodo: document.getElementById('dist-todo'), // Resterende afstand
    progressFill: document.getElementById('progress-fill'), // Voortgangsbalk
    startBtn: document.getElementById('start-nav-btn'), // Start navigatie knop
    stopBtn: document.getElementById('stop-nav-btn'), // Stop navigatie knop
    navInstruction: document.getElementById('nav-instruction'), // Navigatie-instructie
    navIcon: document.getElementById('nav-icon'), // Pijl-icoon voor instructie
    navStep: document.getElementById('nav-step'), // Tekst instructie
    navDist: document.getElementById('nav-dist'), // Afstand tot volgende actie
    routeList: document.getElementById('route-list'), // Lijst met routes
    gpxFile: document.getElementById('gpx-file'), // Bestandskeuze voor GPX
    mainMenu: document.getElementById('main-menu'), // Hoofdmenu
    routePage: document.getElementById('route-page'), // Routes pagina
    settingsPage: document.getElementById('settings-page'), // Instellingen pagina
    autoRotateToggle: document.getElementById('auto-rotate-toggle') // Schakelaar voor automatische rotatie
};

// --- Menu Functies ---
function toggleMenu() {
    // Toggle het hoofdmenu: als het zichtbaar is, verberg het, anders toon het
    const menuVisible = elements.mainMenu.style.display === 'block';
    elements.mainMenu.style.display = menuVisible ? 'none' : 'block';
    // Update zichtbaarheid van menuknopje
    updateMenuButtonVisibility();
}

function showRoutes() {
    // Sluit alle andere pagina's en toon de routes pagina
    closePages();
    elements.routePage.style.display = 'block';
    renderRouteList();
    // Update zichtbaarheid van menuknopje
    updateMenuButtonVisibility();
}

function showSettings() {
    // Sluit alle andere pagina's en toon de instellingen pagina
    closePages();
    elements.settingsPage.style.display = 'block';
    // Update zichtbaarheid van menuknopje
    updateMenuButtonVisibility();
}

function closePages() {
    // Verberg alle full-page overlays
    elements.mainMenu.style.display = 'none';
    elements.routePage.style.display = 'none';
    elements.settingsPage.style.display = 'none';
    // Update zichtbaarheid van menuknopje
    updateMenuButtonVisibility();
}

function updateMenuButtonVisibility() {
    // Controleer of er een overlay zichtbaar is
    const menuVisible = elements.mainMenu.style.display === 'block';
    const routePageVisible = elements.routePage.style.display === 'block';
    const settingsPageVisible = elements.settingsPage.style.display === 'block';

    // Selecteer het menuknopje
    const menuButton = document.getElementById('menu-toggle');
    if (menuButton) {
        // Als er een overlay zichtbaar is, verberg het knopje, anders toon het
        if (menuVisible || routePageVisible || settingsPageVisible) {
            menuButton.classList.add('hidden');
        } else {
            menuButton.classList.remove('hidden');
        }
    }
}

function resetApp() {
    // Vraag bevestiging voor het wissen van alle gegevens
    if (confirm("Weet u zeker dat u alle gegevens wilt wissen?")) {
        localStorage.clear();
        location.reload();
    }
}

// --- Route Management ---
function loadRoute(id) {
    // Zoek de route met het opgegeven ID
    const route = savedRoutes.find(r => r.id === id);
    if (!route) return;

    // Stel de actieve route in
    activeRouteId = id;
    localStorage.setItem('active_route_id', id);
    totalDistance = parseFloat(route.distance);
    isNavigating = false;

    // UI direct updaten
    elements.distTodo.innerText = `${route.distance} km over`;
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';
    elements.navInstruction.style.display = 'none';

    // Sluit eventuele openstaande pagina's
    closePages();
    renderRouteList();

    // Verwijder vorige route van de kaart
    if (activeRouteLayer) {
        map.removeLayer(activeRouteLayer);
    }

    // Laad de nieuwe route
    activeRouteLayer = new L.GPX(route.data, {
        async: true,
        polyline_options: {
            color: '#2ecc71',
            weight: 6,
            opacity: 0.8
        }
    }).on('loaded', (e) => {
        // Pas zoomniveau aan op de route
        map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
        // Sla route punten op voor navigatie
        routePoints = e.target.get_planar_coords();
    }).addTo(map);
}

function deleteRoute(id) {
    // Verwijder route uit de lijst
    savedRoutes = savedRoutes.filter(r => r.id !== id);
    localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));

    // Als de verwijderde route actief was, herstart de app
    if (id === activeRouteId) {
        activeRouteId = null;
        localStorage.removeItem('active_route_id');
        location.reload();
    } else {
        // Anders gewoon de lijst opnieuw renderen
        renderRouteList();
    }
}

function renderRouteList() {
    // Zorg dat de routeList element bestaat
    if (!elements.routeList) return;

    // Genereer HTML voor elke route
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
    // Zet navigatiestatus aan
    isNavigating = true;

    // Toon navigatie UI
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
    // Zet navigatiestatus uit
    isNavigating = false;

    // Verberg navigatie UI
    elements.navInstruction.style.display = 'none';
    elements.startBtn.style.display = 'block';
    elements.stopBtn.style.display = 'none';

    // Pas zoomniveau aan op de route
    if (activeRouteLayer) {
        map.fitBounds(activeRouteLayer.getBounds());
    }

    // Stop orientatie tracking
    stopOrientationTracking();
}

// --- GPS Tracking ---
function initGPS() {
    // Voorkom meerdere GPS watches
    if (gpsWatchId) return;

    // Start GPS tracking met hoge nauwkeurigheid
    gpsWatchId = navigator.geolocation.watchPosition(
        handlePosition, // Callback bij positie update
        handleGPSError, // Callback bij fout
        {
            enableHighAccuracy: true, // Gebruik GPS in plaats van netwerk
            maximumAge: 10000, // Max leeftijd cache (10 seconden)
            timeout: 5000 // Max wachttijd voor positie (5 seconden)
        }
    );
}

// --- Orientatie Tracking ---
function initOrientationTracking() {
    // Controleer of het apparaat orientatie ondersteunt
    if (!window.DeviceOrientationEvent) {
        console.warn('DeviceOrientation niet ondersteund');
        alert('Uw apparaat ondersteunt geen orientatie tracking');
        return;
    }

    // Voorkom meerdere listeners
    if (orientationWatchId) return;

    console.log('Start orientatie tracking');
    orientationWatchId = true;

    // Safari/iOS 13+ specifieke handling (vereist expliciete toestemming)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // Vraag toestemming voor motion sensors
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    setupOrientationListener();
                } else {
                    alert('Toestemming voor motion sensors is geweigerd. Ga naar Instellingen > Safari > Beweging en Oriëntatie om dit in te schakelen.');
                    orientationWatchId = null;
                }
            })
            .catch(error => {
                console.warn('Toestemming voor motion sensors mislukt:', error);
                // Probeer zonder toestemming (werkt op sommige oudere iOS versies)
                setupOrientationListener();
            });
    } else {
        // Android/oude iOS versies (geen toestemming nodig)
        setupOrientationListener();
    }
}

function setupOrientationListener() {
    // Voeg event listener toe voor orientatie veranderingen
    try {
        window.addEventListener('deviceorientation', handleOrientation, true);
    } catch (e) {
        document.addEventListener('deviceorientation', handleOrientation, true);
    }
}

function stopOrientationTracking() {
    // Stop orientatie tracking
    if (orientationWatchId) {
        console.log('Stop orientatie tracking');

        // Verwijder event listener
        try {
            window.removeEventListener('deviceorientation', handleOrientation, true);
        } catch (e) {
            document.removeEventListener('deviceorientation', handleOrientation, true);
        }

        orientationWatchId = null;

        // Reset kaart rotatie
        const mapContainer = map.getContainer();
        mapContainer.style.transform = 'rotate(0deg)';
        mapContainer.style.transition = 'transform 0.5s ease-out';
    }
}

function handleOrientation(event) {
    // Alleen reageren als navigatie actief is en auto-rotatie aan staat
    if (!isNavigating || !autoRotateEnabled) return;

    // Debug logging voor ontwikkeling
    console.log('Orientatie event:', {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        absolute: event.absolute,
        phoneOrientation: phoneOrientation
    });

    // Gebruik alpha (kompass richting) als beschikbaar, anders gamma (hoek links/rechts)
    let heading = event.alpha;

    if (typeof heading !== 'number' || isNaN(heading) || heading === null) {
        console.log('Alpha niet beschikbaar, probeer gamma');
        // Fallback naar gamma (hoek van het apparaat)
        heading = event.gamma;
        if (typeof heading !== 'number' || isNaN(heading) || heading === null) {
            console.log('Geen orientatie data beschikbaar');
            return;
        }
    }

    // Normalizeer heading naar 0-360 graden
    heading = (heading + 360) % 360;

    // Pas rotatie aan op basis van telefoon orientatie
    let adjustedHeading = heading;

    if (phoneOrientation === 'horizontal') {
        // Bij horizontale orientatie, draai 90 graden extra
        adjustedHeading = (heading + 90) % 360;
    }
    // Bij verticale orientatie blijft de heading zoals hij is

    // Sla huidige heading op
    currentHeading = adjustedHeading;

    // Roteer de kaart container
    rotateMap(adjustedHeading);
}

function rotateMap(degrees) {
    // Roteer de kaart container met een smooth transition
    const mapContainer = map.getContainer();
    mapContainer.style.transform = `rotate(${degrees}deg)`;
    mapContainer.style.transition = 'transform 0.3s ease-out';
}

function handlePosition(position) {
    // Haal GPS coördinaten en snelheid uit de positie
    const { latitude, longitude, speed, altitude } = position.coords;
    const userPos = L.latLng(latitude, longitude);

    // Update gebruikers positie op de kaart
    userMarker.setLatLng(userPos);

    // Snelheid updaten (omzetten van m/s naar km/u)
    const speedKmH = speed ? Math.round(speed * 3.6) : 0;
    elements.speed.innerText = speedKmH;

    // Hoogte updaten (indien beschikbaar)
    if (altitude) {
        elements.altitude.innerText = `${Math.round(altitude)}m`;
    }

    // Als navigatie actief is, analyseer de route
    if (isNavigating) {
        map.panTo(userPos);
        analyzeRouteAhead(userPos);
    }
}

function handleGPSError(error) {
    // Toon foutmelding in console en UI
    console.error('GPS fout:', error.message);
    elements.speed.innerText = 'N/A';
}

// --- Route Analyse ---
function analyzeRouteAhead(userPos) {
    // Controleer of er route punten zijn om mee te werken
    if (!routePoints || routePoints.length < 5) return;

    // Vind het dichtstbijzijnde punt op de route
    const nearestPoint = findNearestPoint(userPos);
    // Vind een punt verderop in de route voor richtingsbepaling
    const lookAheadPoint = getLookAheadPoint(nearestPoint.index);

    // Bereken afstand tot het punt waar actie nodig is
    const distanceToAction = userPos.distanceTo([
        lookAheadPoint.lat,
        lookAheadPoint.lon
    ]);

    // Bepaal de draai richting
    const turnDirection = calculateTurnDirection(nearestPoint.index);

    // Update navigatie UI
    updateNavigationUI(turnDirection, distanceToAction);
    // Update voortgangsbalk
    updateProgress(nearestPoint.index);
}

function findNearestPoint(userPos) {
    // Zoek het dichtstbijzijnde punt op de route
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
    // Vind een punt verderop in de route (max 10 punten verder)
    const lookAheadIndex = Math.min(startIndex + 10, routePoints.length - 1);
    return routePoints[lookAheadIndex];
}

function calculateTurnDirection(index) {
    // Bepaal de draai richting op basis van 3 punten
    const p1 = routePoints[index];
    const p2 = routePoints[Math.min(index + 3, routePoints.length - 1)];
    const p3 = routePoints[Math.min(index + 10, routePoints.length - 1)];

    // Bereken kompaskoersen tussen de punten
    const bearing1 = getBearing(p1, p2);
    const bearing2 = getBearing(p2, p3);

    // Bereken het verschil in graden
    let diff = bearing2 - bearing1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Bepaal de draai richting op basis van het verschil
    if (diff > 25) return { icon: '→', text: 'Sla rechtsaf' };
    if (diff < -25) return { icon: '←', text: 'Sla linksaf' };
    return { icon: '↑', text: 'Weg volgen' };
}

function getBearing(p1, p2) {
    // Bereken kompaskoers tussen twee punten
    if (!p1 || !p2) return 0;

    // Converteer graden naar radialen
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    const lon1 = p1.lon * Math.PI / 180;
    const lon2 = p2.lon * Math.PI / 180;

    // Bereken de draai richting met trigonometrie
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

    // Converteer terug naar graden en normaliseer
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function updateNavigationUI(direction, distance) {
    // Update de navigatie instructie op het scherm
    elements.navIcon.innerText = direction.icon;
    elements.navStep.innerText = direction.text;
    elements.navDist.innerText = `${Math.round(distance)} m`;
}

function updateProgress(index) {
    // Bereken en update de voortgang
    const progress = totalDistance > 0 ? (index / routePoints.length) * 100 : 0;
    const distanceDone = (index / routePoints.length) * totalDistance;
    const distanceRemaining = Math.max(0, totalDistance - distanceDone);

    // Update UI elementen
    elements.progressFill.style.width = `${progress}%`;
    elements.distDone.innerText = `${distanceDone.toFixed(1)} km`;
    elements.distTodo.innerText = `${distanceRemaining.toFixed(1)} km over`;
}

// --- GPX Import ---
// Voeg event listener toe aan het GPX bestandskeuze veld
elements.gpxFile.addEventListener('change', handleGPXFiles);

function handleGPXFiles(event) {
    // Haal alle geselecteerde bestanden op
    const files = Array.from(event.target.files);

    // Verwerk elk bestand
    files.forEach(file => {
        // Controleer of het een GPX bestand is
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            alert(`Bestand ${file.name} is geen GPX-bestand`);
            return;
        }

        // Lees het bestand als tekst
        const reader = new FileReader();
        reader.onload = (e) => processGPXFile(e.target.result, file.name);
        reader.readAsText(file);
    });

    // Reset het bestandskeuze veld
    event.target.value = '';
}

function processGPXFile(gpxData, fileName) {
    try {
        // Maak een nieuwe GPX laag aan
        const gpxLayer = new L.GPX(gpxData, { async: true });

        // Behandel succesvol geladen GPX
        gpxLayer.on('loaded', (e) => {
            // Bereken afstand in kilometers
            const distance = (e.target.get_distance() / 1000).toFixed(1);
            // Gebruik bestandsnaam als routenaam (zonder .gpx extensie)
            const routeName = fileName.replace('.gpx', '');
            // Genereer unieke route ID
            const routeId = `r-${Date.now()}`;

            // Maak nieuw route object aan
            const newRoute = {
                id: routeId,
                name: routeName,
                distance: distance,
                data: gpxData
            };

            // Voeg route toe aan de lijst
            savedRoutes.push(newRoute);
            localStorage.setItem('bikepack_routes', JSON.stringify(savedRoutes));
            renderRouteList();

            // Als dit de eerste route is, laad hem automatisch
            if (savedRoutes.length === 1) {
                loadRoute(routeId);
            }
        });

        // Behandel fouten bij het laden
        gpxLayer.on('error', (e) => {
            console.error('GPX fout:', e.error);
            alert(`Fout bij het verwerken van ${fileName}: ${e.error.message}`);
        });

    } catch (error) {
        // Toon foutmelding bij verwerking
        console.error('Verwerkingsfout:', error);
        alert(`Kon ${fileName} niet verwerken: ${error.message}`);
    }
}

// --- Initialisatie ---
function init() {
    // Laad instellingen uit localStorage
    loadSettings();

    // Render de route lijst
    renderRouteList();

    // Als er een actieve route is, laad hem na een korte vertraging
    if (activeRouteId) {
        setTimeout(() => loadRoute(activeRouteId), 500);
    }

    // Probeer GPS locatie te bepalen en zoom naar gebruiker
    map.locate({
        setView: true,
        maxZoom: 14,
        enableHighAccuracy: true
    });

    // Start GPS tracking
    initGPS();

    // Update tijd weergave
    updateTime();
    // Update tijd elke minuut
    setInterval(updateTime, 60000);
}

function loadSettings() {
    // Laad auto-rotate instelling uit localStorage
    const savedAutoRotate = localStorage.getItem('auto_rotate_enabled');
    if (savedAutoRotate !== null) {
        autoRotateEnabled = savedAutoRotate === 'true';
    } else {
        // Standaard waarde is true
        autoRotateEnabled = true;
    }

    // Laad telefoon orientatie instelling uit localStorage
    const savedPhoneOrientation = localStorage.getItem('phone_orientation');
    if (savedPhoneOrientation !== null) {
        phoneOrientation = savedPhoneOrientation;
    } else {
        // Standaard waarde is vertical
        phoneOrientation = 'vertical';
    }

    // Update UI elementen met de geladen instellingen
    if (elements.autoRotateToggle) {
        elements.autoRotateToggle.checked = autoRotateEnabled;
        elements.autoRotateToggle.addEventListener('change', (e) => {
            autoRotateEnabled = e.target.checked;
            localStorage.setItem('auto_rotate_enabled', autoRotateEnabled.toString());
        });
    }

    // Update telefoon orientatie UI
    const verticalRadio = document.getElementById('vertical-orientation');
    const horizontalRadio = document.getElementById('horizontal-orientation');

    if (verticalRadio && horizontalRadio) {
        if (phoneOrientation === 'vertical') {
            verticalRadio.checked = true;
        } else {
            horizontalRadio.checked = true;
        }

        verticalRadio.addEventListener('change', () => {
            phoneOrientation = 'vertical';
            localStorage.setItem('phone_orientation', phoneOrientation);
        });

        horizontalRadio.addEventListener('change', () => {
            phoneOrientation = 'horizontal';
            localStorage.setItem('phone_orientation', phoneOrientation);
        });
    }
}

function updateTime() {
    // Update tijd weergave in het dashboard
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    elements.time.innerText = `${hours}:${minutes}`;
}

// Start de app wanneer het document klaar is
// Wacht tot de DOM volledig geladen is voordat de app wordt geïnitialiseerd
document.addEventListener('DOMContentLoaded', init);
