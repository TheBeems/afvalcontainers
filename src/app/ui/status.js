import { setDetailsOpen } from '../dom.js';

export function createStatusUi(context) {
  const { elements } = context;

  function setCoverageStatus(message, tone = '') {
    elements.coverageStatus.textContent = message;
    elements.coverageStatus.className = tone ? `status-note ${tone}` : 'status-note';
  }

  function collapseUiForActiveHouse() {
    setDetailsOpen(elements.sidebarHeaderPanel, false);
    setDetailsOpen(elements.coverageSummaryPanel, false);
    setDetailsOpen(elements.mapLegend, false);
    setDetailsOpen(elements.containerMarkerLegend, false);
  }

  function resetUiForIdleState() {
    setDetailsOpen(elements.sidebarHeaderPanel, true);
    setDetailsOpen(elements.coverageSummaryPanel, true);
    setDetailsOpen(elements.mapLegend, true);
    setDetailsOpen(elements.containerMarkerLegend, false);
  }

  return {
    setCoverageStatus,
    collapseUiForActiveHouse,
    resetUiForIdleState
  };
}
