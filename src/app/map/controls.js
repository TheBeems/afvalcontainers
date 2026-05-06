import { getContainerCategories } from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';
import { MOBILE_MAP_SCROLL_QUERY } from '../config.js';
import { createContainerMarkerSvg } from '../ui/container-marker.js';

function isMobileMapViewport() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_MAP_SCROLL_QUERY).matches;
}

function getContainerLegendItems(containers) {
  const seenKeys = new Set();
  const items = [];

  for (const container of containers) {
    const categories = getContainerCategories(container);
    const key = categories.map((category) => `${category.status}:${category.type}`).join('|');

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    items.push({
      label: categories.map((category) => category.label).join(', '),
      marker: {
        id: `legend-${items.length + 1}`,
        streams: categories.map(({ status, type }) => ({ status, type }))
      }
    });
  }

  return items;
}

export function renderContainerMarkerLegend(context) {
  const { elements, state } = context;
  const body = elements.containerMarkerLegend?.querySelector('.map-collapsible-body');

  if (!body) {
    return;
  }

  body.innerHTML = getContainerLegendItems(state.containers).map((item) => `
    <span class="container-marker-legend-item">
      ${createContainerMarkerSvg(item.marker, { variant: 'legend' })}
      ${escapeHtml(item.label)}
    </span>
  `).join('');
}

export function installMapControls(context) {
  const { elements, mapContext, state } = context;
  const {
    map,
    mapInfoControl,
    mapLegendControl,
    containerMarkerLegendControl,
    containerEditorControl
  } = mapContext;

  // Leaflet owns control DOM placement, so controls are built here and references are stored for other modules.
  mapLegendControl.onAdd = () => {
    const container = L.DomUtil.create('details', 'map-collapsible map-legend');
    container.id = 'map-legend';
    container.open = !isMobileMapViewport();
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
    container.open = false;
    container.setAttribute('aria-label', 'Legenda containermarkers');

    container.innerHTML = `
      <summary>Legenda containers</summary>
      <div class="map-collapsible-body"></div>
    `;

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    return container;
  };

  containerMarkerLegendControl.addTo(map);
  elements.containerMarkerLegend = document.getElementById('container-marker-legend');
  renderContainerMarkerLegend(context);

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

  return {
    renderContainerMarkerLegend: () => renderContainerMarkerLegend(context)
  };
}
