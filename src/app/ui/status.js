import { setDetailsOpen } from '../dom.js';
import { MOBILE_MAP_SCROLL_QUERY } from '../config.js';

export function createStatusUi(context) {
  const { elements } = context;

  function isMobileMapViewport() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia(MOBILE_MAP_SCROLL_QUERY).matches;
  }

  function setCoverageStatus(message, tone = '') {
    elements.coverageStatus.textContent = message;
    elements.coverageStatus.className = tone ? `status-note ${tone}` : 'status-note';
  }

  function collapseUiForActiveHouse() {
    setDetailsOpen(elements.sidebarHeaderPanel, false);
    setDetailsOpen(elements.mapLegend, !isMobileMapViewport());
    setDetailsOpen(elements.containerMarkerLegend, false);
  }

  function resetUiForIdleState() {
    setDetailsOpen(elements.sidebarHeaderPanel, true);
    setDetailsOpen(elements.mapLegend, !isMobileMapViewport());
    setDetailsOpen(elements.containerMarkerLegend, false);
  }

  return {
    setCoverageStatus,
    collapseUiForActiveHouse,
    resetUiForIdleState
  };
}
