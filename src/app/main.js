import '../styles.css';
import { bindStoryIntroEvents } from './ui/story-intro.js';
import { initLazyStoryMedia } from './ui/lazy-story-media.js';
import { createSearch } from './ui/search.js';

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
  let storyControls = null;
  const search = createSearch({
    onResultSelected({ placeId, houseId }) {
      const mapRequest = storyControls?.completeStoryIntro({
        mapRequestOptions: {
          selectedHouseId: houseId,
          selectedPlaceId: placeId
        }
      });

      return mapRequest || loadMapApp({
        selectedHouseId: houseId,
        selectedPlaceId: placeId
      }).catch(handleMapStartError);
    }
  });

  search.initSearch();
  initLazyStoryMedia();
  storyControls = bindStoryIntroEvents({
    onMapRequested({ focusSearch = false, ...mapOptions } = {}) {
      return loadMapApp({ focusSearchAfterStart: focusSearch, ...mapOptions }).catch(handleMapStartError);
    }
  });

  loadMapApp().catch(handleMapStartError);

  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      void search.preloadActiveAddressIndex().catch(() => {});
    }, 0);
  });
}

start();
