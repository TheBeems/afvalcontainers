function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function bindStoryIntroEvents() {
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
      mapTarget.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      });

      window.setTimeout(() => {
        searchInput?.focus({ preventScroll: true });
      }, prefersReducedMotion() ? 0 : 420);
    });
  });

  window.addEventListener('scroll', scheduleMapViewStateUpdate, { passive: true });
  window.addEventListener('resize', scheduleMapViewStateUpdate);
  window.addEventListener('hashchange', scheduleMapViewStateUpdate);
  updateMapViewState();
}
