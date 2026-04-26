'use strict';

const REFERENCE_RADIUS_METERS = 275;
const HOUSE_MARKER_MIN_ZOOM = 16;
const SEARCH_FOCUS_ZOOM = HOUSE_MARKER_MIN_ZOOM;
const HOUSE_CIRCLE_RADIUS = 4.5;
const HOUSE_MARKER_FILL_OPACITY = 0.75;
const HOUSE_MARKER_MUTED_FILL_OPACITY = 0.25;
const MAP_CENTER = [52.7235, 4.7385];
const MAP_ZOOM = 15;
const INITIAL_CONTAINER_BOUNDS_MAX_ZOOM = 16;
const INITIAL_ZOOM_OFFSET = 1;
const MAP_MAX_ZOOM = 19;
const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
const OSRM_PROFILE = 'foot';
const LIVE_ROUTE_TIMEOUT_MS = 15000;
const ROUTE_GEOMETRY_DECIMALS = 6;
const ROUTE_STYLES = [
  { weight: 6, opacity: 0.95 },
  { weight: 4, opacity: 0.72 },
  { weight: 3, opacity: 0.55 }
];

const COVERAGE_STATUS = {
  within_100: {
    label: '0-100 m',
    color: '#15803d'
  },
  between_100_125: {
    label: '100-125 m',
    color: '#eab308'
  },
  between_125_150: {
    label: '125-150 m',
    color: '#f97316'
  },
  between_150_275: {
    label: '150-275 m',
    color: '#dc2626'
  },
  over_275: {
    label: 'Meer dan 275 m',
    color: '#7f1d1d'
  },
  unreachable: {
    label: 'Geen route',
    color: '#64748b'
  }
};

const elements = {
  coverageStatus: document.getElementById('coverage-status'),
  coverageSummary: document.getElementById('coverage-summary'),
  houseSummary: document.getElementById('house-summary'),
  houseDetails: document.getElementById('house-details'),
  containerList: document.getElementById('container-list'),
  houseMapInfo: null
};

const state = {
  containers: [],
  houses: [],
  coverage: null,
  containersById: new Map(),
  activeContainerIndex: null,
  selectedHouse: null,
  coverageCircle: null,
  selectedHouseMarker: null,
  containerMarkers: [],
  containerButtons: [],
  liveRouteCache: new Map(),
  houseSelectionId: 0
};

const map = L.map('map', { preferCanvas: true }).setView(MAP_CENTER, MAP_ZOOM);

map.createPane('houseMarkerPane');
map.getPane('houseMarkerPane').style.zIndex = 410;

map.createPane('resultMarkerPane');
map.getPane('resultMarkerPane').style.zIndex = 420;
map.getPane('resultMarkerPane').style.pointerEvents = 'none';

map.createPane('routePane');
map.getPane('routePane').style.zIndex = 425;
map.getPane('routePane').style.pointerEvents = 'none';

map.createPane('selectionMarkerPane');
map.getPane('selectionMarkerPane').style.zIndex = 435;
map.getPane('selectionMarkerPane').style.pointerEvents = 'none';

const houseRenderer = L.canvas({ padding: 0.5, pane: 'houseMarkerPane' });
const resultRenderer = L.canvas({ padding: 0.5, pane: 'resultMarkerPane' });
const routeRenderer = L.canvas({ padding: 0.5, pane: 'routePane' });
const selectionRenderer = L.canvas({ padding: 0.5, pane: 'selectionMarkerPane' });

const houseLayer = L.layerGroup();
const resultLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const selectionLayer = L.layerGroup().addTo(map);
const containerLayer = L.layerGroup().addTo(map);

const houseInfoControl = L.control({ position: 'bottomleft' });

houseInfoControl.onAdd = () => {
  const container = L.DomUtil.create('aside', 'house-map-info');
  container.hidden = true;

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  return container;
};

