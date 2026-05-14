import {
  DEFAULT_PLACE_ID,
  MAP_CENTER,
  MAP_ZOOM,
  PLACES_MANIFEST_PATH
} from '../config.js';
import { loadJson } from '../data/load-json.js';
import { escapeHtml } from '../../shared/html.js';
import {
  getPlaceDescription,
  getPlaceOgDescription,
  getPlaceSlug,
  getPlaceTitle,
  getPlaceUrl,
  SOCIAL_IMAGE_URL
} from '../../shared/seo.js';

function getMapCenter(place) {
  return Array.isArray(place?.map?.center) && place.map.center.length === 2
    ? place.map.center
    : MAP_CENTER;
}

function getMapZoom(place) {
  return Number.isFinite(place?.map?.zoom) ? place.map.zoom : MAP_ZOOM;
}

function normalizePlace(place) {
  return {
    ...place,
    paths: place.paths || {},
    map: {
      center: getMapCenter(place),
      zoom: getMapZoom(place)
    }
  };
}

function buildHouseDetailPath(place, detailBundle) {
  const basePath = place?.paths?.houseDetailsBase;
  if (!basePath || !detailBundle) {
    return null;
  }
  return `${basePath.replace(/\/$/, '')}/${encodeURIComponent(detailBundle)}.json`;
}

function getPathPlaceId(places) {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const place = places.find((candidate) => {
    const slug = getPlaceSlug(candidate);
    return slug && pathSegments.includes(slug);
  });
  return place?.id || null;
}

function getRequestedPlaceId(places) {
  const pathPlaceId = getPathPlaceId(places);
  if (pathPlaceId) {
    return { placeId: pathPlaceId, shouldUseCleanUrl: false };
  }

  const urlPlaceId = new URLSearchParams(window.location.search).get('plaats');
  if (urlPlaceId && places.some((place) => place.id === urlPlaceId)) {
    return { placeId: urlPlaceId, shouldUseCleanUrl: true };
  }

  const defaultPlaceId = places.some((place) => place.id === DEFAULT_PLACE_ID)
    ? DEFAULT_PLACE_ID
    : places[0]?.id;
  return { placeId: defaultPlaceId, shouldUseCleanUrl: false };
}

function getRequestedContainerId() {
  return new URLSearchParams(window.location.search).get('container') || null;
}

function updateMetaContent(selector, value) {
  const meta = document.querySelector(selector);
  if (meta) {
    meta.setAttribute('content', value);
  }
}

function updateLinkHref(selector, value) {
  const link = document.querySelector(selector);
  if (link) {
    link.setAttribute('href', value);
  }
}

function updateIconLinks() {
  updateLinkHref('link[rel="icon"][type="image/svg+xml"]', getRuntimePath('favicon.svg'));
  updateLinkHref('link[rel="icon"][type="image/png"]', getRuntimePath('favicon.png'));
}

let runtimeBaseUrl = null;

function getRuntimeBaseUrl() {
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }

  const basePath = document.querySelector('meta[name="app-base-path"]')?.getAttribute('content') || './';
  runtimeBaseUrl = new URL(basePath, document.baseURI);
  return runtimeBaseUrl;
}

function getRuntimePath(path) {
  return new URL(path, getRuntimeBaseUrl()).toString();
}

function getCleanPlaceUrl(place, places) {
  const url = new URL(window.location.href);
  const slug = getPlaceSlug(place);
  const placeSlugs = new Set(places.map((candidate) => getPlaceSlug(candidate)).filter(Boolean));
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const placeSegmentIndex = pathSegments.findIndex((segment) => placeSlugs.has(segment));

  if (placeSegmentIndex >= 0) {
    pathSegments[placeSegmentIndex] = slug;
    pathSegments.length = placeSegmentIndex + 1;
  } else {
    pathSegments.push(slug);
  }

  url.pathname = `/${pathSegments.join('/')}/`;
  url.searchParams.delete('plaats');
  return url;
}

function updatePlaceUrl(place, places) {
  if (!place || typeof window.history?.replaceState !== 'function') {
    return;
  }

  const url = getCleanPlaceUrl(place, places);
  window.history.replaceState({}, '', url);
}

