import {
  CONTAINER_LONG_PRESS_MS,
  INITIAL_CONTAINER_BOUNDS_MAX_ZOOM,
  INITIAL_ZOOM_OFFSET,
  MAP_MAX_ZOOM,
  MOBILE_MAP_SCROLL_QUERY
} from '../config.js';
import { REFERENCE_RADIUS_METERS } from '../../shared/coverage.js';
import {
  getContainerAccessLabel,
  getContainerCategories,
  getContainerCategory,
  getContainerMarkerColors,
  getContainerTypeCount,
  hasRestafvalStream,
  MANUAL_CONTAINER_ACCURACY
} from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';

export function createContainersUi(context, api) {
  const { elements, mapContext, state } = context;
  const {
    containerLayer,
    map
  } = mapContext;

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
    const categoryPills = getContainerCategories(container)
      .map((containerCategory) => `
        <span class="container-category-pill">
          <span class="container-category-swatch" style="border-color:${containerCategory.borderColor};background:${containerCategory.fillColor}" aria-hidden="true"></span>
          ${escapeHtml(containerCategory.label)}
        </span>
      `)
      .join('');
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
          ${categoryPills}
          ${api.buildContainerAccessPill(container)}
        </div>
        <div class="container-map-info-meta">Nauwkeurigheid: ${escapeHtml(container.accuracy)}</div>
      </div>
    `;
  }

  function getContainerMarkerColor(container) {
    return getContainerCategory(container).borderColor;
  }

  function buildMarkerFill(container) {
    const colors = getContainerMarkerColors(container);
    if (colors.length <= 1) {
      return {
        defs: '',
        fill: colors[0] || getContainerMarkerColor(container)
      };
    }

    const gradientId = `container-marker-gradient-${String(container.id || 'marker').replace(/[^a-z0-9_-]/gi, '-')}`;
    const step = 100 / colors.length;
    const stops = colors.map((color, index) => {
      const start = (index * step).toFixed(2);
      const end = ((index + 1) * step).toFixed(2);
      return `
        <stop offset="${start}%" stop-color="${color}"/>
        <stop offset="${end}%" stop-color="${color}"/>
      `;
    }).join('');

    return {
      defs: `<defs><linearGradient id="${gradientId}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>`,
      fill: `url(#${gradientId})`
    };
  }

  function createContainerMarkerSvg(container) {
    const typeCount = getContainerTypeCount(container);
    const { defs, fill } = buildMarkerFill(container);
    const markerCenter = typeCount > 1
      ? `<text class="container-marker-count" x="32" y="30" text-anchor="middle" dominant-baseline="central">${typeCount}</text>`
      : '<circle cx="32" cy="30" r="12" fill="#ffffff"/>';

    return `
      <svg
        class="container-marker-svg"
        width="42"
        height="58"
        viewBox="0 0 64 88"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        ${defs}
        <path
          d="M32 84C32 84 56 52 56 30C56 16.745 45.255 6 32 6C18.745 6 8 16.745 8 30C8 52 32 84 32 84Z"
          fill="${fill}"
          stroke="#ffffff"
          stroke-width="6"
        />

        ${markerCenter}
      </svg>
    `;
  }

  function createContainerMarkerIcon(container, isActive = false) {
    return L.divIcon({
      className: `container-marker-icon${isActive ? ' container-marker-active' : ''}`,
      html: createContainerMarkerSvg(container),
      iconSize: [42, 58],
      iconAnchor: [21, 58],
      popupAnchor: [0, -58]
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
    const index = api.getContainerIndexByKey(containerKey);
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
    api.setContainerEditorStatus(`Container ${container.id} is ontgrendeld. Sleep de marker naar de nieuwe locatie.`, 'active');
  }

  function applyContainerMove(containerId, latlng) {
    const container = state.containersById.get(containerId);
    if (!container) {
      return;
    }

    container.lat = api.normalizeContainerCoordinate(latlng.lat);
    container.lon = api.normalizeContainerCoordinate(latlng.lng);
    container.accuracy = MANUAL_CONTAINER_ACCURACY;
    api.syncContainerIndex();
    renderContainers();
    const index = getContainerIndexById(container.id);
    if (state.activeContainerKey === container.clientKey || state.activeContainerIndex === index) {
      showCoverageCircle(container);
    }

    api.refreshSelectedHouseLiveState();
    api.setContainerEditorStatus(`Container ${container.id} is verplaatst. Download de JSON om de wijziging te bewaren.`, 'success');
  }

  function handleContainerDragEnd(marker, container) {
    suppressContainerClick();

    const previousLatLng = state.containerDragStart?.key === container.clientKey
      ? state.containerDragStart.latLng
      : L.latLng(container.lat, container.lon);
    const nextLatLng = marker.getLatLng();

    state.containerDragStart = null;

    const previousLat = api.normalizeContainerCoordinate(previousLatLng.lat);
    const previousLon = api.normalizeContainerCoordinate(previousLatLng.lng);
    const nextLat = api.normalizeContainerCoordinate(nextLatLng.lat);
    const nextLon = api.normalizeContainerCoordinate(nextLatLng.lng);

    if (previousLat === nextLat && previousLon === nextLon) {
      lockUnlockedContainer();
      api.setContainerEditorStatus('Containerpositie is niet gewijzigd.');
      return;
    }

    const confirmed = window.confirm(
      `Container ${container.id} verplaatsen naar ${nextLat.toFixed(6)}, ${nextLon.toFixed(6)}?`
    );

    if (!confirmed) {
      marker.setLatLng(previousLatLng);
      lockUnlockedContainer();
      api.setContainerEditorStatus(`Verplaatsing van container ${container.id} is geannuleerd.`);
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
      api.setContainerEditorStatus(`Container ${container.id} wordt verplaatst...`, 'active');
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
      const isChanged = api.hasContainerChanged(container);
      const accessLabel = getContainerAccessLabel(container);
      const accessText = accessLabel ? ` · ${escapeHtml(accessLabel)}` : '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = isChanged ? 'container-item changed' : 'container-item';
      button.innerHTML = `
        <div>
          <span class="container-code">${escapeHtml(container.id)}</span>
          <span class="container-address">${escapeHtml(container.address)}</span>
        </div>
        <div class="container-meta">
          ${escapeHtml(api.formatContainerCategory(container))}${accessText} · Nauwkeurigheid: ${escapeHtml(container.accuracy)}
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

    api.updateContainerEditorControls();
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
    if (!hasRestafvalStream(container)) {
      return;
    }

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
    } else if (focusMap) {
      map.setView([container.lat, container.lon], Math.max(map.getZoom(), 17), { animate: true });
    }

    if (scrollToMap) {
      scrollMapIntoView();
    }

    const statusText = hasRestafvalStream(container)
      ? `Geselecteerde container ${container.id}. De blauwe cirkel toont 275 meter hemelsbreed.`
      : `Geselecteerde container ${container.id}. Deze locatie telt niet mee voor restafval-loopafstanden.`;
    api.setCoverageStatus(statusText);
  }

  function renderContainers({ fitBounds = false } = {}) {
    addContainerMarkers({ fitBounds });
    addContainerList();
    renderContainerMapInfo(state.activeContainerIndex !== null ? state.containers[state.activeContainerIndex] : null);
    api.updateContainerEditorControls();
  }

  return {
    renderContainerMapInfo,
    getContainerMarkerColor,
    createContainerMarkerSvg,
    createContainerMarkerIcon,
    scrollMapIntoView,
    getContainerIndexById,
    getContainerMarkerById,
    getContainerMarkerByKey,
    suppressContainerClick,
    shouldSuppressContainerClick,
    lockUnlockedContainer,
    unlockContainerMarker,
    applyContainerMove,
    handleContainerDragEnd,
    attachContainerMarkerEditing,
    addContainerMarkers,
    addContainerList,
    updateActiveContainer,
    clearCoverageCircle,
    clearContainerSelection,
    showCoverageCircle,
    selectContainer,
    renderContainers
  };
}
