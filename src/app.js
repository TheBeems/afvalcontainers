'use strict';

const REFERENCE_RADIUS_METERS = 275;
const HOUSE_MARKER_MIN_ZOOM = 16;
const SEARCH_FOCUS_ZOOM = HOUSE_MARKER_MIN_ZOOM;
const SEARCH_RESULT_LIMIT = 10;
const SEARCH_MIN_QUERY_LENGTH = 1;
const HOUSE_CIRCLE_RADIUS = 4.5;
const HOUSE_MARKER_FILL_OPACITY = 0.75;
const HOUSE_MARKER_MUTED_FILL_OPACITY = 1.0;
const MAP_CENTER = [52.7235, 4.7385];
const MAP_ZOOM = 15;
const INITIAL_CONTAINER_BOUNDS_MAX_ZOOM = 16;
const INITIAL_ZOOM_OFFSET = 1;
const MAP_MAX_ZOOM = 19;
const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
const OSRM_PROFILE = 'foot';
const LIVE_ROUTE_TIMEOUT_MS = 15000;
const ROUTE_GEOMETRY_DECIMALS = 6;
const CONTAINER_LONG_PRESS_MS = 600;
const MANUAL_CONTAINER_ACCURACY = 'handmatig bepaald (zeer hoog, onzekerheid -1 m)';
const CONTAINER_ID_PATTERN = /^WH\d{2}$/;
const DEFAULT_CONTAINER_TYPE = 'rest';
const DEFAULT_CONTAINER_STATUS = 'new';
const MOBILE_MAP_SCROLL_QUERY = '(max-width: 960px)';
const CONTAINER_TYPE_LABELS = {
  rest: 'Rest',
  'semi-rest': 'Semi-rest',
  gfe: 'GFE'
};
const CONTAINER_STATUS_LABELS = {
  new: 'Nieuw',
  existing: 'Bestaand'
};
const CONTAINER_CATEGORIES = {
  'new:rest': {
    label: 'Nieuw rest',
    borderColor: '#ef1d1d',
    fillColor: '#fee2e2'
  },
  'existing:rest': {
    label: 'Bestaand rest',
    borderColor: '#111111',
    fillColor: '#f8fafc'
  },
  'new:semi-rest': {
    label: 'Nieuw semi-rest',
    borderColor: '#b91bb8',
    fillColor: '#f3e8ff'
  },
  'new:gfe': {
    label: 'Nieuw GFE',
    borderColor: '#18bf20',
    fillColor: '#dcfce7'
  }
};
const VALID_CONTAINER_TYPES = new Set(Object.keys(CONTAINER_TYPE_LABELS));
const VALID_CONTAINER_STATUSES = new Set(Object.keys(CONTAINER_STATUS_LABELS));
const CHANGED_CONTAINER_PREVIEW_LIMIT = 4;
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

const SUMMARY_DISTANCE_ROWS = [
  { key: 'within_100', label: '0-100 m' },
  { key: 'between_100_125', label: '100-125 m' },
  { key: 'between_125_150', label: '125-150 m' },
  { key: 'between_150_275', label: '150-275 m' },
  { key: 'over_275', label: 'meer dan 275 m' },
  { key: 'unreachable', label: 'geen route' }
];

const elements = {
  coverageStatus: document.getElementById('coverage-status'),
  coverageSummaryPanel: document.getElementById('coverage-summary-panel'),
  coverageSummary: document.getElementById('coverage-summary'),
  houseSummary: document.getElementById('house-summary'),
  houseDetails: document.getElementById('house-details'),
  containerList: document.getElementById('container-list'),
  mapShell: document.querySelector('.map-shell'),
  mapLegend: null,
  containerMarkerLegend: null,
  mapInfoStack: null,
  containerMapInfo: null,
  houseMapInfo: null,
  containerEditor: null,
  containerEditorToggle: null,
  containerEditorBadge: null,
  containerEditorPanel: null,
  containerEditorStatus: null,
  containerChangeCount: null,
  containerChangeList: null,
  containerEditPanel: null,
  addContainerButton: null,
  downloadContainersButton: null,
  resetContainersButton: null
};

