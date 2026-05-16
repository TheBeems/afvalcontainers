import { getContainerCategories } from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';
import { MOBILE_MAP_SCROLL_QUERY } from '../config.js';
import { createContainerMarkerSvg } from '../ui/container-marker.js';

function createWalkingLegendIcon() {
  // Font Awesome Free 5 walking icon, CC BY 4.0: https://fontawesome.com/icons/walking
  return `
    <svg
      class="map-collapsible-icon-svg"
      width="24"
      height="24"
      viewBox="0 0 320 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M208 96c26.5 0 48-21.5 48-48S234.5 0 208 0s-48 21.5-48 48 21.5 48 48 48zm94.5 149.1-23.3-11.8-9.7-29.4c-14.7-44.6-55.7-75.8-102.2-75.9-36-.1-55.9 10.1-93.3 25.2-21.6 8.7-39.3 25.2-49.7 46.2L17.6 213c-7.8 15.8-1.5 35 14.2 42.9 15.6 7.9 34.6 1.5 42.5-14.3L81 228c3.5-7 9.3-12.5 16.5-15.4l26.8-10.8-15.2 60.7c-5.2 20.8.4 42.9 14.9 58.8l59.9 65.4c7.2 7.9 12.3 17.4 14.9 27.7l18.3 73.3c4.3 17.1 21.7 27.6 38.8 23.3 17.1-4.3 27.6-21.7 23.3-38.8l-22.2-89c-2.6-10.3-7.7-19.9-14.9-27.7l-45.5-49.7 17.2-68.7 5.5 16.5c5.3 16.1 16.7 29.4 31.7 37l23.3 11.8c15.6 7.9 34.6 1.5 42.5-14.3 7.7-15.7 1.4-35.1-14.3-43zM73.6 385.8c-3.2 8.1-8 15.4-14.2 21.5l-50 50.1c-12.5 12.5-12.5 32.8 0 45.3s32.7 12.5 45.2 0l59.4-59.4c6.1-6.1 10.9-13.4 14.2-21.5l13.5-33.8c-55.3-60.3-38.7-41.8-47.4-53.7l-20.7 51.5z"
        fill="currentColor"
      />
    </svg>
  `;
}

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
      <summary>
        <span class="map-collapsible-summary-label">Legenda loopafstand</span>
        <span class="map-collapsible-summary-icon">${createWalkingLegendIcon()}</span>
      </summary>
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
      <summary>
        <span class="map-collapsible-summary-label">Legenda containers</span>
        <span class="map-collapsible-summary-icon">
          ${createContainerMarkerSvg({
            id: 'legend-toggle',
            streams: [{ status: 'new', type: 'rest' }]
          }, { variant: 'legend-toggle' })}
        </span>
      </summary>
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