houseInfoControl.addTo(map);
elements.houseMapInfo = document.querySelector('.house-map-info');

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: MAP_MAX_ZOOM,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
}).addTo(map);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatMeters(distance) {
  if (!Number.isFinite(distance)) {
    return 'onbekend';
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1).replace('.', ',')} km`;
  }

  return `${Math.round(distance)} m`;
}

function formatDuration(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) {
    return 'onbekende tijd';
  }

  return `${Math.max(1, Math.round(durationSeconds / 60))} min lopen`;
}

function roundMetric(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

function roundCoordinate(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(ROUTE_GEOMETRY_DECIMALS));
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'onbekend';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'onbekend';
  }

  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function getCoverageStatus(status) {
  return COVERAGE_STATUS[status] || COVERAGE_STATUS.unreachable;
}

function getDistanceStatus(distance) {
  if (!Number.isFinite(distance)) {
    return 'unreachable';
  }

  if (distance <= 100) {
    return 'within_100';
  }

  if (distance <= 125) {
    return 'between_100_125';
  }

  if (distance <= 150) {
    return 'between_125_150';
  }

  if (distance <= REFERENCE_RADIUS_METERS) {
    return 'between_150_275';
  }

  return 'over_275';
}

function getWalkingDistanceColor(distance) {
  return getCoverageStatus(getDistanceStatus(distance)).color;
}

function getRouteStyle(index) {
  return ROUTE_STYLES[index] || ROUTE_STYLES[ROUTE_STYLES.length - 1];
}

function setCoverageStatus(message, tone = '') {
  elements.coverageStatus.textContent = message;
  elements.coverageStatus.className = tone ? `status-note ${tone}` : 'status-note';
}

async function loadJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} mislukt (${response.status}).`);
  }
  return response.json();
}

function getSummaryCounts(coverage) {
  const counts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0
  };

  for (const house of coverage?.houses || []) {
    if (Object.prototype.hasOwnProperty.call(counts, house.coverageStatus)) {
      counts[house.coverageStatus] += 1;
    }
  }

  return counts;
}

function renderCoverageSummary() {
  const summary = state.coverage?.summary || {};
  const counts = summary.counts || getSummaryCounts(state.coverage);
  const totalAddresses = Number.isFinite(summary.totalAddresses) ? summary.totalAddresses : state.houses.length;

  elements.coverageSummary.hidden = false;
  elements.coverageSummary.innerHTML = `
    <div class="summary-stat">
      <strong>${totalAddresses.toLocaleString('nl-NL')}</strong>
      <span>adressen</span>
    </div>
    <div class="summary-stat">
      <strong>${(summary.containerCount || state.containers.length).toLocaleString('nl-NL')}</strong>
      <span>containers</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.within_100 || 0).toLocaleString('nl-NL')}</strong>
      <span>0-100 m</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.between_100_125 || 0).toLocaleString('nl-NL')}</strong>
      <span>100-125 m</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.between_125_150 || 0).toLocaleString('nl-NL')}</strong>
      <span>125-150 m</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.between_150_275 || 0).toLocaleString('nl-NL')}</strong>
      <span>150-275 m</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.over_275 || 0).toLocaleString('nl-NL')}</strong>
      <span>meer dan 275 m</span>
    </div>
    <div class="summary-stat">
      <strong>${(counts.unreachable || 0).toLocaleString('nl-NL')}</strong>
      <span>geen route</span>
    </div>
    <div class="summary-meta">
      Gegenereerd: ${escapeHtml(formatTimestamp(state.coverage?.generatedAt))}
    </div>
  `;
}

function getStoredRanking(house) {
  if (Array.isArray(house.nearestContainers) && house.nearestContainers.length > 0) {
    return house.nearestContainers.map((entry) => ({
      ...state.containersById.get(entry.id),
      ...entry
    }));
  }

  if (!house.nearestContainerId) {
    return [];
  }

  return [{
    ...state.containersById.get(house.nearestContainerId),
    id: house.nearestContainerId,
    address: house.nearestContainerAddress,
    accuracy: house.nearestContainerAccuracy,
    straightDistance: house.straightDistance,
    walkingDistance: house.walkingDistance,
    walkingDuration: house.walkingDuration,
    coverageStatus: house.coverageStatus
  }];
}