const state = {
  containers: [],
  originalContainers: [],
  houses: [],
  coverage: null,
  containersById: new Map(),
  containersByKey: new Map(),
  originalContainersById: new Map(),
  originalContainersByKey: new Map(),
  activeContainerIndex: null,
  activeContainerKey: null,
  selectedHouse: null,
  coverageCircle: null,
  selectedHouseMarker: null,
  containerMarkers: [],
  containerButtons: [],
  liveRouteCache: new Map(),
  houseSelectionId: 0,
  containerInfoCollapsed: false,
  houseInfoCollapsed: false,
  containerEditorExpanded: false,
  addContainerMode: false,
  pendingNewContainer: null,
  editingContainerKey: null,
  nextContainerClientKey: 1,
  unlockedContainerKey: null,
  containerDragStart: null,
  suppressContainerClickUntil: 0
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

const mapInfoControl = L.control({ position: 'bottomleft' });
const mapLegendControl = L.control({ position: 'bottomright' });
const containerMarkerLegendControl = L.control({ position: 'bottomright' });
const containerEditorControl = L.control({ position: 'topright' });

mapLegendControl.onAdd = () => {
  const container = L.DomUtil.create('details', 'map-collapsible map-legend');
  container.id = 'map-legend';
  container.open = true;
  container.setAttribute('aria-label', 'Legenda loopafstand');

  container.innerHTML = `
    <summary>Legenda loopafstand</summary>
    <div class="map-collapsible-body">
      <span class="map-legend-item"><span class="map-legend-dot status-within"></span>0-100 m</span>
      <span class="map-legend-item"><span class="map-legend-dot status-warning"></span>100-125 m</span>
      <span class="map-legend-item"><span class="map-legend-dot status-caution"></span>125-150 m</span>
      <span class="map-legend-item"><span class="map-legend-dot status-over"></span>150-275 m</span>
      <span class="map-legend-item"><span class="map-legend-dot status-far-over"></span>meer dan 275 m</span>
      <span class="map-legend-item"><span class="map-legend-dot status-unreachable"></span>geen route</span>
    </div>
  `;

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  return container;
};

mapLegendControl.addTo(map);
elements.mapLegend = document.getElementById('map-legend');

containerMarkerLegendControl.onAdd = () => {
  const container = L.DomUtil.create('details', 'map-collapsible container-marker-legend');
  container.id = 'container-marker-legend';
  container.open = true;
  container.setAttribute('aria-label', 'Legenda containermarkers');

  const items = Object.values(CONTAINER_CATEGORIES).map((category) => `
    <span class="container-marker-legend-item">
      <span
        class="container-pin container-pin--legend"
        style="--container-pin-color:${category.borderColor}"
        aria-hidden="true"
      ></span>
      ${escapeHtml(category.label)}
    </span>
  `).join('');

  container.innerHTML = `
    <summary>Containermarkers</summary>
    <div class="map-collapsible-body">
      ${items}
    </div>
  `;

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  return container;
};

containerMarkerLegendControl.addTo(map);
elements.containerMarkerLegend = document.getElementById('container-marker-legend');

containerEditorControl.onAdd = () => {
  const container = L.DomUtil.create('section', 'container-editor');
  container.id = 'container-editor';
  container.setAttribute('aria-label', 'Containerlocaties bewerken');

  container.innerHTML = `
    <button
      type="button"
      id="container-editor-toggle"
      class="container-editor-toggle"
      aria-label="Containereditor openen"
      aria-expanded="false"
      aria-controls="container-editor-panel"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      <span id="container-editor-badge" class="container-editor-badge" hidden>0</span>
    </button>
    <div id="container-editor-panel" class="container-editor-panel" hidden>
      <div class="container-editor-main">
        <div>
          <strong class="container-editor-title">Containerlocaties</strong>
          <span id="container-change-count" class="container-change-count">0 wijzigingen</span>
        </div>
        <div id="container-editor-status" class="container-editor-status" aria-live="polite">Houd een marker ingedrukt om te verplaatsen.</div>
      </div>
      <div id="container-change-list" class="container-change-list" hidden></div>
      <div id="container-edit-panel" class="container-edit-panel" hidden></div>
      <div class="container-editor-actions">
        <button type="button" id="add-container-button" class="editor-button">Nieuwe container</button>
        <button type="button" id="download-containers-button" class="editor-button editor-button-primary" disabled>Download JSON</button>
        <button type="button" id="reset-containers-button" class="editor-button" disabled>Reset</button>
      </div>
    </div>
  `;

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  return container;
};

containerEditorControl.addTo(map);
elements.containerEditor = document.getElementById('container-editor');
elements.containerEditorToggle = document.getElementById('container-editor-toggle');
elements.containerEditorBadge = document.getElementById('container-editor-badge');
elements.containerEditorPanel = document.getElementById('container-editor-panel');
elements.containerEditorStatus = document.getElementById('container-editor-status');
elements.containerChangeCount = document.getElementById('container-change-count');
elements.containerChangeList = document.getElementById('container-change-list');
elements.containerEditPanel = document.getElementById('container-edit-panel');
elements.addContainerButton = document.getElementById('add-container-button');
elements.downloadContainersButton = document.getElementById('download-containers-button');
elements.resetContainersButton = document.getElementById('reset-containers-button');

mapInfoControl.onAdd = () => {
  const container = L.DomUtil.create('div', 'map-info-stack');
  container.setAttribute('aria-label', 'Geselecteerde kaartinformatie');
  container.innerHTML = `
    <details class="map-collapsible container-map-info" hidden open></details>
    <details class="map-collapsible house-map-info" hidden open></details>
  `;

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  return container;
};

mapInfoControl.addTo(map);
elements.mapInfoStack = document.querySelector('.map-info-stack');
elements.containerMapInfo = document.querySelector('.container-map-info');
elements.houseMapInfo = document.querySelector('.house-map-info');

elements.containerMapInfo.addEventListener('toggle', () => {
  state.containerInfoCollapsed = !elements.containerMapInfo.open;
});

elements.houseMapInfo.addEventListener('toggle', () => {
  state.houseInfoCollapsed = !elements.houseMapInfo.open;
});
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

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (value) => value * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
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

function setDetailsOpen(element, isOpen) {
  if (element && 'open' in element) {
    element.open = isOpen;
  }
}

function formatPercent(count, total) {
  if (!Number.isFinite(total) || total <= 0) {
    return '0,0%';
  }

  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(count / total);
}

function buildSummaryStat(value, label, { total = 0, showPercent = false } = {}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const percent = showPercent
    ? `<span class="summary-percent">(${formatPercent(safeValue, total)})</span>`
    : '';

  return `
    <div class="summary-stat">
      <strong>${safeValue.toLocaleString('nl-NL')}${percent}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function collapseUiForActiveHouse() {
  setDetailsOpen(elements.coverageSummaryPanel, false);
  setDetailsOpen(elements.mapLegend, false);
  setDetailsOpen(elements.containerMarkerLegend, false);
}

function resetUiForIdleState() {
  setDetailsOpen(elements.coverageSummaryPanel, true);
  setDetailsOpen(elements.mapLegend, true);
  setDetailsOpen(elements.containerMarkerLegend, true);
}

async function loadJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} mislukt (${response.status}).`);
  }
  return response.json();
}

function cloneContainer(container) {
  const cloned = {
    id: container.id,
    address: container.address,
    lat: container.lat,
    lon: container.lon,
    accuracy: container.accuracy,
    type: normalizeContainerType(container.type)
  };

  if (hasExplicitContainerStatus(container)) {
    cloned.status = normalizeContainerStatus(container.status);
  }

  return cloned;
}

function cloneContainerForState(container, clientKey = createContainerClientKey()) {
  return {
    ...cloneContainer(container),
    clientKey
  };
}

function createContainerClientKey() {
  const key = `container-${state.nextContainerClientKey}`;
  state.nextContainerClientKey += 1;
  return key;
}

function syncContainerIndex() {
  state.containersById = new Map(state.containers.map((container) => [container.id, container]));
  state.containersByKey = new Map(state.containers.map((container) => [container.clientKey, container]));
}

function setOriginalContainers(containers) {
  state.nextContainerClientKey = 1;
  state.originalContainers = containers.map((container) => cloneContainerForState(container));
  state.originalContainersById = new Map(state.originalContainers.map((container) => [container.id, container]));
  state.originalContainersByKey = new Map(state.originalContainers.map((container) => [container.clientKey, container]));
}

function normalizeContainerCoordinate(value) {
  return roundCoordinate(value);
}

function normalizeContainerType(type) {
  return VALID_CONTAINER_TYPES.has(type) ? type : DEFAULT_CONTAINER_TYPE;
}

function formatContainerType(type) {
  return CONTAINER_TYPE_LABELS[normalizeContainerType(type)];
}

function hasExplicitContainerStatus(container) {
  return Object.prototype.hasOwnProperty.call(container, 'status')
    && container.status !== null
    && container.status !== undefined
    && String(container.status).trim() !== '';
}

function normalizeContainerStatus(status) {
  return VALID_CONTAINER_STATUSES.has(status) ? status : DEFAULT_CONTAINER_STATUS;
}

function getContainerStoredStatus(container) {
  return hasExplicitContainerStatus(container) ? normalizeContainerStatus(container.status) : null;
}

function getContainerCategory(container) {
  const type = normalizeContainerType(container.type);
  const rawStatus = hasExplicitContainerStatus(container)
    ? normalizeContainerStatus(container.status)
    : DEFAULT_CONTAINER_STATUS;
  const key = `${rawStatus}:${type}`;

  if (CONTAINER_CATEGORIES[key]) {
    return {
      type,
      status: rawStatus,
      ...CONTAINER_CATEGORIES[key]
    };
  }

  return {
    type,
    status: DEFAULT_CONTAINER_STATUS,
    ...CONTAINER_CATEGORIES[`${DEFAULT_CONTAINER_STATUS}:${type}`]
  };
}

function formatContainerCategory(container) {
  return getContainerCategory(container).label;
}

function getOriginalContainer(container) {
  return state.originalContainersByKey.get(container.clientKey) || null;
}

function getContainerByKey(containerKey) {
  return state.containersByKey.get(containerKey) || null;
}

function getContainerIndexByKey(containerKey) {
  return state.containers.findIndex((container) => container.clientKey === containerKey);
}

function hasContainerChanged(container) {
  const original = getOriginalContainer(container);

  if (!original) {
    return true;
  }

  return original.address !== container.address
    || original.id !== container.id
    || original.accuracy !== container.accuracy
    || getContainerStoredStatus(original) !== getContainerStoredStatus(container)
    || normalizeContainerType(original.type) !== normalizeContainerType(container.type)
    || normalizeContainerCoordinate(original.lat) !== normalizeContainerCoordinate(container.lat)
    || normalizeContainerCoordinate(original.lon) !== normalizeContainerCoordinate(container.lon);
}

