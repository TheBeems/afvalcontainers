import { getElements } from './dom.js';
import { createAppState } from './state.js';
import { createMapContext } from './map/setup.js';
import { installMapControls } from './map/controls.js';
import { createContainerStore } from './domain/container-store.js';
import { createPlaceLoader } from './domain/place-loader.js';
import { createRanking } from './domain/ranking.js';
import { createLiveRoutes } from './services/live-routes.js';
import { createContainerEditor } from './ui/container-editor.js';
import { createContainerMarkup } from './ui/container-markup.js';
import { createContainersUi } from './ui/containers.js';
import { createCoverageSummary } from './ui/coverage-summary.js';
import { createHouseSelection } from './ui/house-selection.js';
import { createMobileSidebar } from './ui/mobile-sidebar.js';
import { createSearch } from './ui/search.js';
import { createStatusUi } from './ui/status.js';

async function waitForLeaflet() {
  if (window.L) {
    return;
  }

  await new Promise((resolve) => {
    window.addEventListener('load', resolve, { once: true });
  });

  if (!window.L) {
    throw new Error('Leaflet kon niet worden geladen.');
  }
}

function createApp() {
  const context = {
    elements: getElements(),
    state: createAppState(),
    mapContext: createMapContext()
  };

  const api = {};
  // Modules share one API object to avoid import cycles between UI, map, and domain code.
  Object.assign(api, installMapControls(context));
  Object.assign(api, createStatusUi(context, api));
  Object.assign(api, createContainerMarkup(context, api));
  Object.assign(api, createContainerStore(context, api));
  Object.assign(api, createLiveRoutes(context, api));
  Object.assign(api, createRanking(context, api));
  Object.assign(api, createMobileSidebar(context, api));
  Object.assign(api, createCoverageSummary(context, api));
  Object.assign(api, createContainerEditor(context, api));
  Object.assign(api, createContainersUi(context, api));
  Object.assign(api, createHouseSelection(context, api));
  Object.assign(api, createPlaceLoader(context, api));
  Object.assign(api, createSearch(context, api));

  return { api, context };
}

function registerCoreListeners(context, api) {
  const { elements, mapContext } = context;

  mapContext.map.on('zoomend', api.syncHouseLayerVisibility);
  mapContext.map.on('click', api.handleMapClick);

  elements.addContainerButton?.addEventListener('click', api.beginAddContainerMode);
  elements.containerEditorToggle?.addEventListener('click', api.toggleContainerEditor);
  elements.downloadContainersButton?.addEventListener('click', api.downloadContainerLocations);
  elements.resetContainersButton?.addEventListener('click', api.resetContainerLocations);
  api.bindMobileSidebarEvents();
}

async function init(context, api) {
  const { elements, state } = context;

  try {
    registerCoreListeners(context, api);
    await api.initPlaces();
    await api.initSearch();
  } catch (error) {
    state.placeLoadStatus = 'error';
    elements.coverageSummary.hidden = true;
    elements.houseSummary.hidden = true;
    elements.houseDetails.hidden = false;
    elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
    api.setCoverageStatus(error.message || 'De viewer kon de batchlaag niet laden.', 'error');
  }
}

async function start() {
  await waitForLeaflet();
  const { api, context } = createApp();
  await init(context, api);
}

start().catch((error) => {
  const coverageStatus = document.getElementById('coverage-status');
  if (coverageStatus) {
    coverageStatus.textContent = error.message || 'De kaart kon niet worden gestart.';
    coverageStatus.className = 'status-note error';
  }
});