function buildContainerPopup(container) {
  return `
    <div>
      <strong>${escapeHtml(container.id)}</strong><br>
      ${escapeHtml(container.address)}, Warmenhuizen<br>
      <span style="color:#64748b">Nauwkeurigheid: ${escapeHtml(container.accuracy)}</span>
    </div>
  `;
}

function addContainerMarkers() {
  const bounds = [];
  containerLayer.clearLayers();
  state.containerMarkers = [];

  state.containers.forEach((container, index) => {
    const marker = L.marker([container.lat, container.lon])
      .bindPopup(buildContainerPopup(container))
      .on('click', () => selectContainer(index, { focusMap: false, openPopup: true }));

    marker.addTo(containerLayer);
    state.containerMarkers.push(marker);
    bounds.push([container.lat, container.lon]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: INITIAL_CONTAINER_BOUNDS_MAX_ZOOM });
    map.setZoom(Math.min(map.getZoom() + INITIAL_ZOOM_OFFSET, MAP_MAX_ZOOM));
  }
}

function addContainerList() {
  elements.containerList.innerHTML = '';
  state.containerButtons = [];

  state.containers.forEach((container, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'container-item';
    button.innerHTML = `
      <div>
        <span class="container-code">${escapeHtml(container.id)}</span>
        <span class="container-address">${escapeHtml(container.address)}</span>
      </div>
      <div class="container-meta">Nauwkeurigheid: ${escapeHtml(container.accuracy)}</div>
    `;
    button.addEventListener('click', () => selectContainer(index));
    state.containerButtons.push(button);
    elements.containerList.appendChild(button);
  });
}

function updateActiveContainer(index) {
  if (state.activeContainerIndex !== null && state.containerButtons[state.activeContainerIndex]) {
    state.containerButtons[state.activeContainerIndex].classList.remove('active');
  }

  state.activeContainerIndex = index;

  if (index !== null && state.containerButtons[index]) {
    state.containerButtons[index].classList.add('active');
  }
}

function closeContainerPopups() {
  for (const marker of state.containerMarkers) {
    if (marker.isPopupOpen()) {
      marker.closePopup();
    }
  }
}

function clearCoverageCircle() {
  if (state.coverageCircle) {
    map.removeLayer(state.coverageCircle);
    state.coverageCircle = null;
  }
}

function clearContainerSelection() {
  clearCoverageCircle();
  updateActiveContainer(null);
}

function showCoverageCircle(container) {
  clearCoverageCircle();
  state.coverageCircle = L.circle([container.lat, container.lon], {
    radius: REFERENCE_RADIUS_METERS,
    color: '#2563eb',
    weight: 2,
    opacity: 0.9,
    fillColor: '#60a5fa',
    fillOpacity: 0.18,
    interactive: false
  }).addTo(map);
  state.coverageCircle.bringToBack();
}

function selectContainer(index, { focusMap = true, openPopup = true } = {}) {
  const container = state.containers[index];
  if (!container) {
    return;
  }

  clearHouseSelection();
  showCoverageCircle(container);
  updateActiveContainer(index);

  if (focusMap && state.coverageCircle) {
    map.fitBounds(state.coverageCircle.getBounds(), { padding: [32, 32], maxZoom: 17 });
  }

  if (openPopup && state.containerMarkers[index]) {
    state.containerMarkers[index].openPopup();
  }

  setCoverageStatus(`Geselecteerde container ${container.id}. De blauwe cirkel toont 275 meter hemelsbreed.`);
}

function renderHouseMarkers() {
  houseLayer.clearLayers();

  for (const house of state.houses) {
    const marker = L.circleMarker([house.lat, house.lon], {
      renderer: houseRenderer,
      radius: HOUSE_CIRCLE_RADIUS,
      weight: 1,
      color: '#ffffff',
      fillColor: getCoverageStatus(house.coverageStatus).color,
      fillOpacity: HOUSE_MARKER_FILL_OPACITY
    });

    marker.on('click', () => selectHouse(house));
    houseLayer.addLayer(marker);
  }
}