function hasContainerLocationChanged(container) {
  const original = getOriginalContainer(container);
  if (!original) {
    return true;
  }

  return normalizeContainerCoordinate(original.lat) !== normalizeContainerCoordinate(container.lat)
    || normalizeContainerCoordinate(original.lon) !== normalizeContainerCoordinate(container.lon);
}

function hasContainerIdChanged(container) {
  const original = getOriginalContainer(container);
  return Boolean(original && original.id !== container.id);
}

function requiresLiveContainerRoute(container) {
  return !getOriginalContainer(container)
    || hasContainerIdChanged(container)
    || hasContainerLocationChanged(container);
}

function getChangedContainers() {
  return state.containers.filter(hasContainerChanged);
}

function getChangedContainerCount() {
  return getChangedContainers().length;
}

function getContainerChangeLabel(container) {
  const original = getOriginalContainer(container);
  if (!original) {
    return `${container.id} toegevoegd`;
  }

  const idChanged = original.id !== container.id;
  const locationChanged = hasContainerLocationChanged(container);
  const infoChanged = original.address !== container.address
    || getContainerStoredStatus(original) !== getContainerStoredStatus(container)
    || normalizeContainerType(original.type) !== normalizeContainerType(container.type);

  if (idChanged) {
    return `${original.id} -> ${container.id}`;
  }

  if (locationChanged && infoChanged) {
    return `${container.id} verplaatst + info`;
  }

  if (locationChanged) {
    return `${container.id} verplaatst`;
  }

  return `${container.id} info gewijzigd`;
}

function renderContainerChangeList() {
  if (!elements.containerChangeList) {
    return;
  }

  const changedContainers = getChangedContainers();
  if (changedContainers.length === 0) {
    elements.containerChangeList.hidden = true;
    elements.containerChangeList.innerHTML = '';
    return;
  }

  const visibleChanges = changedContainers.slice(0, CHANGED_CONTAINER_PREVIEW_LIMIT);
  const remainingCount = changedContainers.length - visibleChanges.length;
  const remainingText = remainingCount > 0
    ? `<li class="container-change-more">+ ${remainingCount} meer</li>`
    : '';

  elements.containerChangeList.hidden = false;
  elements.containerChangeList.innerHTML = `
    <ul>
      ${visibleChanges.map((container) => `<li>${escapeHtml(getContainerChangeLabel(container))}</li>`).join('')}
      ${remainingText}
    </ul>
  `;
}

function syncContainerEditorVisibility() {
  if (!elements.containerEditor) {
    return;
  }

  const isExpanded = state.containerEditorExpanded;
  const changedCount = getChangedContainerCount();

  elements.containerEditor.classList.toggle('expanded', isExpanded);
  elements.containerEditor.classList.toggle('collapsed', !isExpanded);

  if (elements.containerEditorPanel) {
    elements.containerEditorPanel.hidden = !isExpanded;
  }

  if (elements.containerEditorToggle) {
    elements.containerEditorToggle.setAttribute('aria-expanded', String(isExpanded));
    elements.containerEditorToggle.setAttribute(
      'aria-label',
      isExpanded ? 'Containereditor sluiten' : 'Containereditor openen'
    );
  }

  if (elements.containerEditorBadge) {
    elements.containerEditorBadge.hidden = changedCount === 0 || isExpanded;
    elements.containerEditorBadge.textContent = String(changedCount);
  }
}

function toggleContainerEditor() {
  state.containerEditorExpanded = !state.containerEditorExpanded;
  updateContainerEditorControls();
}

function setContainerEditorStatus(message, tone = '') {
  if (!elements.containerEditorStatus) {
    return;
  }

  elements.containerEditorStatus.textContent = message;
  elements.containerEditorStatus.className = tone
    ? `container-editor-status ${tone}`
    : 'container-editor-status';
}

function updateContainerEditorControls() {
  const changedCount = getChangedContainerCount();
  const hasChanges = changedCount > 0;

  if (elements.containerChangeCount) {
    const label = changedCount === 1 ? '1 wijziging' : `${changedCount} wijzigingen`;
    elements.containerChangeCount.textContent = label;
  }

  if (elements.downloadContainersButton) {
    elements.downloadContainersButton.disabled = !hasChanges;
  }

  if (elements.resetContainersButton) {
    elements.resetContainersButton.disabled = !hasChanges;
  }

  if (elements.addContainerButton) {
    elements.addContainerButton.classList.toggle('active', state.addContainerMode);
    elements.addContainerButton.setAttribute('aria-pressed', String(state.addContainerMode));
  }

  syncContainerEditorVisibility();
  renderContainerChangeList();
  renderContainerEditPanel();
}

function serializeContainersForDownload() {
  return state.containers.map(cloneContainer);
}

function downloadContainerLocations() {
  const payload = `${JSON.stringify(serializeContainersForDownload(), null, 2)}\n`;
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = 'container-locations.json';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setContainerEditorStatus('container-locations.json is klaargezet als download.', 'success');
}

function resetContainerLocations() {
  if (getChangedContainerCount() === 0) {
    return;
  }

  if (!window.confirm('Alle niet-gedownloade containerwijzigingen terugzetten?')) {
    return;
  }

  state.containers = state.originalContainers.map((container) => cloneContainerForState(container, container.clientKey));
  syncContainerIndex();
  state.liveRouteCache.clear();
  state.addContainerMode = false;
  state.pendingNewContainer = null;
  state.editingContainerKey = null;
  state.unlockedContainerKey = null;
  map.getContainer().classList.remove('adding-container');
  renderContainers();
  clearContainerSelection();
  refreshSelectedHouseLiveState();
  updateContainerEditorControls();
  setContainerEditorStatus('Containerlocaties zijn teruggezet naar de geladen JSON.', 'success');
}

function getNextContainerId() {
  for (let index = 1; index <= 99; index += 1) {
    const id = `WH${String(index).padStart(2, '0')}`;
    if (!state.containersById.has(id)) {
      return id;
    }
  }

  return 'WH99';
}

function getContainerTypeOptions(selectedType) {
  const normalizedType = normalizeContainerType(selectedType);
  return Object.entries(CONTAINER_TYPE_LABELS)
    .map(([value, label]) => `
      <option value="${escapeHtml(value)}"${value === normalizedType ? ' selected' : ''}>${escapeHtml(label)}</option>
    `)
    .join('');
}

function getContainerStatusOptions(selectedStatus) {
  const normalizedStatus = normalizeContainerStatus(selectedStatus);
  return Object.entries(CONTAINER_STATUS_LABELS)
    .map(([value, label]) => `
      <option value="${escapeHtml(value)}"${value === normalizedStatus ? ' selected' : ''}>${escapeHtml(label)}</option>
    `)
    .join('');
}

function getEditableContainer() {
  if (state.pendingNewContainer) {
    return state.pendingNewContainer;
  }

  return getContainerByKey(state.editingContainerKey || state.activeContainerKey);
}

function getContainerEditTitle(container) {
  return state.pendingNewContainer
    ? 'Nieuwe container'
    : `Container ${container.id}`;
}

