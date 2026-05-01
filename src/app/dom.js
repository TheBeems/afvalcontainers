export function getElements() {
  return {
    sidebarHeaderPanel: document.getElementById('sidebar-header-panel'),
    appTitle: document.getElementById('app-title'),
    placeNameElements: document.querySelectorAll('[data-place-name]'),
    placeSourceLink: document.getElementById('place-source-link'),
    placeSelect: document.getElementById('place-select'),
    coverageStatus: document.getElementById('coverage-status'),
    coverageSummaryPanel: document.getElementById('coverage-summary-panel'),
    coverageSummary: document.getElementById('coverage-summary'),
    houseSummary: document.getElementById('house-summary'),
    houseDetails: document.getElementById('house-details'),
    containerList: document.getElementById('container-list'),
    mapShell: document.querySelector('.map-shell'),
    mapLegend: null,
    containerMarkerLegend: null,
    mapInfoStack: null,
    containerMapInfo: null,
    houseMapInfo: null,
    containerEditor: null,
    containerEditorToggle: null,
    containerEditorBadge: null,
    containerEditorPanel: null,
    containerEditorStatus: null,
    containerChangeCount: null,
    containerChangeList: null,
    containerEditPanel: null,
    addContainerButton: null,
    downloadContainersButton: null,
    resetContainersButton: null
  };
}

export function setDetailsOpen(element, isOpen) {
  if (element && 'open' in element) {
    element.open = isOpen;
  }
}