function setHouseLayerMuted(isMuted) {
  houseLayer.eachLayer((marker) => {
    if (typeof marker.setStyle === 'function') {
      marker.setStyle({
        weight: isMuted ? 0 : 1,
        fillOpacity: isMuted ? HOUSE_MARKER_MUTED_FILL_OPACITY : HOUSE_MARKER_FILL_OPACITY
      });
    }

    if (typeof marker.setRadius === 'function') {
      marker.setRadius(isMuted ? Math.max(3, HOUSE_CIRCLE_RADIUS - 1) : HOUSE_CIRCLE_RADIUS);
    }
  });
}

function syncHouseLayerVisibility() {
  const shouldShowHouses = state.houses.length > 0 && map.getZoom() >= HOUSE_MARKER_MIN_ZOOM;

  if (shouldShowHouses && !map.hasLayer(houseLayer)) {
    houseLayer.addTo(map);
  } else if (!shouldShowHouses && map.hasLayer(houseLayer)) {
    map.removeLayer(houseLayer);
  }

  if (!state.selectedHouse) {
    renderIdleHouseState();
  }
}

function resetHouseSelectionVisuals() {
  map.closePopup();
  selectionLayer.clearLayers();
  resultLayer.clearLayers();
  routeLayer.clearLayers();
  renderHouseMapInfo(null);
  setHouseLayerMuted(false);
  state.selectedHouseMarker = null;
}

function clearHouseSelection() {
  state.selectedHouse = null;
  resetHouseSelectionVisuals();
  renderIdleHouseState();
}

function renderIdleHouseState() {
  elements.houseSummary.hidden = true;
  elements.houseSummary.innerHTML = '';
  elements.houseDetails.innerHTML = '<div class="empty-state">Klik op een huispunt om de opgeslagen dekking en routes te bekijken.</div>';

  if (!state.coverage || state.houses.length === 0) {
    setCoverageStatus('Geen vooraf berekende huizenlaag beschikbaar.', 'error');
    return;
  }

  if (map.getZoom() < HOUSE_MARKER_MIN_ZOOM) {
    setCoverageStatus(`Zoom in tot niveau ${HOUSE_MARKER_MIN_ZOOM} om de huizenlaag te tonen. De batchsamenvatting blijft zichtbaar.`);
    return;
  }

  setCoverageStatus(`Klik op een huispunt om de opgeslagen dekking en maximaal 3 looproutes te zien. ${state.houses.length.toLocaleString('nl-NL')} adressen geladen.`);
}

function renderHouseSummary(house) {
  const postcode = house.postcode ? `${house.postcode} ` : '';
  elements.houseSummary.hidden = false;
  elements.houseSummary.innerHTML = `
    <div class="house-address">${escapeHtml(house.address)}</div>
    <div class="house-meta">${escapeHtml(postcode)}${escapeHtml(house.city || 'Warmenhuizen')}</div>
  `;
}

function buildStatusBadge(status) {
  const coverageStatus = getCoverageStatus(status);
  return `<span class="status-badge" style="background:${coverageStatus.color}">${escapeHtml(coverageStatus.label)}</span>`;
}

function isValidRouteGeometry(routeGeometry) {
  return Array.isArray(routeGeometry)
    && routeGeometry.length >= 2
    && routeGeometry.every((point) => Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1]));
}