function renderContainerEditPanel() {
  if (!elements.containerEditPanel) {
    return;
  }

  if (state.addContainerMode && !state.pendingNewContainer) {
    elements.containerEditPanel.hidden = true;
    elements.containerEditPanel.innerHTML = '';
    return;
  }

  const container = getEditableContainer();
  if (!container) {
    elements.containerEditPanel.hidden = true;
    elements.containerEditPanel.innerHTML = '';
    return;
  }

  const isNew = container === state.pendingNewContainer;
  const locationText = Number.isFinite(container.lat) && Number.isFinite(container.lon)
    ? `${container.lat.toFixed(6)}, ${container.lon.toFixed(6)}`
    : 'onbekend';

  elements.containerEditPanel.hidden = false;
  elements.containerEditPanel.innerHTML = `
    <form id="container-edit-form" class="container-edit-form" novalidate>
      <div class="container-edit-heading">
        <strong>${escapeHtml(getContainerEditTitle(container))}</strong>
        <span>${isNew ? 'Klikpositie' : 'Locatie'}: ${escapeHtml(locationText)}</span>
      </div>
      <label>
        <span>ID</span>
        <input name="id" value="${escapeHtml(container.id)}" autocomplete="off" required />
      </label>
      <label>
        <span>Adres of omschrijving</span>
        <input name="address" value="${escapeHtml(container.address)}" autocomplete="off" required />
      </label>
      <label>
        <span>Type afvalcontainer</span>
        <select name="type" required>
          ${getContainerTypeOptions(container.type)}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select name="status" required>
          ${getContainerStatusOptions(container.status)}
        </select>
      </label>
      <div id="container-edit-error" class="container-edit-error" role="alert" hidden></div>
      <div class="container-edit-actions">
        <button type="submit" class="editor-button editor-button-primary">Opslaan</button>
        <button type="button" id="cancel-container-edit-button" class="editor-button">Annuleren</button>
      </div>
    </form>
  `;

  const form = document.getElementById('container-edit-form');
  const cancelButton = document.getElementById('cancel-container-edit-button');
  form?.addEventListener('submit', handleContainerEditSubmit);
  cancelButton?.addEventListener('click', cancelContainerEdit);
}

function setContainerEditError(message) {
  const errorElement = document.getElementById('container-edit-error');
  if (!errorElement) {
    return;
  }

  errorElement.hidden = !message;
  errorElement.textContent = message || '';
}

function readContainerEditForm(form) {
  const formData = new FormData(form);
  return {
    id: String(formData.get('id') || '').trim().toUpperCase(),
    address: String(formData.get('address') || '').trim(),
    type: String(formData.get('type') || '').trim(),
    status: String(formData.get('status') || '').trim()
  };
}

function validateContainerEditForm(values, currentContainerKey = null) {
  if (!CONTAINER_ID_PATTERN.test(values.id)) {
    return 'Gebruik een id in de vorm WHNN, bijvoorbeeld WH33.';
  }

  const duplicate = state.containers.find((container) => (
    container.id === values.id && container.clientKey !== currentContainerKey
  ));
  if (duplicate) {
    return `Container ${values.id} bestaat al.`;
  }

  if (!values.address) {
    return 'Vul een adres of omschrijving in.';
  }

  if (!VALID_CONTAINER_TYPES.has(values.type)) {
    return 'Kies een geldig containertype.';
  }

  if (!VALID_CONTAINER_STATUSES.has(values.status)) {
    return 'Kies een geldige containerstatus.';
  }

  if (!CONTAINER_CATEGORIES[`${values.status}:${values.type}`]) {
    return 'Deze combinatie van status en type wordt niet ondersteund.';
  }

  return '';
}

function cancelContainerEdit() {
  if (state.pendingNewContainer) {
    state.pendingNewContainer = null;
    state.addContainerMode = false;
    map.getContainer().classList.remove('adding-container');
    setContainerEditorStatus('Nieuwe container toevoegen is geannuleerd.');
  } else {
    setContainerEditorStatus('Bewerking is geannuleerd.');
  }

  updateContainerEditorControls();
}

function handleContainerEditSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const values = readContainerEditForm(form);
  const container = getEditableContainer();
  const currentKey = state.pendingNewContainer ? null : container?.clientKey;
  const error = validateContainerEditForm(values, currentKey);

  if (error) {
    setContainerEditError(error);
    return;
  }

  if (state.pendingNewContainer) {
    saveNewContainer(values);
    return;
  }

  if (container) {
    saveContainerMetadata(container, values);
  }
}

function saveNewContainer(values) {
  const container = cloneContainerForState({
    ...state.pendingNewContainer,
    ...values
  }, state.pendingNewContainer.clientKey);

  state.containers.push(container);
  syncContainerIndex();
  state.pendingNewContainer = null;
  state.addContainerMode = false;
  state.activeContainerIndex = state.containers.length - 1;
  state.activeContainerKey = container.clientKey;
  state.editingContainerKey = container.clientKey;
  state.liveRouteCache.clear();
  map.getContainer().classList.remove('adding-container');
  renderContainers();
  showCoverageCircle(container);
  renderContainerMapInfo(container);
  map.panTo([container.lat, container.lon], { animate: true });
  refreshSelectedHouseLiveState();
  setContainerEditorStatus(`Container ${container.id} is toegevoegd. Download de JSON om de wijziging te bewaren.`, 'success');
}

function saveContainerMetadata(container, values) {
  const previousId = container.id;

  container.id = values.id;
  container.address = values.address;
  container.type = values.type;
  container.status = values.status;
  syncContainerIndex();

  if (previousId !== container.id) {
    state.liveRouteCache.clear();
  }

  renderContainers();
  refreshSelectedHouseLiveState();
  setContainerEditorStatus(`Container ${container.id} is bijgewerkt. Download de JSON om de wijziging te bewaren.`, 'success');
}

function setAddContainerMode(isActive, message = null) {
  state.addContainerMode = isActive;
  map.getContainer().classList.toggle('adding-container', isActive);
  updateContainerEditorControls();

  if (message) {
    setContainerEditorStatus(message, isActive ? 'active' : '');
  }
}

function beginAddContainerMode() {
  lockUnlockedContainer();
  state.pendingNewContainer = null;
  state.editingContainerKey = null;
  const nextMode = !state.addContainerMode;
  setAddContainerMode(
    nextMode,
    nextMode
      ? 'Klik op de kaart om de nieuwe containerpositie te kiezen.'
      : 'Nieuwe container toevoegen is geannuleerd.'
  );
}

function addContainerAtLatLng(latlng) {
  state.pendingNewContainer = cloneContainerForState({
    id: getNextContainerId(),
    address: '',
    lat: normalizeContainerCoordinate(latlng.lat),
    lon: normalizeContainerCoordinate(latlng.lng),
    accuracy: MANUAL_CONTAINER_ACCURACY,
    type: DEFAULT_CONTAINER_TYPE
  });
  setAddContainerMode(false);
  updateContainerEditorControls();
  setContainerEditorStatus('Vul de gegevens voor de nieuwe container in.', 'active');
}

function handleMapClick(event) {
  if (state.addContainerMode) {
    addContainerAtLatLng(event.latlng);
    return;
  }

  if (state.activeContainerIndex !== null) {
    clearContainerSelection();
  }
}

function applyContainerMove(containerId, latlng) {
  const container = state.containersById.get(containerId);
  if (!container) {
    return;
  }

  container.lat = normalizeContainerCoordinate(latlng.lat);
  container.lon = normalizeContainerCoordinate(latlng.lng);
  container.accuracy = MANUAL_CONTAINER_ACCURACY;
  syncContainerIndex();
  renderContainers();
  const index = getContainerIndexById(container.id);
  if (state.activeContainerKey === container.clientKey || state.activeContainerIndex === index) {
    showCoverageCircle(container);
  }

  refreshSelectedHouseLiveState();
  setContainerEditorStatus(`Container ${container.id} is verplaatst. Download de JSON om de wijziging te bewaren.`, 'success');
}

