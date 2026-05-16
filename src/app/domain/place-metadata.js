import {
  DEFAULT_PLACE_ID,
  MAP_CENTER,
  MAP_ZOOM,
  PLACES_MANIFEST_PATH
} from '../config.js';
import { loadJson } from '../data/load-json.js';
import { getPlaceSlug } from '../../shared/seo.js';

function getMapCenter(place) {
  return Array.isArray(place?.map?.center) && place.map.center.length === 2
    ? place.map.center
    : MAP_CENTER;
}

function getMapZoom(place) {
  return Number.isFinite(place?.map?.zoom) ? place.map.zoom : MAP_ZOOM;
}

export function normalizePlace(place) {
  return {
    ...place,
    paths: place.paths || {},
    map: {
      center: getMapCenter(place),
      zoom: getMapZoom(place)
    }
  };
}

export async function loadPlacesManifest() {
  const places = await loadJson(PLACES_MANIFEST_PATH, 'Plaatsen laden');
  return Array.isArray(places) ? places.map(normalizePlace) : [];
}

export function getPathPlaceId(places, pathname = window.location.pathname) {
  const pathSegments = pathname.split('/').filter(Boolean);
  const place = places.find((candidate) => {
    const slug = getPlaceSlug(candidate);
    return slug && pathSegments.includes(slug);
  });
  return place?.id || null;
}

export function getRequestedPlaceId(places, location = window.location) {
  const pathPlaceId = getPathPlaceId(places, location.pathname);
  if (pathPlaceId) {
    return { placeId: pathPlaceId, shouldUseCleanUrl: false };
  }

  const urlPlaceId = new URLSearchParams(location.search).get('plaats');
  if (urlPlaceId && places.some((place) => place.id === urlPlaceId)) {
    return { placeId: urlPlaceId, shouldUseCleanUrl: true };
  }

  const defaultPlaceId = places.some((place) => place.id === DEFAULT_PLACE_ID)
    ? DEFAULT_PLACE_ID
    : places[0]?.id;
  return { placeId: defaultPlaceId, shouldUseCleanUrl: false };
}
