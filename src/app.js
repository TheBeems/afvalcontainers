'use strict';

const REFERENCE_RADIUS_METERS = 275;
const HOUSE_MARKER_MIN_ZOOM = 16;
const MAP_CENTER = [52.7235, 4.7385];
const MAP_ZOOM = 15;

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
  containerList: document.getElementById('container-list')
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
  containerButtons: []
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
const popup = L.popup();

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
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
      .on('click', () => selectContainer(index, { focusMap: false, openPopup: false }));

    marker.addTo(containerLayer);
    state.containerMarkers.push(marker);
    bounds.push([container.lat, container.lon]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
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
      radius: 4,
      weight: 1,
      color: '#ffffff',
      fillColor: getCoverageStatus(house.coverageStatus).color,
      fillOpacity: 0.9
    });

    marker.on('click', () => selectHouse(house));
    houseLayer.addLayer(marker);
  }
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
  map.closePopup(popup);
  selectionLayer.clearLayers();
  resultLayer.clearLayers();
  routeLayer.clearLayers();
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

function hasRouteGeometry(container) {
  return Array.isArray(container.routeGeometry)
    && container.routeGeometry.length >= 2
    && container.routeGeometry.every((point) => Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1]));
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

function buildRankingMarkup(ranking) {
  if (ranking.length === 0) {
    return '<div class="empty-state">Voor dit adres is geen container-ranking opgeslagen.</div>';
  }

  return `
    <div class="detail-item">
      <span class="detail-label">Opgeslagen container-ranking</span>
      <div class="ranking-list">
        ${ranking.map((container, index) => {
          const color = getWalkingDistanceColor(container.walkingDistance);
          return `
            <div class="ranking-item">
              <span class="ranking-rank" style="--rank-color:${color}">${index + 1}</span>
              <div>
                <div class="ranking-title"><strong>${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}</div>
                <div class="ranking-meta">
                  ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}<br>
                  Hemelsbreed: ${escapeHtml(formatMeters(container.straightDistance))}<br>
                  Nauwkeurigheid: ${escapeHtml(container.accuracy || 'onbekend')}<br>
                  Route: ${hasRouteGeometry(container) ? 'opgeslagen' : 'niet beschikbaar'}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function buildRouteNotice(ranking, drawnRouteCount) {
  if (ranking.length === 0) {
    return '';
  }

  if (drawnRouteCount === ranking.length) {
    return `
      <div class="detail-item">
        <span class="detail-label">Routeweergave</span>
        <span class="detail-value">${drawnRouteCount} opgeslagen looproutes zijn getekend.</span>
      </div>
    `;
  }

  if (drawnRouteCount > 0) {
    return `
      <div class="detail-item">
        <span class="detail-label">Routeweergave</span>
        <span class="detail-value">${drawnRouteCount} van de ${ranking.length} opgeslagen looproutes zijn getekend. Genereer de coverage opnieuw voor ontbrekende routes.</span>
      </div>
    `;
  }

  return `
    <div class="empty-state">Deze coverage bevat nog geen opgeslagen routegeometrieën voor dit adres. Genereer ` +
    `data/house-coverage.json opnieuw om de 3 looproutes te kunnen tekenen.</div>
  `;
}

function highlightRanking(ranking) {
  resultLayer.clearLayers();

  for (const container of ranking) {
    const storedContainer = state.containersById.get(container.id);
    if (!storedContainer) {
      continue;
    }

    L.circleMarker([storedContainer.lat, storedContainer.lon], {
      renderer: resultRenderer,
      radius: 12,
      color: getWalkingDistanceColor(container.walkingDistance),
      weight: 3,
      fillOpacity: 0,
      interactive: false
    }).addTo(resultLayer);
  }
}

function drawStoredRoutes(ranking) {
  routeLayer.clearLayers();
  let drawnRouteCount = 0;

  for (const container of ranking) {
    if (!hasRouteGeometry(container)) {
      continue;
    }

    L.polyline(container.routeGeometry, {
      renderer: routeRenderer,
      color: getWalkingDistanceColor(container.walkingDistance),
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(routeLayer);
    drawnRouteCount += 1;
  }

  return drawnRouteCount;
}

function buildHousePopup(house, ranking) {
  const postcode = house.postcode ? `${escapeHtml(house.postcode)} ` : '';
  const rankingHtml = ranking.length > 0
    ? `<ol class="popup-list">${ranking.map((container, index) => `
      <li><strong style="color:${getWalkingDistanceColor(container.walkingDistance)}">${index + 1}. ${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}<br>${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}</li>
    `).join('')}</ol>`
    : '<br><span style="color:#64748b">Geen container-ranking opgeslagen.</span>';

  return `
    <div>
      <strong>${escapeHtml(house.address)}</strong><br>
      <span style="color:#64748b">${postcode}${escapeHtml(house.city || 'Warmenhuizen')}</span><br>
      ${buildStatusBadge(house.coverageStatus)}
      ${rankingHtml}
    </div>
  `;
}

function selectHouse(house) {
  state.selectedHouse = house;
  closeContainerPopups();
  clearContainerSelection();
  resetHouseSelectionVisuals();

  const ranking = getStoredRanking(house);

  state.selectedHouseMarker = L.circleMarker([house.lat, house.lon], {
    renderer: selectionRenderer,
    radius: 8,
    color: '#0f172a',
    weight: 2,
    fillColor: getCoverageStatus(house.coverageStatus).color,
    fillOpacity: 0.95,
    interactive: false
  }).addTo(selectionLayer);

  renderHouseSummary(house);
  const drawnRouteCount = drawStoredRoutes(ranking);
  elements.houseDetails.innerHTML = `
    ${buildStoredDetails(house, ranking)}
    ${buildRankingMarkup(ranking)}
    ${buildRouteNotice(ranking, drawnRouteCount)}
  `;
  highlightRanking(ranking);

  popup
    .setLatLng([house.lat, house.lon])
    .setContent(buildHousePopup(house, ranking))
    .openOn(map);

  if (drawnRouteCount > 0) {
    setCoverageStatus(`Opgeslagen batchanalyse geladen; ${drawnRouteCount} looproutes getekend.`, 'success');
    return;
  }

  setCoverageStatus('Opgeslagen batchanalyse geladen; routegeometrieën ontbreken nog voor dit adres.', 'error');
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
  } catch (error) {
    elements.coverageSummary.hidden = true;
    elements.houseSummary.hidden = true;
    elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
    setCoverageStatus(error.message || 'De viewer kon de batchlaag niet laden.', 'error');
  }
}

map.on('zoomend', syncHouseLayerVisibility);

init();
