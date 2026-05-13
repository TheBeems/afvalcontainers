export function getElements() {
  return {
    sidebar: document.getElementById('app-sidebar'),
    mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
    mobileSidebarOverlay: document.getElementById('mobile-sidebar-overlay'),
    sidebarHeaderPanel: document.getElementById('sidebar-header-panel'),
    appTitle: document.getElementById('app-title'),
    placeNameElements: document.querySelectorAll('[data-place-name]'),
    placeSourceLink: document.getElementById('place-source-link'),
    storyLongDistancePercent: document.getElementById('story-long-distance-percent'),
    storyLongDistanceCount: document.getElementById('story-long-distance-count'),
    storyTotalAddressCount: document.getElementById('story-total-address-count'),
    storyOverReferenceCount: document.getElementById('story-over-reference-count'),
    introLongDistanceCount: document.getElementById('intro-long-distance-count'),
    introTotalAddressCount: document.getElementById('intro-total-address-count'),
    introLongDistancePercent: document.getElementById('intro-long-distance-percent'),
    introOverReferenceText: document.getElementById('intro-over-reference-text'),
    placeSelect: document.getElementById('place-select'),
    coverageStatus: document.getElementById('coverage-status'),
    coverageSummary: document.getElementById('coverage-summary'),
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
