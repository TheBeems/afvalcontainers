import { MAP_MAX_ZOOM } from '../config.js';

export function createMapContext() {
  const map = L.map('map', { preferCanvas: true });

  // Custom panes keep route and selection overlays above markers without intercepting map clicks.
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

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: MAP_MAX_ZOOM,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers'
  }).addTo(map);

  return {
    map,
    houseRenderer,
    resultRenderer,
    routeRenderer,
    selectionRenderer,
    houseLayer,
    resultLayer,
    routeLayer,
    selectionLayer,
    containerLayer,
    mapInfoControl,
    mapLegendControl,
    containerMarkerLegendControl,
    containerEditorControl
  };
}
