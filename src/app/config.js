export const HOUSE_MARKER_MIN_ZOOM = 16;
export const SEARCH_FOCUS_ZOOM = HOUSE_MARKER_MIN_ZOOM;
export const SEARCH_RESULT_LIMIT = 10;
export const SEARCH_MIN_QUERY_LENGTH = 1;
export const HOUSE_CIRCLE_RADIUS = 4.5;
export const HOUSE_MARKER_FILL_OPACITY = 0.75;
export const HOUSE_MARKER_MUTED_FILL_OPACITY = 1.0;
export const MAP_CENTER = [52.7235, 4.7385];
export const MAP_ZOOM = 16;
export const DEFAULT_PLACE_ID = 'warmenhuizen';
export const PLACES_MANIFEST_PATH = './data/places.json';
export const INITIAL_CONTAINER_BOUNDS_MAX_ZOOM = 16;
export const INITIAL_ZOOM_OFFSET = 1;
export const MAP_MAX_ZOOM = 19;
export const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
export const OSRM_PROFILE = 'foot';
export const LIVE_ROUTE_TIMEOUT_MS = 15000;
export const CONTAINER_LONG_PRESS_MS = 600;
export const MOBILE_MAP_SCROLL_QUERY = '(max-width: 960px)';
export const CHANGED_CONTAINER_PREVIEW_LIMIT = 4;

export const ROUTE_STYLES = [
  { weight: 6, opacity: 0.95 },
  { weight: 4, opacity: 0.72 },
  { weight: 3, opacity: 0.55 }
];

export function getRouteStyle(index) {
  return ROUTE_STYLES[index] || ROUTE_STYLES[ROUTE_STYLES.length - 1];
}