function renderContainers({ fitBounds = false } = {}) {
  addContainerMarkers({ fitBounds });
  addContainerList();
  renderContainerMapInfo(state.activeContainerIndex !== null ? state.containers[state.activeContainerIndex] : null);
  updateContainerEditorControls();
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
  const totalAddresses = Number.isFinite(summary.totalAddresses)
    ? summary.totalAddresses
    : state.houses.length;
  const containerCount = Number.isFinite(summary.containerCount)
    ? summary.containerCount
    : state.containers.length;

  const distanceStats = SUMMARY_DISTANCE_ROWS
    .map(({ key, label }) => buildSummaryStat(counts[key] || 0, label, {
      total: totalAddresses,
      showPercent: true
    }))
    .join('');

  elements.coverageSummary.hidden = false;
  elements.coverageSummary.innerHTML = `
    ${buildSummaryStat(totalAddresses, 'adressen')}
    ${buildSummaryStat(containerCount, 'containers')}
    ${distanceStats}
    <div class="summary-meta">
      Gegenereerd: ${escapeHtml(formatTimestamp(state.coverage?.generatedAt))}
    </div>
  `;
}

function shouldIgnoreStoredContainerId(containerId) {
  const container = state.containersById.get(containerId);
  return !container || requiresLiveContainerRoute(container);
}

function mergeStoredContainerEntry(entry) {
  const currentContainer = state.containersById.get(entry.id);
  return {
    ...entry,
    ...(currentContainer ? {
      id: currentContainer.id,
      address: currentContainer.address,
      accuracy: currentContainer.accuracy,
      type: currentContainer.type,
      ...(hasExplicitContainerStatus(currentContainer) ? { status: currentContainer.status } : {}),
      lat: currentContainer.lat,
      lon: currentContainer.lon,
      clientKey: currentContainer.clientKey
    } : {}),
    routeSource: 'stored'
  };
}

function getStoredRanking(house) {
  if (Array.isArray(house.nearestContainers) && house.nearestContainers.length > 0) {
    return house.nearestContainers
      .filter((entry) => !shouldIgnoreStoredContainerId(entry.id))
      .map(mergeStoredContainerEntry);
  }

  if (!house.nearestContainerId || shouldIgnoreStoredContainerId(house.nearestContainerId)) {
    return [];
  }

  return [mergeStoredContainerEntry({
    id: house.nearestContainerId,
    address: house.nearestContainerAddress,
    accuracy: house.nearestContainerAccuracy,
    straightDistance: house.straightDistance,
    walkingDistance: house.walkingDistance,
    walkingDuration: house.walkingDuration,
    coverageStatus: house.coverageStatus
  })];
}

function buildLiveContainerRankingEntry(house, container, liveRoute) {
  const straightDistance = haversineMeters(house.lat, house.lon, container.lat, container.lon);
  const walkingDistance = roundMetric(liveRoute.walkingDistance);

  return {
    id: container.id,
    address: container.address,
    accuracy: container.accuracy,
    type: container.type,
    ...(hasExplicitContainerStatus(container) ? { status: container.status } : {}),
    lat: container.lat,
    lon: container.lon,
    clientKey: container.clientKey,
    straightDistance: roundMetric(straightDistance),
    walkingDistance,
    walkingDuration: roundMetric(liveRoute.walkingDuration),
    coverageStatus: getDistanceStatus(walkingDistance),
    routeGeometry: liveRoute.routeGeometry || [],
    routeError: null,
    routeSource: 'live'
  };
}

function getLiveEditedRankingEntries(house) {
  return getChangedContainers()
    .filter(requiresLiveContainerRoute)
    .map((container) => {
      const liveRoute = getLiveRouteState(house, container);
      if (liveRoute?.status !== 'fulfilled') {
        return null;
      }

      return buildLiveContainerRankingEntry(house, container, liveRoute);
    })
    .filter(Boolean);
}

function sortRankingByWalkingDistance(ranking) {
  return ranking.sort((left, right) => {
    const leftDistance = Number.isFinite(left.walkingDistance) ? left.walkingDistance : Number.POSITIVE_INFINITY;
    const rightDistance = Number.isFinite(right.walkingDistance) ? right.walkingDistance : Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  });
}

function getCurrentRanking(house) {
  return sortRankingByWalkingDistance([
    ...getStoredRanking(house),
    ...getLiveEditedRankingEntries(house)
  ]);
}

function getHouseCoverageStatus(house, ranking) {
  return ranking[0]?.coverageStatus || house.coverageStatus;
}

function renderContainerMapInfo(container) {
  if (!elements.containerMapInfo) {
    return;
  }

  if (!container) {
    elements.containerMapInfo.hidden = true;
    elements.containerMapInfo.innerHTML = '';
    elements.containerMapInfo.style.removeProperty('--container-category-color');
    return;
  }

  const category = getContainerCategory(container);
  elements.containerMapInfo.hidden = false;
  elements.containerMapInfo.open = !state.containerInfoCollapsed;
  elements.containerMapInfo.style.setProperty('--container-category-color', category.borderColor);
  elements.containerMapInfo.innerHTML = `
    <summary>
      <span class="container-map-info-title">Container ${escapeHtml(container.id)}</span>
    </summary>

    <div class="map-collapsible-body">
      <div class="container-map-info-address">${escapeHtml(container.address)}, Warmenhuizen</div>
      <div class="container-map-info-meta">
        <span class="container-category-pill">
          <span class="container-category-swatch" aria-hidden="true"></span>
          ${escapeHtml(category.label)}
        </span>
      </div>
      <div class="container-map-info-meta">Nauwkeurigheid: ${escapeHtml(container.accuracy)}</div>
    </div>
  `;
}

function createContainerMarkerIcon(container, isActive = false) {
  const category = getContainerCategory(container);

  return L.divIcon({
    className: `container-marker-icon-wrapper${isActive ? ' container-marker-active' : ''}`,
    html: `
      <span
        class="container-pin"
        style="--container-pin-color:${category.borderColor}"
        aria-hidden="true"
      ></span>
    `,
    iconSize: [56, 58],
    iconAnchor: [28, 55],
    popupAnchor: [0, -50]
  });
}

function scrollMapIntoView() {
  if (!elements.mapShell) {
    return;
  }

  if (typeof window.matchMedia === 'function' && !window.matchMedia(MOBILE_MAP_SCROLL_QUERY).matches) {
    return;
  }

  elements.mapShell.scrollIntoView({
    block: 'start',
    behavior: 'smooth'
  });
}

function getContainerIndexById(containerId) {
  return state.containers.findIndex((container) => container.id === containerId);
}

function getContainerMarkerById(containerId) {
  const index = getContainerIndexById(containerId);
  return index >= 0 ? state.containerMarkers[index] : null;
}

function getContainerMarkerByKey(containerKey) {
  const index = getContainerIndexByKey(containerKey);
  return index >= 0 ? state.containerMarkers[index] : null;
}

function suppressContainerClick() {
  state.suppressContainerClickUntil = Date.now() + 800;
}

function shouldSuppressContainerClick() {
  return Date.now() < state.suppressContainerClickUntil;
}

function lockUnlockedContainer(exceptContainerKey = null) {
  if (!state.unlockedContainerKey || state.unlockedContainerKey === exceptContainerKey) {
    return;
  }

  const marker = getContainerMarkerByKey(state.unlockedContainerKey);
  if (marker?.dragging) {
    marker.dragging.disable();
  }

  marker?.getElement()?.classList.remove('container-marker-unlocked');
  state.unlockedContainerKey = null;
}

