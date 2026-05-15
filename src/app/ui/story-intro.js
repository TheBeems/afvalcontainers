import { MOBILE_MAP_SCROLL_QUERY } from '../config.js';

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isMobileMapViewport() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_MAP_SCROLL_QUERY).matches;
}

export function bindStoryIntroEvents(api = {}) {
  const mapTarget = document.getElementById('kaart');
  const searchInput = document.getElementById('house-search');

  if (!mapTarget) {
    return;
  }

  let frame = null;

  function updateMapViewState() {
    frame = null;
    const targetRect = mapTarget.getBoundingClientRect();
    document.body.classList.toggle('map-view-active', targetRect.top <= 1);
  }

  function scheduleMapViewStateUpdate() {
    if (frame !== null) {
      return;
    }

    frame = window.requestAnimationFrame(updateMapViewState);
  }

  document.querySelectorAll('[data-focus-search]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.body.classList.add('map-view-active');
      window.history.replaceState({}, '', '#kaart');

      const isMobile = isMobileMapViewport();
      const behavior = isMobile || prefersReducedMotion() ? 'auto' : 'smooth';
      if (isMobile && typeof api.scrollMapIntoView === 'function') {
        api.scrollMapIntoView({ behavior });
      } else {
        mapTarget.scrollIntoView({
          behavior,
          block: 'start'
        });
      }

      window.requestAnimationFrame(() => {
        searchInput?.focus({ preventScroll: true });
        updateMapViewState();
      });
    });
  });

  window.addEventListener('scroll', scheduleMapViewStateUpdate, { passive: true });
  window.addEventListener('resize', scheduleMapViewStateUpdate);
  window.addEventListener('hashchange', scheduleMapViewStateUpdate);
  updateMapViewState();
}
