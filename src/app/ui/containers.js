import {
  CONTAINER_LONG_PRESS_MS,
  INITIAL_CONTAINER_BOUNDS_MAX_ZOOM,
  INITIAL_ZOOM_OFFSET,
  MAP_MAX_ZOOM
} from '../config.js';
import { REFERENCE_RADIUS_METERS, RESIDENTIAL_RADIUS_METERS } from '../../shared/coverage.js';
import {
  getContainerAccessLabel,
  getContainerCategories,
  getContainerCategory,
  hasPrivateContainerAccess,
  hasRestafvalStream,
  MANUAL_CONTAINER_ACCURACY
} from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';
import {
  createContainerMarkerIcon,
  createContainerMarkerSvg,
  getContainerMarkerColor
} from './container-marker.js';

const COVERAGE_CIRCLES_DESCRIPTION = `De doorgetrokken lijn toont de hemelsbrede straal van ${RESIDENTIAL_RADIUS_METERS} meter, de stippellijn die van ${REFERENCE_RADIUS_METERS} meter.`;
const COVERAGE_CIRCLE_STYLE = {
  radius: RESIDENTIAL_RADIUS_METERS,
  color: '#2563eb',
  weight: 2,
  opacity: 0.9,
  fillColor: '#60a5fa',
  fillOpacity: 0.11,
  interactive: false
};
const COVERAGE_OVERVIEW_CIRCLE_STYLE = {
  ...COVERAGE_CIRCLE_STYLE,
  pane: 'coverageOverviewPane',
  weight: 1.5,
  opacity: 0.75
};

