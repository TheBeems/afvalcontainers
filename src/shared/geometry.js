export const ROUTE_GEOMETRY_DECIMALS = 6;

export function roundMetric(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

export function roundCoordinate(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(ROUTE_GEOMETRY_DECIMALS));
}

export function formatRouteCacheCoordinate(value) {
  return Number(value).toFixed(ROUTE_GEOMETRY_DECIMALS);
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
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

export function isValidRouteGeometry(routeGeometry) {
  return Array.isArray(routeGeometry)
    && routeGeometry.length >= 2
    && routeGeometry.every((point) => Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1]));
}