function hasRouteGeometry(container) {
  return isValidRouteGeometry(container.routeGeometry);
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function getLiveRouteKey(house, container) {
  return `${house.id || `${house.lat},${house.lon}`}:${container.id}`;
}

function getLiveRouteState(house, container) {
  return state.liveRouteCache.get(getLiveRouteKey(house, container)) || null;
}

function getCurrentContainer(container) {
  return state.containersById.get(container.id) || container;
}

function canFetchLiveRoute(house, container) {
  const currentContainer = getCurrentContainer(container);
  return Number.isFinite(house.lat)
    && Number.isFinite(house.lon)
    && Number.isFinite(currentContainer.lat)
    && Number.isFinite(currentContainer.lon);
}

async function fetchLiveRoute(house, container) {
  const currentContainer = getCurrentContainer(container);
  const coordinates = `${house.lon},${house.lat};${currentContainer.lon},${currentContainer.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coordinates}?overview=simplified&geometries=geojson`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    },
    signal: createTimeoutSignal(LIVE_ROUTE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`OSRM live route mislukt (${response.status}).`);
  }

  const data = await response.json();
  const route = Array.isArray(data.routes) ? data.routes[0] : null;
  const coordinatesList = route?.geometry?.coordinates;
  if (data.code !== 'Ok' || !Array.isArray(coordinatesList)) {
    throw new Error(`OSRM live route gaf code ${data.code || 'onbekend'}.`);
  }

  const routeGeometry = coordinatesList
    .map(([lon, lat]) => [roundCoordinate(lat), roundCoordinate(lon)])
    .filter(([lat, lon]) => lat !== null && lon !== null);

  if (!isValidRouteGeometry(routeGeometry)) {
    throw new Error('OSRM live route bevat geen bruikbare routegeometrie.');
  }

  return {
    routeGeometry,
    walkingDistance: roundMetric(route.distance),
    walkingDuration: roundMetric(route.duration)
  };
}

function loadLiveRoute(house, container) {
  const key = getLiveRouteKey(house, container);
  const cached = state.liveRouteCache.get(key);
  if (cached) {
    return cached.status === 'pending' ? cached.promise : Promise.resolve(cached);
  }

  const promise = fetchLiveRoute(house, container)
    .then((route) => {
      const entry = { status: 'fulfilled', ...route };
      state.liveRouteCache.set(key, entry);
      return entry;
    })
    .catch((error) => {
      const entry = {
        status: 'rejected',
        error: error.message || 'Live route kon niet worden opgehaald.'
      };
      state.liveRouteCache.set(key, entry);
      return entry;
    });

  state.liveRouteCache.set(key, { status: 'pending', promise });
  return promise;
}

function getRouteDisplay(house, container) {
  if (hasRouteGeometry(container)) {
    return { label: 'opgeslagen' };
  }

  const liveRoute = getLiveRouteState(house, container);
  if (!liveRoute) {
    return { label: 'live fallback nog niet opgehaald' };
  }

  if (liveRoute.status === 'pending') {
    return { label: 'live fallback wordt opgehaald' };
  }

  if (liveRoute.status === 'fulfilled') {
    return {
      label: 'live fallback',
      details: `${formatMeters(liveRoute.walkingDistance)} - ${formatDuration(liveRoute.walkingDuration)}`
    };
  }

  return {
    label: 'live fallback mislukt',
    details: liveRoute.error
  };
}

function buildStoredDetails(house, ranking) {
  const nearest = ranking[0] || null;
  const nearestText = nearest
    ? `<strong>${escapeHtml(nearest.id)}</strong> - ${escapeHtml(nearest.address || 'onbekend adres')}`
    : 'Geen gekoppelde container';

  const analysisError = house.analysisError
    ? `<div class="detail-item"><span class="detail-label">Opmerking</span><span class="detail-value">${escapeHtml(house.analysisError)}</span></div>`
    : '';

  return `
    <div class="detail-item">
      <span class="detail-label">Afstandsband</span>
      <span class="detail-value">${buildStatusBadge(house.coverageStatus)}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Opgeslagen loopafstand</span>
      <span class="detail-value">${escapeHtml(formatMeters(house.walkingDistance))} - ${escapeHtml(formatDuration(house.walkingDuration))}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Dichtstbijzijnde container volgens batchanalyse</span>
      <span class="detail-value">${nearestText}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">Hemelsbreed naar gekozen container</span>
      <span class="detail-value">${escapeHtml(formatMeters(house.straightDistance))}</span>
    </div>
    ${analysisError}
  `;
}