export function createPlaceLoader(context, api) {
  const { elements, mapContext, state } = context;
  const {
    containerLayer,
    houseLayer,
    map,
    resultLayer,
    routeLayer,
    selectionLayer
  } = mapContext;

  // Place loads can overlap when search results switch villages; selection ids discard stale results.
  let activePlaceLoadPromise = null;

  function getPlaceById(placeId) {
    return state.placesById.get(placeId) || null;
  }

  function getActivePlaceName() {
    return state.activePlace?.name || 'dit dorp';
  }

  function getActivePlaceCity() {
    return state.activePlace?.name || '';
  }

  function getContainerIdPrefix() {
    return state.activePlace?.containerIdPrefix || '';
  }

  function getContainerIdFormat() {
    return `${getContainerIdPrefix() || 'XX'}NN`;
  }

  function getContainerIdExample() {
    return `${getContainerIdPrefix() || 'XX'}33`;
  }

  function getContainerDownloadFilename() {
    return state.activePlace?.id
      ? `${state.activePlace.id}-container-locations.json`
      : 'container-locations.json';
  }

  function getContainerIdPattern() {
    const prefix = getContainerIdPrefix();
    return prefix
      ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{2}$`)
      : /^[A-Z]+\d{2}$/;
  }

  function renderPlaceSelector() {
    if (!elements.placeSelect) {
      return;
    }

    elements.placeSelect.innerHTML = state.places.map((place) => `
      <option value="${escapeHtml(place.id)}"${place.id === state.activePlace?.id ? ' selected' : ''}>${escapeHtml(place.name)}</option>
    `).join('');
    elements.placeSelect.disabled = state.places.length === 0 || state.placeLoadStatus === 'loading';
    elements.placeSelect.onchange = async () => {
      api.closeMobileSidebarIfMobile?.();
      await selectPlace(elements.placeSelect.value);
    };
  }

  function updatePlaceText(place) {
    const title = getPlaceTitle(place);
    const description = getPlaceDescription(place);
    const ogDescription = getPlaceOgDescription(place);
    const url = getPlaceUrl(place);
    document.title = title;

    updateMetaContent('meta[name="description"]', description);
    updateLinkHref('link[rel="canonical"]', url);
    updateMetaContent('meta[property="og:title"]', title);
    updateMetaContent('meta[property="og:description"]', ogDescription);
    updateMetaContent('meta[property="og:url"]', url);
    updateMetaContent('meta[property="og:image"]', SOCIAL_IMAGE_URL);
    updateMetaContent('meta[name="twitter:title"]', title);
    updateMetaContent('meta[name="twitter:description"]', ogDescription);
    updateMetaContent('meta[name="twitter:image"]', SOCIAL_IMAGE_URL);
    updateIconLinks();

    if (elements.appTitle) {
      elements.appTitle.textContent = title;
    }

    elements.placeNameElements?.forEach((element) => {
      element.textContent = place.name;
    });

    if (elements.placeSourceLink) {
      elements.placeSourceLink.href = place.sourceUrl;
    }

    if (elements.methodologyLink) {
      elements.methodologyLink.href = getRuntimePath('methodiek/');
    }

    if (elements.analysesLink) {
      elements.analysesLink.href = getRuntimePath('analyses/');
    }

    if (elements.mapShell) {
      elements.mapShell.setAttribute('aria-label', `Kaart van ${place.name} met containerlocaties en batchanalyse`);
    }
  }

  function resetPlaceDataState() {
    api.lockUnlockedContainer?.();
    map.closePopup();
    if (map.hasLayer(houseLayer)) {
      map.removeLayer(houseLayer);
    }

    containerLayer.clearLayers();
    houseLayer.clearLayers();
    resultLayer.clearLayers();
    routeLayer.clearLayers();
    selectionLayer.clearLayers();

    state.containers = [];
    state.originalContainers = [];
    state.houses = [];
    state.coverage = null;
    state.addressIndex = [];
    state.addressIndexPlaceId = null;
    state.containersById = new Map();
    state.containersByKey = new Map();
    state.originalContainersById = new Map();
    state.originalContainersByKey = new Map();
    state.activeContainerIndex = null;
    state.activeContainerKey = null;
    state.selectedHouse = null;
    state.coverageCircle = null;
    state.selectedHouseMarker = null;
    state.containerMarkers = [];
    state.containerButtons = [];
    state.liveRouteCache.clear();
    state.houseSelectionId += 1;
    state.containerInfoCollapsed = false;
    state.houseInfoCollapsed = false;
    state.containerEditorExpanded = false;
    state.addContainerMode = false;
    state.pendingNewContainer = null;
    state.editingContainerKey = null;
    state.unlockedContainerKey = null;
    state.containerDragStart = null;
    state.suppressContainerClickUntil = 0;

    map.getContainer().classList.remove('adding-container');

    if (elements.coverageSummary) {
      elements.coverageSummary.hidden = true;
      elements.coverageSummary.innerHTML = '';
    }
    if (elements.houseDetails) {
      elements.houseDetails.hidden = false;
      elements.houseDetails.innerHTML = '<div class="empty-state">Klik op een huispunt of zoek je adres om de dekking en routes te bekijken.</div>';
    }
    if (elements.containerList) {
      elements.containerList.innerHTML = '';
    }

    api.renderContainerMapInfo?.(null);
    api.renderHouseMapInfo?.(null);
    api.renderContainerMarkerLegend?.();
    api.updateContainerEditorControls?.();
  }

  function loadPlaceContainers(containers) {
    const loadedContainers = Array.isArray(containers) ? containers : [];
    api.setOriginalContainers(loadedContainers);
    state.containers = state.originalContainers.map((container) => api.cloneContainerForState(container, container.clientKey));
    api.syncContainerIndex();
  }

  async function loadHouseDetail(place, houseId, detailBundle) {
    const placeId = place?.id;
    const detailPath = buildHouseDetailPath(place, detailBundle);
    if (!placeId || !detailPath) {
      throw new Error('Adresdetailpad ontbreekt.');
    }

    if (!state.houseDetailBundlesByPlaceId.has(placeId)) {
      state.houseDetailBundlesByPlaceId.set(placeId, new Map());
    }

    const cache = state.houseDetailBundlesByPlaceId.get(placeId);
    let bundle = cache.get(detailBundle);

    if (!bundle) {
      bundle = await loadJson(detailPath, 'Adresdetails laden');
      cache.set(detailBundle, bundle);
    }

    const houses = Array.isArray(bundle?.houses) ? bundle.houses : [];
    const house = houses.find((candidate) => candidate.id === houseId);
    if (!house) {
      throw new Error('Adresdetail niet gevonden in detailbundel.');
    }

    return house;
  }

  async function selectLoadedHouseById(houseId, { focusMap = true } = {}) {
    if (!houseId) {
      return false;
    }

    const houseMarker = state.houses.find((candidate) => candidate.id === houseId);
    if (!houseMarker) {
      api.setCoverageStatus(`Adres niet gevonden in ${getActivePlaceName()}.`, 'error');
      return false;
    }

    state.houseSelectionId += 1;
    const selectionId = state.houseSelectionId;
    const placeSelectionId = state.placeSelectionId;
    api.setCoverageStatus('Adresdetail wordt geladen...', 'loading');

    let house = null;
    try {
      house = await loadHouseDetail(state.activePlace, houseId, houseMarker.detailBundle);
      if (selectionId !== state.houseSelectionId || placeSelectionId !== state.placeSelectionId) {
        return false;
      }
    } catch (error) {
      if (selectionId === state.houseSelectionId && placeSelectionId === state.placeSelectionId) {
        api.setCoverageStatus(error.message || 'Adresdetail kon niet worden geladen.', 'error');
      }
      return false;
    }

    api.selectHouse(house, { focusMap });
    return true;
  }

  function selectLoadedContainerById(containerId, { focusMap = true, collapseIntro = false } = {}) {
    if (!containerId) {
      return false;
    }

    const containerIndex = api.getContainerIndexById(containerId);
    if (containerIndex < 0) {
      api.setCoverageStatus(`Container ${containerId} niet gevonden in ${getActivePlaceName()}.`, 'error');
      return false;
    }

    if (collapseIntro && elements.sidebarHeaderPanel) {
      elements.sidebarHeaderPanel.open = false;
    }

    api.selectContainer(containerIndex, { focusMap });
    return true;
  }

  function renderLoadedPlace({
    selectedHouseId = null,
    selectedContainerId = null,
    focusMap = true,
    collapseIntroForSelectedContainer = false
  } = {}) {
    api.renderContainers({ fitBounds: false });

    if (!state.coverage || state.houses.length === 0) {
      if (elements.coverageSummary) {
        elements.coverageSummary.hidden = true;
        elements.coverageSummary.innerHTML = '';
      }
      if (elements.houseDetails) {
        elements.houseDetails.hidden = false;
        elements.houseDetails.innerHTML = '<div class="empty-state">Voor dit dorp is nog geen vooraf berekende huizenanalyse beschikbaar.</div>';
      }
      api.setCoverageStatus(`Containerlocaties voor ${getActivePlaceName()} geladen. Er is nog geen huizenanalyse voor dit dorp beschikbaar.`);
      return;
    }

    api.renderCoverageSummary();
    api.renderHouseMarkers();
    api.syncHouseLayerVisibility();

    if (selectedHouseId) {
      void selectLoadedHouseById(selectedHouseId, { focusMap });
      return;
    }

    if (selectedContainerId && selectLoadedContainerById(selectedContainerId, {
      focusMap,
      collapseIntro: collapseIntroForSelectedContainer
    })) {
      return;
    }

    api.renderIdleHouseState();
  }

  async function loadAddressIndexForPlace(place) {
    if (!place?.paths?.addressIndex) {
      return [];
    }

    if (state.addressIndexByPlaceId.has(place.id)) {
      return state.addressIndexByPlaceId.get(place.id);
    }

    const addressIndex = await loadJson(place.paths.addressIndex, `Adresindex ${place.name} laden`);
    const normalizedIndex = Array.isArray(addressIndex) ? addressIndex : [];
    state.addressIndexByPlaceId.set(place.id, normalizedIndex);
    return normalizedIndex;
  }

  async function loadActiveAddressIndex() {
    const place = state.activePlace;
    if (!place) {
      return [];
    }

    const addressIndex = await loadAddressIndexForPlace(place);
    state.addressIndex = addressIndex;
    state.addressIndexPlaceId = place.id;
    return addressIndex;
  }

  async function loadPlaceData(place, selectionId, options = {}) {
    state.placeLoadStatus = 'loading';
    renderPlaceSelector();
    api.setCoverageStatus(`Data voor ${place.name} wordt geladen...`, 'loading');

    try {
      const [containers, coverage] = await Promise.all([
        loadJson(place.paths.containers, `Containerdataset ${place.name} laden`),
        place.paths.coverageSummary && place.paths.houseMap
          ? Promise.all([
            loadJson(place.paths.coverageSummary, `Samenvatting ${place.name} laden`),
            loadJson(place.paths.houseMap, `Huizenkaart ${place.name} laden`)
          ])
          : Promise.resolve(null)
      ]);

      if (selectionId !== state.placeSelectionId) {
        return;
      }

      loadPlaceContainers(containers);
      const [coverageSummary, houseMap] = Array.isArray(coverage) ? coverage : [null, []];
      state.coverage = coverageSummary && typeof coverageSummary === 'object' ? coverageSummary : null;
      state.houses = Array.isArray(houseMap) ? houseMap : [];
      state.placeLoadStatus = 'ready';
      renderPlaceSelector();
      renderLoadedPlace(options);
    } catch (error) {
      if (selectionId !== state.placeSelectionId) {
        return;
      }

      state.placeLoadStatus = 'error';
      renderPlaceSelector();
      elements.coverageSummary.hidden = true;
      elements.houseDetails.hidden = false;
      elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
      api.setCoverageStatus(error.message || `De viewer kon de batchlaag voor ${place.name} niet laden.`, 'error');
    }
  }

  async function selectPlace(placeId, options = {}) {
    const place = getPlaceById(placeId);
    if (!place) {
      api.setCoverageStatus(`Onbekend dorp: ${placeId}`, 'error');
      return;
    }
    const shouldUpdateUrl = options.updateUrl !== false;

    if (state.activePlace?.id === place.id) {
      if (shouldUpdateUrl) {
        updatePlaceUrl(place, state.places);
      }
      if (state.placeLoadStatus === 'loading' && activePlaceLoadPromise) {
        await activePlaceLoadPromise;
      }
      if (state.placeLoadStatus === 'ready' && options.selectedHouseId) {
        await selectLoadedHouseById(options.selectedHouseId, { focusMap: options.focusMap !== false });
      }
      if (state.placeLoadStatus === 'ready' && options.selectedContainerId) {
        selectLoadedContainerById(options.selectedContainerId, {
          focusMap: options.focusMap !== false,
          collapseIntro: options.collapseIntroForSelectedContainer === true
        });
      }
      return;
    }

    state.placeSelectionId += 1;
    const selectionId = state.placeSelectionId;
    state.activePlace = place;
    updatePlaceText(place);
    if (shouldUpdateUrl) {
      updatePlaceUrl(place, state.places);
    }
    resetPlaceDataState();
    renderPlaceSelector();
    map.setView(getMapCenter(place), getMapZoom(place));

    activePlaceLoadPromise = loadPlaceData(place, selectionId, options);
    await activePlaceLoadPromise;
  }

  async function initPlaces() {
    const places = await loadJson(PLACES_MANIFEST_PATH, 'Plaatsen laden');
    state.places = Array.isArray(places) ? places.map(normalizePlace) : [];
    state.placesById = new Map(state.places.map((place) => [place.id, place]));

    if (state.places.length === 0) {
      throw new Error('Er zijn geen dorpen geconfigureerd.');
    }

    const requestedPlace = getRequestedPlaceId(state.places);
    const requestedContainerId = getRequestedContainerId();
    await selectPlace(requestedPlace.placeId, {
      updateUrl: requestedPlace.shouldUseCleanUrl,
      selectedContainerId: requestedContainerId,
      collapseIntroForSelectedContainer: Boolean(requestedContainerId)
    });
  }

  return {
    getPlaceById,
    getActivePlaceName,
    getActivePlaceCity,
    getContainerIdPrefix,
    getContainerIdFormat,
    getContainerIdExample,
    getContainerDownloadFilename,
    getContainerIdPattern,
    renderPlaceSelector,
    updatePlaceText,
    resetPlaceDataState,
    loadPlaceContainers,
    loadHouseDetail,
    selectLoadedHouseById,
    selectLoadedContainerById,
    renderLoadedPlace,
    loadAddressIndexForPlace,
    loadActiveAddressIndex,
    loadPlaceData,
    selectPlace,
    initPlaces
  };
}
