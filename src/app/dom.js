export function getElements() {
  return {
    sidebar: document.getElementById('app-sidebar'),
    mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
    mobileSidebarOverlay: document.getElementById('mobile-sidebar-overlay'),
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
    objectionModal: document.getElementById('objection-modal'),
    objectionDialog: document.getElementById('objection-dialog'),
    objectionCloseButton: document.getElementById('objection-close-button'),
    objectionAddressSummary: document.getElementById('objection-address-summary'),
    objectionError: document.getElementById('objection-error'),
    objectionPersonalNote: document.getElementById('objection-personal-note'),
    objectionName: document.getElementById('objection-name'),
    objectionAddressLine: document.getElementById('objection-address-line'),
    objectionCity: document.getElementById('objection-city'),
    objectionGeneratedText: document.getElementById('objection-generated-text'),
    objectionMailtoButton: document.getElementById('objection-mailto-button'),
    objectionCopyButton: document.getElementById('objection-copy-button'),
    objectionRegenerateButton: document.getElementById('objection-regenerate-button'),
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