export function createContainersUi(context, api) {
  const { elements, mapContext, state } = context;
  const {
    containerLayer,
    coverageLayer,
    coverageOverviewLayer,
    map
  } = mapContext;

  let zoomInProgress = false;
  map.on('zoomstart', () => {
    zoomInProgress = true;
  });
  map.on('zoomend', () => {
    zoomInProgress = false;
  });

  function getKnownExistingHvcContainerId(container, categories) {
    const hvcContainerId = String(container.hvcContainerId || '').trim();
    if (!hvcContainerId) {
      return '';
    }

    return categories.some((category) => category.status === 'existing')
      ? hvcContainerId
      : '';
  }

  function getAssignedHouseCount(container) {
    return state.coverage && hasRestafvalStream(container)
      ? state.nearestHouseCountsByContainerId.get(container.id) ?? 0
      : null;
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
    const categories = getContainerCategories(container);
    const hvcContainerId = getKnownExistingHvcContainerId(container, categories);
    const hvcContainerIdLine = hvcContainerId
      ? `<div class="container-map-info-meta">HVC container-ID: ${escapeHtml(hvcContainerId)}</div>`
      : '';
    const hasRestafval = hasRestafvalStream(container);
    const coverageCirclesLine = hasRestafval
      ? `<div class="container-map-info-meta">${COVERAGE_CIRCLES_DESCRIPTION}</div>`
      : '';
    const nearestHouseCount = getAssignedHouseCount(container);
    const nearestHouseCountLine = nearestHouseCount !== null
      ? `<div class="container-map-info-meta"><span>Dichtstbijzijnde container voor <strong>${nearestHouseCount.toLocaleString('nl-NL')} ${nearestHouseCount === 1 ? 'huis' : 'huizen'}</strong>.</span></div>`
      : '';
    const categoryPills = categories
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
        <div class="container-map-info-address">${escapeHtml(container.address)}, ${escapeHtml(api.getContainerEditorPlaceName?.() || api.getActivePlaceCity())}</div>
        <div class="container-map-info-meta">
          ${categoryPills}
          ${api.buildContainerAccessPill(container)}
        </div>
        ${coverageCirclesLine}
        ${nearestHouseCountLine}
        ${hvcContainerIdLine}
        <div class="container-map-info-meta">Nauwkeurigheid: ${escapeHtml(container.accuracy)}</div>
      </div>
    `;
  }

  function scrollMapIntoView() {
    api.completeStoryIntro?.();
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
    // Leaflet may emit a click after long-press or drag; ignore that synthetic follow-up briefly.
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

      // Dragging is opt-in per marker so ordinary container clicks stay predictable.
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

    if (state.pendingNewContainer) {
      const pendingMarker = L.marker([state.pendingNewContainer.lat, state.pendingNewContainer.lon], {
        interactive: false,
        icon: createContainerMarkerIcon(state.pendingNewContainer, true),
        title: `${state.pendingNewContainer.id} - nieuwe container`
      });

      pendingMarker.addTo(containerLayer);
      bounds.push([state.pendingNewContainer.lat, state.pendingNewContainer.lon]);
    }

    if (fitBounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: INITIAL_CONTAINER_BOUNDS_MAX_ZOOM });
      map.setZoom(Math.min(map.getZoom() + INITIAL_ZOOM_OFFSET, MAP_MAX_ZOOM));
    }
  }

  function syncContainerAddressCount(element, count) {
    const existing = element.querySelector('.container-marker-address-count');
    if (count === null) {
      if (existing) {
        existing.remove();
        element.removeAttribute('aria-label');
      }
      return;
    }

    const countText = count.toLocaleString('nl-NL');
    if (existing?.textContent === countText) {
      return;
    }

    const label = existing || document.createElement('span');
    label.className = 'container-marker-address-count';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = countText;
    if (!existing) {
      element.append(label);
    }
    element.setAttribute('aria-label', `${element.title}, ${countText} adressen`);
  }

  function syncContainerMarkerStyles() {
    const { filteredContainerIds } = state;
    state.containerMarkers.forEach((marker, index) => {
      const markerElement = marker.getElement();
      if (!markerElement) {
        return;
      }
      const container = state.containers[index];
      const matches = filteredContainerIds?.has(container.id) ?? false;
      markerElement.classList.toggle('container-marker-highlighted', matches);
      markerElement.classList.toggle('container-marker-muted', filteredContainerIds !== null && !matches);
      syncContainerAddressCount(markerElement, matches ? getAssignedHouseCount(container) : null);
    });
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

    api.syncHouseMarkerStyles();
    api.syncHouseLayerVisibility();
    api.updateContainerEditorControls();
  }

  function clearContainerSelection() {
    coverageLayer.clearLayers();
    renderContainerMapInfo(null);
    updateActiveContainer(null);
    if (!state.selectedHouse) {
      api.renderIdleHouseState();
    }
  }

  function showCoverageCircles(container) {
    coverageLayer.clearLayers();
    if (!container || !hasRestafvalStream(container)) {
      return;
    }

    const center = [container.lat, container.lon];
    L.circle(center, {
      ...COVERAGE_CIRCLE_STYLE,
      radius: REFERENCE_RADIUS_METERS,
      dashArray: '1 6',
      fillOpacity: 0.08
    }).addTo(coverageLayer);
    // The two fills combine to approximately the original 18% opacity inside the inner circle.
    L.circle(center, COVERAGE_CIRCLE_STYLE).addTo(coverageLayer);
  }

  function renderCoverageOverview() {
    coverageOverviewLayer.clearLayers();
    const publicContainers = state.containers.filter(
      (container) => !hasPrivateContainerAccess(container) && hasRestafvalStream(container)
    );
    for (const { lat, lon } of publicContainers) {
      L.circle([lat, lon], COVERAGE_OVERVIEW_CIRCLE_STYLE).addTo(coverageOverviewLayer);
    }
  }

  function fitCoverageOverview() {
    if (!map.hasLayer(coverageOverviewLayer)) {
      return;
    }
    if (zoomInProgress) {
      map.once('zoomend', fitCoverageOverview);
      return;
    }

    const bounds = coverageOverviewLayer.getBounds();
    if (bounds.isValid() && !map.getBounds().contains(bounds)) {
      map.fitBounds(bounds, { padding: [12, 24], maxZoom: map.getZoom(), animate: false });
    }
  }

  function selectContainer(index, { focusMap = true, scrollToMap = false } = {}) {
    const container = state.containers[index];
    if (!container) {
      return;
    }

    const hadPendingContainer = Boolean(state.pendingNewContainer);
    state.pendingNewContainer = null;
    state.addContainerMode = false;
    map.getContainer().classList.remove('adding-container');
    if (hadPendingContainer) {
      renderContainers();
    }

    showCoverageCircles(container);
    updateActiveContainer(index);
    renderContainerMapInfo(container);

    if (focusMap) {
      const bounds = coverageLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
      } else {
        map.setView([container.lat, container.lon], Math.max(map.getZoom(), 17), { animate: true });
      }
    }

    const statusText = hasRestafvalStream(container)
      ? `Geselecteerde container ${container.id}. ${COVERAGE_CIRCLES_DESCRIPTION} Huishoudens waarvoor dit de dichtstbijzijnde container is, zijn uitgelicht; overige huishoudens zijn gedimd.`
      : `Geselecteerde container ${container.id}. Deze locatie telt niet mee voor restafval-loopafstanden.`;
    api.setCoverageStatus(statusText);

    api.closeMobileSidebarIfMobile?.();

    if (scrollToMap) {
      scrollMapIntoView();
    }
  }

  function renderContainers({ fitBounds = false } = {}) {
    api.refreshCoverageFilters('containers');
    addContainerMarkers({ fitBounds });
    renderCoverageOverview();
    syncContainerMarkerStyles();
    addContainerList();
    api.renderContainerMarkerLegend();
    const activeContainer = state.containers[state.activeContainerIndex];
    showCoverageCircles(activeContainer);
    renderContainerMapInfo(activeContainer);
    api.syncHouseMarkerStyles();
    api.updateContainerEditorControls();
  }

  return {
    renderContainerMapInfo,
    getAssignedHouseCount,
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
    syncContainerMarkerStyles,
    addContainerList,
    updateActiveContainer,
    clearContainerSelection,
    selectContainer,
    fitCoverageOverview,
    renderContainers
  };
}