function buildRankingMarkup(house, ranking) {
  if (ranking.length === 0) {
    return '<div class="empty-state">Voor dit adres is geen container-ranking opgeslagen.</div>';
  }

  return `
    <div class="detail-item">
      <span class="detail-label">Opgeslagen container-ranking</span>
      <div class="ranking-list">
        ${ranking.map((container, index) => {
          const color = getWalkingDistanceColor(container.walkingDistance);
          const routeDisplay = getRouteDisplay(house, container);
          const routeDetails = routeDisplay.details ? `<br>${escapeHtml(routeDisplay.details)}` : '';
          return `
            <div class="ranking-item">
              <span class="ranking-rank" style="--rank-color:${color}">${index + 1}</span>
              <div>
                <div class="ranking-title"><strong>${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}</div>
                <div class="ranking-meta">
                  ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}<br>
                  Hemelsbreed: ${escapeHtml(formatMeters(container.straightDistance))}<br>
                  Nauwkeurigheid: ${escapeHtml(container.accuracy || 'onbekend')}<br>
                  Route: ${escapeHtml(routeDisplay.label)}${routeDetails}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function buildRouteNotice(ranking, routeCounts) {
  if (ranking.length === 0) {
    return '';
  }

  if (routeCounts.pending > 0) {
    return `
      <div class="detail-item">
        <span class="detail-label">Routeweergave</span>
        <span class="detail-value">Live routefallback wordt opgehaald voor ${routeCounts.pending} ontbrekende route(s).</span>
      </div>
    `;
  }

  if (routeCounts.drawn === ranking.length && routeCounts.live === 0) {
    return `
      <div class="detail-item">
        <span class="detail-label">Routeweergave</span>
        <span class="detail-value">${routeCounts.stored} opgeslagen looproute(s) zijn getekend.</span>
      </div>
    `;
  }

  if (routeCounts.drawn > 0) {
    const failedText = routeCounts.failed > 0
      ? ` ${routeCounts.failed} live fallbackroute(s) konden niet worden opgehaald.`
      : '';
    return `
      <div class="detail-item">
        <span class="detail-label">Routeweergave</span>
        <span class="detail-value">${routeCounts.stored} opgeslagen en ${routeCounts.live} live fallbackroute(s) zijn getekend.${failedText}</span>
      </div>
    `;
  }

  if (routeCounts.failed > 0) {
    return '<div class="empty-state">Routegeometrieën ontbreken en de live routefallback kon niet worden opgehaald.</div>';
  }

  return '<div class="empty-state">Deze coverage bevat nog geen opgeslagen routegeometrieën voor dit adres.</div>';
}