function unlockContainerMarker(marker, container) {
  lockUnlockedContainer(container.clientKey);
  state.unlockedContainerKey = container.clientKey;
  suppressContainerClick();

  if (marker.dragging) {
    marker.dragging.enable();
  }

  marker.getElement()?.classList.add('container-marker-unlocked');
  setContainerEditorStatus(`Container ${container.id} is ontgrendeld. Sleep de marker naar de nieuwe locatie.`, 'active');
}

function handleContainerDragEnd(marker, container) {
  suppressContainerClick();

  const previousLatLng = state.containerDragStart?.key === container.clientKey
    ? state.containerDragStart.latLng
    : L.latLng(container.lat, container.lon);
  const nextLatLng = marker.getLatLng();

  state.containerDragStart = null;

  const previousLat = normalizeContainerCoordinate(previousLatLng.lat);
  const previousLon = normalizeContainerCoordinate(previousLatLng.lng);
  const nextLat = normalizeContainerCoordinate(nextLatLng.lat);
  const nextLon = normalizeContainerCoordinate(nextLatLng.lng);

  if (previousLat === nextLat && previousLon === nextLon) {
    lockUnlockedContainer();
    setContainerEditorStatus('Containerpositie is niet gewijzigd.');
    return;
  }

  const confirmed = window.confirm(
    `Container ${container.id} verplaatsen naar ${nextLat.toFixed(6)}, ${nextLon.toFixed(6)}?`
  );

  if (!confirmed) {
    marker.setLatLng(previousLatLng);
    lockUnlockedContainer();
    setContainerEditorStatus(`Verplaatsing van container ${container.id} is geannuleerd.`);
    return;
  }

  lockUnlockedContainer();
  applyContainerMove(container.id, nextLatLng);
}

function attachContainerMarkerEditing(marker, container) {
  let longPressTimer = null;

  function clearLongPressTimer() {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function startLongPressTimer() {
    if (state.addContainerMode) {
      return;
    }

    clearLongPressTimer();
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      unlockContainerMarker(marker, container);
    }, CONTAINER_LONG_PRESS_MS);
  }

  marker.on('mousedown touchstart', startLongPressTimer);
  marker.on('mouseup mouseout touchend touchcancel', clearLongPressTimer);
  marker.on('dragstart', () => {
    clearLongPressTimer();

    if (state.unlockedContainerKey !== container.clientKey) {
      return;
    }

    state.containerDragStart = {
      key: container.clientKey,
      latLng: marker.getLatLng()
    };
    setContainerEditorStatus(`Container ${container.id} wordt verplaatst...`, 'active');
  });
  marker.on('dragend', () => handleContainerDragEnd(marker, container));
}

function addContainerMarkers({ fitBounds = false } = {}) {
  const bounds = [];
  containerLayer.clearLayers();
  state.containerMarkers = [];

  state.containers.forEach((container, index) => {
    const marker = L.marker([container.lat, container.lon], {
      draggable: true,
      autoPan: true,
      riseOnHover: true,
      icon: createContainerMarkerIcon(container, state.activeContainerIndex === index),
      title: `${container.id} - ${container.address}`
    })
      .on('click', () => {
        if (state.addContainerMode || shouldSuppressContainerClick()) {
          return;
        }

        selectContainer(index, { focusMap: false });
      });

    marker.addTo(containerLayer);
    marker.dragging.disable();
    attachContainerMarkerEditing(marker, container);
    state.containerMarkers.push(marker);
    bounds.push([container.lat, container.lon]);
  });

  if (fitBounds && bounds.length > 0) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: INITIAL_CONTAINER_BOUNDS_MAX_ZOOM });
    map.setZoom(Math.min(map.getZoom() + INITIAL_ZOOM_OFFSET, MAP_MAX_ZOOM));
  }
}

function addContainerList() {
  elements.containerList.innerHTML = '';
  state.containerButtons = [];

  state.containers.forEach((container, index) => {
    const isChanged = hasContainerChanged(container);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isChanged ? 'container-item changed' : 'container-item';
    button.innerHTML = `
      <div>
        <span class="container-code">${escapeHtml(container.id)}</span>
        <span class="container-address">${escapeHtml(container.address)}</span>
      </div>
      <div class="container-meta">
        ${escapeHtml(formatContainerCategory(container))} · Nauwkeurigheid: ${escapeHtml(container.accuracy)}
        ${isChanged ? '<span class="container-change-label">gewijzigd</span>' : ''}
      </div>
    `;
    button.addEventListener('click', () => selectContainer(index, { focusMap: true, scrollToMap: true }));
    state.containerButtons.push(button);
    elements.containerList.appendChild(button);
  });

  if (state.activeContainerIndex !== null && state.containerButtons[state.activeContainerIndex]) {
    state.containerButtons[state.activeContainerIndex].classList.add('active');
  }
}

function updateActiveContainer(index) {
  if (state.activeContainerIndex !== null && state.containerMarkers[state.activeContainerIndex]) {
    state.containerMarkers[state.activeContainerIndex].getElement()?.classList.remove('container-marker-active');
  }

  if (state.activeContainerIndex !== null && state.containerButtons[state.activeContainerIndex]) {
    state.containerButtons[state.activeContainerIndex].classList.remove('active');
  }

  state.activeContainerIndex = index;
  state.activeContainerKey = index !== null ? state.containers[index]?.clientKey || null : null;
  state.editingContainerKey = state.activeContainerKey;

  if (index !== null && state.containerButtons[index]) {
    state.containerButtons[index].classList.add('active');
  }

  if (index !== null && state.containerMarkers[index]) {
    state.containerMarkers[index].getElement()?.classList.add('container-marker-active');
  }

  updateContainerEditorControls();
}

function clearCoverageCircle() {
  if (state.coverageCircle) {
    map.removeLayer(state.coverageCircle);
    state.coverageCircle = null;
  }
}

