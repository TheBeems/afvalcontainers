import {
  LIVE_ROUTE_TIMEOUT_MS,
  OSRM_BASE_URL,
  OSRM_PROFILE
} from '../config.js';
import { formatDuration, formatMeters } from '../../shared/format.js';
import {
  adjustWalkingDurationSeconds,
  isValidRouteGeometry,
  roundCoordinate,
  roundMetric
} from '../../shared/geometry.js';

export function createLiveRoutes(context, api) {
  const { state } = context;

  function hasRouteGeometry(container) {
    return isValidRouteGeometry(container.routeGeometry);
  }

  function createTimeoutSignal(timeoutMs) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(timeoutMs);
    }

    // Safari and older browsers may not support AbortSignal.timeout yet.
    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  function getCurrentContainer(container) {
    return state.containersById.get(container.id) || container;
  }

  function getContainerRouteLocationKey(container) {
    const currentContainer = getCurrentContainer(container);
    const lat = api.normalizeContainerCoordinate(currentContainer.lat);
    const lon = api.normalizeContainerCoordinate(currentContainer.lon);
    // Edited containers must not reuse a live route fetched for an older marker position.
    return `${currentContainer.id}:${lat},${lon}`;
  }

  function getLiveRouteKey(house, container) {
    const houseKey = house.id || `${api.normalizeContainerCoordinate(house.lat)},${api.normalizeContainerCoordinate(house.lon)}`;
    return `${houseKey}:${getContainerRouteLocationKey(container)}`;
  }

  function getLiveRouteState(house, container) {
    return state.liveRouteCache.get(getLiveRouteKey(house, container)) || null;
  }

  function canFetchLiveRoute(house, container) {
    const currentContainer = getCurrentContainer(container);
    return Number.isFinite(house.lat)
      && Number.isFinite(house.lon)
      && Number.isFinite(currentContainer.lat)
      && Number.isFinite(currentContainer.lon);
  }

  async function fetchLiveRoute(house, container) {
    const currentContainer = getCurrentContainer(container);
    const coordinates = `${house.lon},${house.lat};${currentContainer.lon},${currentContainer.lat}`;
    const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coordinates}?overview=simplified&geometries=geojson`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: createTimeoutSignal(LIVE_ROUTE_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`OSRM live route mislukt (${response.status}).`);
    }

    const data = await response.json();
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    const coordinatesList = route?.geometry?.coordinates;
    if (data.code !== 'Ok' || !Array.isArray(coordinatesList)) {
      throw new Error(`OSRM live route gaf code ${data.code || 'onbekend'}.`);
    }

    const routeGeometry = coordinatesList
      .map(([lon, lat]) => [roundCoordinate(lat), roundCoordinate(lon)])
      .filter(([lat, lon]) => lat !== null && lon !== null);

    if (!isValidRouteGeometry(routeGeometry)) {
      throw new Error('OSRM live route bevat geen bruikbare routegeometrie.');
    }

    return {
      routeGeometry,
      walkingDistance: roundMetric(route.distance),
      walkingDuration: adjustWalkingDurationSeconds(route.duration)
    };
  }

  function loadLiveRoute(house, container) {
    const key = getLiveRouteKey(house, container);
    const cached = state.liveRouteCache.get(key);
    if (cached) {
      return cached.status === 'pending' ? cached.promise : Promise.resolve(cached);
    }

    const promise = fetchLiveRoute(house, container)
      .then((route) => {
        const entry = { status: 'fulfilled', ...route };
        state.liveRouteCache.set(key, entry);
        return entry;
      })
      .catch((error) => {
        // Cache failures too, so repeated renders do not hammer the public OSRM fallback service.
        const entry = {
          status: 'rejected',
          error: error.message || 'Live route kon niet worden opgehaald.'
        };
        state.liveRouteCache.set(key, entry);
        return entry;
      });

    state.liveRouteCache.set(key, { status: 'pending', promise });
    return promise;
  }

  function getRouteDisplay(house, container) {
    if (container.routeSource === 'live' && hasRouteGeometry(container)) {
      return {
        label: 'live na handmatige locatie',
        details: `${formatMeters(container.walkingDistance)} - ${formatDuration(container.walkingDuration)}`
      };
    }

    if (hasRouteGeometry(container)) {
      return { label: 'opgeslagen' };
    }

    const liveRoute = getLiveRouteState(house, container);
    if (!liveRoute) {
      return { label: 'live fallback nog niet opgehaald' };
    }

    if (liveRoute.status === 'pending') {
      return { label: 'live fallback wordt opgehaald' };
    }

    if (liveRoute.status === 'fulfilled') {
      return {
        label: 'live fallback',
        details: `${formatMeters(liveRoute.walkingDistance)} - ${formatDuration(liveRoute.walkingDuration)}`
      };
    }

    return {
      label: 'live fallback mislukt',
      details: liveRoute.error
    };
  }

  return {
    hasRouteGeometry,
    createTimeoutSignal,
    getCurrentContainer,
    getContainerRouteLocationKey,
    getLiveRouteKey,
    getLiveRouteState,
    canFetchLiveRoute,
    fetchLiveRoute,
    loadLiveRoute,
    getRouteDisplay
  };
}
