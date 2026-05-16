import '../styles.css';
import { bindStoryIntroEvents } from './ui/story-intro.js';
import { initLazyStoryMedia } from './ui/lazy-story-media.js';

let mapAppModulePromise = null;

function loadMapApp(options = {}) {
  if (!mapAppModulePromise) {
    mapAppModulePromise = import('./map-app.js');
  }

  return mapAppModulePromise.then(({ startMapApp }) => startMapApp(options));
}

function handleMapStartError(error) {
  const coverageStatus = document.getElementById('coverage-status');
  if (coverageStatus) {
    coverageStatus.textContent = error.message || 'De kaart kon niet worden gestart.';
    coverageStatus.className = 'status-note error';
  }
}

function start() {
  initLazyStoryMedia();
  bindStoryIntroEvents({
    onMapRequested({ focusSearch = false } = {}) {
      return loadMapApp({ focusSearchAfterStart: focusSearch }).catch(handleMapStartError);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (window.location.hash === '#kaart' || params.has('container') || params.has('plaats')) {
    loadMapApp().catch(handleMapStartError);
  }
}

start();