function highlightRanking(ranking) {
  resultLayer.clearLayers();

  for (const [index, container] of ranking.slice(0, 3).entries()) {
    const storedContainer = state.containersById.get(container.id);
    if (!storedContainer) {
      continue;
    }

    const color = getWalkingDistanceColor(container.walkingDistance);
    const latLng = [storedContainer.lat, storedContainer.lon];

    L.circleMarker(latLng, {
      renderer: resultRenderer,
      radius: 13,
      color,
      weight: 3,
      fillColor: color,
      fillOpacity: 0.08,
      interactive: false
    }).addTo(resultLayer);

    L.marker(latLng, {
      pane: 'resultMarkerPane',
      icon: L.divIcon({
        className: 'route-rank-marker',
        html: `<span style="--rank-color:${color}">${index + 1}</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
      interactive: false
    }).addTo(resultLayer);
  }
}

function drawRoutes(house, ranking) {
  routeLayer.clearLayers();
  const routeCounts = {
    stored: 0,
    live: 0,
    drawn: 0,
    pending: 0,
    failed: 0,
    missing: 0
  };

  for (const [index, container] of ranking.entries()) {
    let routeGeometry = null;
    let isLiveRoute = false;

    if (hasRouteGeometry(container)) {
      routeGeometry = container.routeGeometry;
      routeCounts.stored += 1;
    } else {
      const liveRoute = getLiveRouteState(house, container);
      if (liveRoute?.status === 'fulfilled' && isValidRouteGeometry(liveRoute.routeGeometry)) {
        routeGeometry = liveRoute.routeGeometry;
        isLiveRoute = true;
        routeCounts.live += 1;
      } else if (liveRoute?.status === 'pending') {
        routeCounts.pending += 1;
      } else if (liveRoute?.status === 'rejected') {
        routeCounts.failed += 1;
      } else {
        routeCounts.missing += 1;
      }
    }

    if (!routeGeometry) {
      continue;
    }

    const routeStyle = getRouteStyle(index);

L.polyline(routeGeometry, {
  renderer: routeRenderer,
  color: getWalkingDistanceColor(container.walkingDistance),
  weight: routeStyle.weight,
  opacity: routeStyle.opacity,
  dashArray: isLiveRoute ? '8 6' : null,
  lineCap: 'round',
  lineJoin: 'round',
  interactive: false
}).addTo(routeLayer);
    routeCounts.drawn += 1;
  }

  return routeCounts;
}

function buildCompactRankingMarkup(ranking) {
  const topThree = ranking.slice(0, 3);

  if (topThree.length === 0) {
    return '<div class="house-map-info-empty">Geen container-ranking opgeslagen.</div>';
  }

  return `
    <ol class="house-map-ranking">
      ${topThree.map((container, index) => `
        <li>
          <span class="ranking-rank" style="--rank-color:${getWalkingDistanceColor(container.walkingDistance)}">${index + 1}</span>
          <div>
            <div class="house-map-ranking-title">
              <strong>${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}
            </div>
            <div class="house-map-ranking-meta">
              ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}
            </div>
          </div>
        </li>
      `).join('')}
    </ol>
  `;
}

function renderHouseMapInfo(house, ranking = []) {
  if (!elements.houseMapInfo) {
    return;
  }

  if (!house) {
    elements.houseMapInfo.hidden = true;
    elements.houseMapInfo.innerHTML = '';
    return;
  }

  const postcode = house.postcode ? `${house.postcode} ` : '';

  elements.houseMapInfo.hidden = false;
  elements.houseMapInfo.innerHTML = `
    <div class="house-map-info-address">${escapeHtml(house.address)}</div>
    <div class="house-map-info-meta">${escapeHtml(postcode)}${escapeHtml(house.city || 'Warmenhuizen')}</div>
    ${buildCompactRankingMarkup(ranking)}
  `;
}

function renderHouseSelection(house, ranking) {
  renderHouseSummary(house);
  renderHouseMapInfo(house, ranking);

  const routeCounts = drawRoutes(house, ranking);
  elements.houseDetails.innerHTML = `
    ${buildStoredDetails(house, ranking)}
    ${buildRankingMarkup(house, ranking)}
    ${buildRouteNotice(ranking, routeCounts)}
  `;
  highlightRanking(ranking);

  if (routeCounts.pending > 0) {
  setCoverageStatus('Adres geselecteerd: de looproutes worden geladen.', 'loading');
  return routeCounts;
}

if (routeCounts.drawn > 0) {
  const routeText = routeCounts.drawn === 1
    ? '1 looproute is zichtbaar'
    : `${routeCounts.drawn} looproutes zijn zichtbaar`;

  setCoverageStatus(`Adres geselecteerd: ${routeText} op de kaart.`, 'success');
  return routeCounts;
}

if (routeCounts.failed > 0) {
  setCoverageStatus('Adres geselecteerd, maar de looproutes konden niet worden getoond.', 'error');
  return routeCounts;
}

setCoverageStatus('Adres geselecteerd, maar voor dit adres zijn nog geen routegegevens beschikbaar.', 'error');
return routeCounts;

function loadMissingLiveRoutes(house, ranking, selectionId) {
  const requests = ranking
    .filter((container) => !hasRouteGeometry(container) && canFetchLiveRoute(house, container))
    .filter((container) => {
      const liveRoute = getLiveRouteState(house, container);
      return !liveRoute || liveRoute.status === 'pending';
    });

  if (requests.length === 0) {
    return;
  }

  for (const container of requests) {
    loadLiveRoute(house, container).then(() => {
      if (state.houseSelectionId !== selectionId || state.selectedHouse?.id !== house.id) {
        return;
      }

      renderHouseSelection(house, ranking);
    });
  }

  renderHouseSelection(house, ranking);
}

function selectHouse(house, { focusMap = false } = {}) {
  state.selectedHouse = house;
  state.houseSelectionId += 1;
  const selectionId = state.houseSelectionId;
  closeContainerPopups();
  clearContainerSelection();
  resetHouseSelectionVisuals();
  setHouseLayerMuted(true);

  const ranking = getStoredRanking(house);

  const selectedHouseColor = getCoverageStatus(house.coverageStatus).color;
const selectedHouseLatLng = [house.lat, house.lon];

L.circleMarker(selectedHouseLatLng, {
  renderer: selectionRenderer,
  radius: 15,
  color: '#ffffff',
  weight: 5,
  fillColor: selectedHouseColor,
  fillOpacity: 0.18,
  interactive: false
}).addTo(selectionLayer);

state.selectedHouseMarker = L.circleMarker(selectedHouseLatLng, {
  renderer: selectionRenderer,
  radius: 7,
  color: '#0f172a',
  weight: 3,
  fillColor: selectedHouseColor,
  fillOpacity: 1,
  interactive: false
}).addTo(selectionLayer);

state.selectedHouseMarker.bringToFront();

  renderHouseSelection(house, ranking);
  loadMissingLiveRoutes(house, ranking, selectionId);

  if (focusMap && Number.isFinite(house.lat) && Number.isFinite(house.lon)) {
    map.setView([house.lat, house.lon], SEARCH_FOCUS_ZOOM);
  }
}

// --- INIT SEARCH ---
async function initSearch() {
  return new Promise(resolve => {
    if(typeof Fuse==='undefined'){
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
      script.onload=()=>{ setupSearch(); resolve(); };
      document.head.appendChild(script);
    } else {
      setupSearch(); resolve();
    }
  });
}

function setupSearch() {
  const input = document.getElementById('house-search');
  const resultsDiv = document.getElementById('search-results');

  if (!input || !resultsDiv) {
    return;
  }

  const fuse = new Fuse(state.houses, {
    keys: ['address', 'postcode'],
    includeScore: true,
    threshold: 0.3
  });

  input.addEventListener('input', () => {
    const query = input.value.trim();
    resultsDiv.innerHTML = '';

    if (!query) {
      return;
    }

    const results = fuse.search(query).slice(0, 10);

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="search-empty">Geen adres gevonden.</div>';
      return;
    }

    for (const result of results) {
      const house = result.item;
      const button = document.createElement('button');
      const postcode = house.postcode ? `${house.postcode} ` : '';
      const city = house.city || 'Warmenhuizen';

      button.type = 'button';
      button.className = 'search-result';
      button.innerHTML = `
        <span class="search-result-address">${escapeHtml(house.address)}</span>
        <span class="search-result-meta">${escapeHtml(postcode)}${escapeHtml(city)}</span>
      `;

      button.addEventListener('click', () => {
        selectHouse(house, { focusMap: true });
        input.value = house.address;
        resultsDiv.innerHTML = '';
      });

      resultsDiv.appendChild(button);
    }
  });
}

async function init() {
  try {
    const [containers, coverage] = await Promise.all([
      loadJson('./data/container-locations.json', 'Containerdataset laden'),
      loadJson('./data/house-coverage.json', 'Huizenlaag laden')
    ]);

    state.containers = Array.isArray(containers) ? containers : [];
    state.coverage = coverage && typeof coverage === 'object' ? coverage : null;
    state.houses = Array.isArray(state.coverage?.houses) ? state.coverage.houses : [];
    state.containersById = new Map(state.containers.map((container) => [container.id, container]));

    addContainerMarkers();
    addContainerList();
    renderCoverageSummary();
    renderHouseMarkers();
    syncHouseLayerVisibility();

    if (state.houses.length === 0) {
      setCoverageStatus('De viewer kon geen vooraf berekende huizenlaag vinden. Voer de generator uit om deze data te maken.', 'error');
    }
    
    // Pas hier de zoekfunctie initialiseren
    await initSearch();
    
  } catch (error) {
    elements.coverageSummary.hidden = true;
    elements.houseSummary.hidden = true;
    elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
    setCoverageStatus(error.message || 'De viewer kon de batchlaag niet laden.', 'error');
  }
}

map.on('zoomend', syncHouseLayerVisibility);

init();