function clearContainerSelection() {
  clearCoverageCircle();
  renderContainerMapInfo(null);
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

function selectContainer(index, { focusMap = true, scrollToMap = false } = {}) {
  const container = state.containers[index];
  if (!container) {
    return;
  }

  state.pendingNewContainer = null;
  state.addContainerMode = false;
  map.getContainer().classList.remove('adding-container');
  showCoverageCircle(container);
  updateActiveContainer(index);
  renderContainerMapInfo(container);

  if (focusMap && state.coverageCircle) {
    map.fitBounds(state.coverageCircle.getBounds(), { padding: [32, 32], maxZoom: 17 });
  }

  if (scrollToMap) {
    scrollMapIntoView();
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
  resetUiForIdleState();

  elements.houseSummary.hidden = true;
  elements.houseSummary.innerHTML = '';

  elements.houseDetails.hidden = false;
  elements.houseDetails.innerHTML = '<div class="empty-state">Klik op een huispunt of zoek je adres om de dekking en routes te bekijken.</div>';

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

function renderHouseSummary(house, ranking) {
  const postcode = house.postcode ? `${house.postcode} ` : '';
  const coverageStatus = getHouseCoverageStatus(house, ranking);

  elements.houseSummary.hidden = false;
  elements.houseSummary.open = true;

  elements.houseSummary.innerHTML = `
    <summary>
      <span class="house-summary-heading">
        <span class="house-summary-title">Geselecteerd adres</span>
        <span class="house-address">${escapeHtml(house.address)}</span>
        <span class="house-meta">${escapeHtml(postcode)}${escapeHtml(house.city || 'Warmenhuizen')}</span>
      </span>
      ${buildStatusBadge(coverageStatus)}
    </summary>

    <div class="sidebar-collapsible-body selected-house-body">
      ${buildMainResultCard(house, ranking)}
      ${buildAlternativeContainersMarkup(ranking)}
      ${buildMeasurementDetails(house, ranking)}
    </div>
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

function getContainerRouteLocationKey(container) {
  const currentContainer = getCurrentContainer(container);
  const lat = normalizeContainerCoordinate(currentContainer.lat);
  const lon = normalizeContainerCoordinate(currentContainer.lon);
  return `${currentContainer.id}:${lat},${lon}`;
}

function getLiveRouteKey(house, container) {
  const houseKey = house.id || `${normalizeContainerCoordinate(house.lat)},${normalizeContainerCoordinate(house.lon)}`;
  return `${houseKey}:${getContainerRouteLocationKey(container)}`;
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
  if (container.routeSource === 'live' && hasRouteGeometry(container)) {
    return {
      label: 'live na handmatige locatie',
      details: `${formatMeters(container.walkingDistance)} - ${formatDuration(container.walkingDuration)}`
    };
  }

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

function buildMainResultCard(house, ranking) {
  const nearest = ranking[0] || null;

  const walkingDistance = nearest?.walkingDistance ?? house.walkingDistance;
  const walkingDuration = nearest?.walkingDuration ?? house.walkingDuration;
  const straightDistance = nearest?.straightDistance ?? house.straightDistance;
  const coverageStatus = nearest?.coverageStatus ?? house.coverageStatus;

  const containerText = nearest
    ? `<strong>${escapeHtml(nearest.id)}</strong> - ${escapeHtml(nearest.address || 'onbekend adres')}`
    : 'Geen gekoppelde container';

  const resultColor = getCoverageStatus(coverageStatus).color;

  return `
    <section class="selected-result-card" style="--result-color:${resultColor}" aria-label="Belangrijkste resultaat">
      <span class="selected-result-kicker">Dichtstbijzijnde container</span>

      <div class="selected-result-distance">
        ${escapeHtml(formatMeters(walkingDistance))}
        <span>- ${escapeHtml(formatDuration(walkingDuration))}</span>
      </div>

      <div class="selected-result-destination">
        naar ${containerText}
      </div>

      <div class="selected-result-sub">
        Hemelsbreed: ${escapeHtml(formatMeters(straightDistance))}
      </div>
    </section>
  `;
}

function buildAlternativeContainersMarkup(ranking) {
  const alternatives = ranking.slice(1, 3);

  if (alternatives.length === 0) {
    return '';
  }

  return `
    <section class="detail-section">
      <h3 class="detail-section-title">Andere containers in de buurt</h3>

      <div class="ranking-list ranking-list-compact">
        ${alternatives.map((container, index) => {
          const rank = index + 2;
          const color = getWalkingDistanceColor(container.walkingDistance);

          return `
            <div class="ranking-item">
              <span class="ranking-rank" style="--rank-color:${color}">${rank}</span>
              <div>
                <div class="ranking-title">
                  <strong>${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}
                </div>
                <div class="ranking-meta">
                  ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}
                  · hemelsbreed ${escapeHtml(formatMeters(container.straightDistance))}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function buildMeasurementRow(label, value) {
  return `
    <div class="measurement-row">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function buildMeasurementDetails(house, ranking) {
  const nearest = ranking[0] || null;
  const routeDisplay = nearest ? getRouteDisplay(house, nearest) : null;

  const nearestText = nearest
    ? `${escapeHtml(nearest.id)} - ${escapeHtml(nearest.address || 'onbekend adres')}`
    : 'Geen gekoppelde container';

  const routeText = routeDisplay
    ? `${escapeHtml(routeDisplay.label)}${routeDisplay.details ? ` (${escapeHtml(routeDisplay.details)})` : ''}`
    : 'Geen routegegevens';

  const analysisError = house.analysisError
    ? buildMeasurementRow('Opmerking', escapeHtml(house.analysisError))
    : '';

  return `
    <details class="measurement-details">
      <summary>Meetdetails en nauwkeurigheid</summary>

      <div class="measurement-list">
        ${buildMeasurementRow('Nauwkeurigheid locatie', escapeHtml(nearest?.accuracy || 'onbekend'))}
        ${buildMeasurementRow('Routegegevens', routeText)}
        ${analysisError}
      </div>
    </details>
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

    if (container.routeSource === 'live' && hasRouteGeometry(container)) {
      routeGeometry = container.routeGeometry;
      isLiveRoute = true;
      routeCounts.live += 1;
    } else if (hasRouteGeometry(container)) {
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
  elements.houseMapInfo.open = !state.houseInfoCollapsed;
  elements.houseMapInfo.innerHTML = `
    <summary>
      <span class="house-map-info-address">${escapeHtml(house.address)}</span>
    </summary>

    <div class="map-collapsible-body">
      <div class="house-map-info-meta">${escapeHtml(postcode)}${escapeHtml(house.city || 'Warmenhuizen')}</div>
      ${buildCompactRankingMarkup(ranking)}
    </div>
  `;
}

function renderSelectedHouseMarker(house, coverageStatus) {
  selectionLayer.clearLayers();

  if (!Number.isFinite(house.lat) || !Number.isFinite(house.lon)) {
    state.selectedHouseMarker = null;
    return;
  }

  const selectedHouseColor = getCoverageStatus(coverageStatus).color;
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
}

function getChangedContainerLiveRouteStatus(house) {
  const status = {
    fulfilled: 0,
    pending: 0,
    missing: 0,
    failed: 0
  };

  for (const container of getChangedContainers().filter(requiresLiveContainerRoute)) {
    if (!canFetchLiveRoute(house, container)) {
      status.failed += 1;
      continue;
    }

    const liveRoute = getLiveRouteState(house, container);
    if (!liveRoute) {
      status.missing += 1;
    } else if (liveRoute.status === 'fulfilled') {
      status.fulfilled += 1;
    } else if (liveRoute.status === 'pending') {
      status.pending += 1;
    } else {
      status.failed += 1;
    }
  }

  return status;
}

function renderHouseSelection(house, ranking) {
  renderSelectedHouseMarker(house, getHouseCoverageStatus(house, ranking));
  renderHouseSummary(house, ranking);
  renderHouseMapInfo(house, ranking);

  const routeCounts = drawRoutes(house, ranking);
  const changedRouteStatus = getChangedContainerLiveRouteStatus(house);
  const changedRouteWaiting = changedRouteStatus.pending + changedRouteStatus.missing;

  elements.houseDetails.hidden = true;
  elements.houseDetails.innerHTML = '';

  highlightRanking(ranking);

  if (routeCounts.pending > 0 || changedRouteWaiting > 0) {
    setCoverageStatus('Adres geselecteerd: de looproutes worden geladen.', 'loading');
    return routeCounts;
  }

  if (routeCounts.drawn > 0) {
    const routeText = routeCounts.drawn === 1
      ? '1 looproute is zichtbaar'
      : `${routeCounts.drawn} looproutes zijn zichtbaar`;

    if (changedRouteStatus.failed > 0) {
      setCoverageStatus(
        `Adres geselecteerd: ${routeText} op de kaart. ${changedRouteStatus.failed} live afstand(en) konden niet worden opgehaald.`,
        'error'
      );
      return routeCounts;
    }

    setCoverageStatus(`Adres geselecteerd: ${routeText} op de kaart.`, 'success');
    return routeCounts;
  }

  if (routeCounts.failed > 0 || changedRouteStatus.failed > 0) {
    setCoverageStatus('Adres geselecteerd, maar de looproutes konden niet worden getoond.', 'error');
    return routeCounts;
  }

  setCoverageStatus('Adres geselecteerd, maar voor dit adres zijn nog geen routegegevens beschikbaar.', 'error');
  return routeCounts;
}

function getLiveRouteRequests(house, ranking) {
  const requests = new Map();

  function addRequest(container) {
    if (!canFetchLiveRoute(house, container)) {
      return;
    }

    const liveRoute = getLiveRouteState(house, container);
    if (liveRoute?.status === 'fulfilled' || liveRoute?.status === 'rejected') {
      return;
    }

    requests.set(getLiveRouteKey(house, container), getCurrentContainer(container));
  }

  for (const container of getChangedContainers().filter(requiresLiveContainerRoute)) {
    addRequest(container);
  }

  for (const container of ranking) {
    if (!hasRouteGeometry(container)) {
      addRequest(container);
    }
  }

  return Array.from(requests.values());
}

function loadMissingLiveRoutes(house, selectionId) {
  const requests = getLiveRouteRequests(house, getCurrentRanking(house));

  if (requests.length === 0) {
    return;
  }

  for (const container of requests) {
    loadLiveRoute(house, container).then(() => {
      if (state.houseSelectionId !== selectionId || state.selectedHouse?.id !== house.id) {
        return;
      }

      renderHouseSelection(house, getCurrentRanking(house));
    });
  }

  renderHouseSelection(house, getCurrentRanking(house));
}

function focusHouseOnMap(house) {
  if (!Number.isFinite(house.lat) || !Number.isFinite(house.lon)) {
    return;
  }

  map.setView(
    [house.lat, house.lon],
    Math.max(map.getZoom(), SEARCH_FOCUS_ZOOM),
    { animate: true }
  );
}

function refreshSelectedHouseLiveState() {
  if (!state.selectedHouse) {
    return;
  }

  state.houseSelectionId += 1;
  const selectionId = state.houseSelectionId;
  const ranking = getCurrentRanking(state.selectedHouse);
  renderHouseSelection(state.selectedHouse, ranking);
  loadMissingLiveRoutes(state.selectedHouse, selectionId);
}

function selectHouse(house, { focusMap = true } = {}) {
  const isNewHouse = state.selectedHouse?.id !== house.id;

  state.selectedHouse = house;
  state.houseSelectionId += 1;

  if (isNewHouse) {
    state.houseInfoCollapsed = false;
  }

  collapseUiForActiveHouse();

  const selectionId = state.houseSelectionId;
  resetHouseSelectionVisuals();
  setHouseLayerMuted(false);

  const ranking = getCurrentRanking(house);

  renderHouseSelection(house, ranking);
  loadMissingLiveRoutes(house, selectionId);

  if (focusMap) {
    focusHouseOnMap(house);
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

  const searchRoot = input.closest('.search-panel') || input;

  const fuse = new Fuse(state.houses, {
    keys: ['address', 'postcode'],
    includeScore: true,
    threshold: 0.3
  });

  let matches = [];
  let activeIndex = -1;

  function getQuery() {
    return input.value.trim();
  }

  function getResultId(index) {
    return `search-result-${index}`;
  }

  function setExpanded(isExpanded) {
    input.setAttribute('aria-expanded', String(isExpanded));
  }

  function clearActiveResult() {
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
  }

  function closeResults() {
    matches = [];
    resultsDiv.innerHTML = '';
    clearActiveResult();
    setExpanded(false);
  }

  function setActiveIndex(nextIndex) {
    if (matches.length === 0) {
      clearActiveResult();
      return;
    }

    activeIndex = (nextIndex + matches.length) % matches.length;

    const buttons = resultsDiv.querySelectorAll('.search-result');

    buttons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    const activeButton = buttons[activeIndex];

    if (activeButton) {
      input.setAttribute('aria-activedescendant', activeButton.id);
      activeButton.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectMatch(index = activeIndex) {
    const match = matches[index];

    if (!match) {
      return;
    }

    const house = match.item;

    selectHouse(house, { focusMap: true });
    input.value = house.address;
    closeResults();
  }

  function renderEmptyResult() {
    resultsDiv.innerHTML = '<div class="search-empty" role="status">Geen adres gevonden.</div>';
    clearActiveResult();
    setExpanded(true);
  }

  function createResultButton(result, index) {
    const house = result.item;
    const postcode = house.postcode ? `${house.postcode} ` : '';
    const city = house.city || 'Warmenhuizen';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = getResultId(index);
    button.className = 'search-result';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;

    button.innerHTML = `
      <span class="search-result-address">${escapeHtml(house.address)}</span>
      <span class="search-result-meta">${escapeHtml(postcode)}${escapeHtml(city)}</span>
    `;

    button.addEventListener('pointerenter', () => setActiveIndex(index));
    button.addEventListener('click', () => selectMatch(index));

    return button;
  }

  function renderResults() {
    const query = getQuery();

    resultsDiv.innerHTML = '';
    matches = [];
    clearActiveResult();

    if (query.length < SEARCH_MIN_QUERY_LENGTH) {
      setExpanded(false);
      return;
    }

    matches = fuse.search(query).slice(0, SEARCH_RESULT_LIMIT);

    if (matches.length === 0) {
      renderEmptyResult();
      return;
    }

    const fragment = document.createDocumentFragment();

    matches.forEach((result, index) => {
      fragment.appendChild(createResultButton(result, index));
    });

    resultsDiv.appendChild(fragment);
    setExpanded(true);
    setActiveIndex(0);
  }

  function handleSearchKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (matches.length === 0) {
        renderResults();
      }

      setActiveIndex(activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (matches.length === 0) {
        renderResults();
      }

      setActiveIndex(activeIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
      if (matches.length > 0 && activeIndex >= 0) {
        event.preventDefault();
        selectMatch();
      }

      return;
    }

    if (event.key === 'Escape') {
      closeResults();
    }
  }

  input.addEventListener('input', renderResults);
  input.addEventListener('focus', () => {
    if (getQuery()) {
      renderResults();
    }
  });
  input.addEventListener('keydown', handleSearchKeydown);

  document.addEventListener('pointerdown', (event) => {
    if (!searchRoot.contains(event.target)) {
      closeResults();
    }
  });
}

async function init() {
  try {
    const [containers, coverage] = await Promise.all([
      loadJson('./data/container-locations.json', 'Containerdataset laden'),
      loadJson('./data/house-coverage.json', 'Huizenlaag laden')
    ]);

    const loadedContainers = Array.isArray(containers) ? containers : [];
    setOriginalContainers(loadedContainers);
    state.containers = state.originalContainers.map((container) => cloneContainerForState(container, container.clientKey));
    state.coverage = coverage && typeof coverage === 'object' ? coverage : null;
    state.houses = Array.isArray(state.coverage?.houses) ? state.coverage.houses : [];
    syncContainerIndex();

    renderContainers({ fitBounds: true });
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
  elements.houseDetails.hidden = false;
  elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
  setCoverageStatus(error.message || 'De viewer kon de batchlaag niet laden.', 'error');
}
}

map.on('zoomend', syncHouseLayerVisibility);
map.on('click', handleMapClick);

elements.addContainerButton?.addEventListener('click', beginAddContainerMode);
elements.containerEditorToggle?.addEventListener('click', toggleContainerEditor);
elements.downloadContainersButton?.addEventListener('click', downloadContainerLocations);
elements.resetContainersButton?.addEventListener('click', resetContainerLocations);

init();
