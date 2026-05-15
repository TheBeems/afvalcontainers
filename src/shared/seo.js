export const SITE_BASE_PATH = '/';
export const SITE_URL = 'https://afvalcontainers-warmenhuizen.nl/';
export const SOCIAL_IMAGE_PATH = 'social/afvalcontainers-schagen-preview.png';
export const SOCIAL_IMAGE_URL = `${SITE_URL}${SOCIAL_IMAGE_PATH}`;
export const SOCIAL_IMAGE_WIDTH = 1200;
export const SOCIAL_IMAGE_HEIGHT = 630;
export const SITE_NAME = 'Loopafstanden naar restafvalcontainers in de gemeente Schagen';
export const ORGANIZATION_NAME = 'Dorpsraad Warmenhuizen';
export const ORGANIZATION_ID = `${SITE_URL}#organization`;
export const DEFAULT_OG_DESCRIPTION = 'Interactieve kaart met werkelijke loopafstanden naar geplande ondergrondse restafvalcontainers.';
export const SOCIAL_IMAGE_ALT = 'Kaartachtige preview van loopafstanden naar restafvalcontainers in Warmenhuizen en Tuitjenhorn.';

export function getPlaceSlug(place) {
  return place?.seo?.slug || place?.id || '';
}

export function getPlaceTitle(place) {
  return place?.seo?.title || `Werkelijke loopafstand naar restafvalcontainers in ${place.name}`;
}

export function getPlaceDescription(place) {
  return place?.seo?.description
    || `Bekijk per adres in ${place.name} de werkelijke loopafstand naar de geplande ondergrondse restafvalcontainers.`;
}

export function getPlaceOgDescription(place) {
  return place?.seo?.ogDescription || place?.seo?.description || DEFAULT_OG_DESCRIPTION;
}

export function getPlaceUrl(place) {
  return `${SITE_URL}${getPlaceSlug(place)}/`;
}

export function getMethodologyUrl() {
  return `${SITE_URL}methodiek/`;
}

export function getAnalysesUrl() {
  return `${SITE_URL}analyses/`;
}
