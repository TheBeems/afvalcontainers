import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import { createStatusUi } from './ui/status.js';

window.L = L;

let appPromise = null;

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

async function init(context, api, options = {}) {
  const { elements, state } = context;

  try {
    registerCoreListeners(context, api);
    await api.initPlaces({
      selectedHouseId: options.selectedHouseId,
      selectedPlaceId: options.selectedPlaceId
    });
  } catch (error) {
    state.placeLoadStatus = 'error';
    elements.coverageSummary.hidden = true;
    elements.houseDetails.hidden = false;
    elements.houseDetails.innerHTML = '<div class="empty-state">De batchlaag kon niet worden geladen.</div>';
    api.setCoverageStatus(error.message || 'De viewer kon de batchlaag niet laden.', 'error');
  }

  return { api, context };
}

function focusSearchInput() {
  window.requestAnimationFrame(() => {
    document.getElementById('house-search')?.focus({ preventScroll: true });
  });
}

async function applySelection(api, options = {}) {
  if (!options.selectedPlaceId) {
    return;
  }

  await api.selectPlace(options.selectedPlaceId, {
    selectedHouseId: options.selectedHouseId,
    focusMap: true
  });
}

export async function startMapApp(options = {}) {
  const { focusSearchAfterStart = false } = options;
  const shouldApplySelectionAfterStart = Boolean(appPromise);

  if (!appPromise) {
    appPromise = (async () => {
      const { api, context } = createApp();
      return init(context, api, options);
    })();
  }

  const app = await appPromise;
  if (shouldApplySelectionAfterStart) {
    await applySelection(app.api, options);
  }

  if (focusSearchAfterStart) {
    focusSearchInput();
  }

  return app;
}
