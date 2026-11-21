import { RESIDENTIAL_RADIUS_METERS } from '../../shared/coverage.js';
import { createWalkingDistanceRange } from './walking-distance-range.js';

const CONTAINER_ADDRESS_THRESHOLD = 100;

const COVERAGE_FILTERS = {
  'outside-radius': {
    requiresRadiusData: true,
    matches: (house) => house.withinResidentialRadius === false
  },
  'walking-distance': {
    usesWalkingRange: true,
    matches: ({ walkingDistance }, _api, { min, max }) => Number.isFinite(walkingDistance)
      && Math.max(0, walkingDistance) >= min && walkingDistance <= max
  },
  detour: {
    requiresRadiusData: true,
    matches: (house) => house.withinResidentialRadius === true
      && (house.coverageStatus === 'between_150_275' || house.coverageStatus === 'over_275')
  },
  unreachable: {
    hideWhenEmpty: true,
    matches: (house) => house.coverageStatus === 'unreachable'
  },
  'container-address-count': {
    target: 'containers',
    matches: (container, api) => (api.getAssignedHouseCount(container) ?? 0) > CONTAINER_ADDRESS_THRESHOLD
  }
};

function getMatchingIds(activeFilters, target) {
  const filters = activeFilters.filter((filter) => filter.target === target);
  return filters.length ? new Set(filters.flatMap((filter) => filter.matchingIds)) : null;
}

export function createCoverageFilters(context, api) {
  const { elements, mapContext: { map, coverageOverviewLayer }, state } = context;
  const filters = Array.from(elements.coverageFilters.querySelectorAll('[data-coverage-filter]'), (button) => ({
    target: 'houses',
    ...COVERAGE_FILTERS[button.dataset.coverageFilter],
    button,
    count: button.querySelector('.coverage-filter-count'),
    active: false,
    matchingIds: null
  }));
  const walkingFilter = filters.find((filter) => filter.usesWalkingRange);
  const walkingRange = createWalkingDistanceRange(
    elements.coverageFilters.querySelector('#walking-distance-controls'),
    () => {
      refreshFilterMatches(walkingFilter, true);
      walkingFilter.active = true;
      applyFilters();
    }
  );
  const openButtonText = elements.coverageFiltersToggle.textContent.trim();

  function getFilterStatus() {
    if (state.placeLoadStatus === 'error') {
      return 'De knelpunten konden niet worden geladen.';
    }
    if (state.placeLoadStatus !== 'ready') {
      return 'Adresgegevens worden geladen…';
    }
    if (state.houses.length === 0) {
      return 'Voor dit dorp is geen huizenanalyse beschikbaar.';
    }
    const counts = [];
    for (const [ids, singular, plural] of [
      [state.filteredHouseIds, 'adres', 'adressen'],
      [state.filteredContainerIds, 'container', 'containers']
    ]) {
      if (ids !== null) {
        counts.push(`${ids.size.toLocaleString('nl-NL')} ${ids.size === 1 ? singular : plural}`);
      }
    }
    return counts.length
      ? `${counts.join(' en ')} uitgelicht.`
      : 'Kies een of meer filters.';
  }

  function syncFilters() {
    const activeFilters = filters.filter((filter) => filter.active && filter.matchingIds !== null);
    state.filteredHouseIds = getMatchingIds(activeFilters, 'houses');
    state.filteredContainerIds = getMatchingIds(activeFilters, 'containers');

    for (const { button, active } of filters) {
      button.setAttribute('aria-pressed', String(active));
    }
    elements.clearCoverageFilters.disabled = activeFilters.length === 0;
    const status = getFilterStatus();
    if (elements.coverageFilterStatus.textContent !== status) {
      elements.coverageFilterStatus.textContent = status;
    }
  }

  function refreshFilterMatches(filter, available) {
    const range = filter.usesWalkingRange ? walkingRange.getBounds() : null;
    filter.matchingIds = available && (!filter.usesWalkingRange || range)
      ? state[filter.target].filter((item) => filter.matches(item, api, range)).map((item) => item.id)
      : null;
    const count = filter.matchingIds?.length;
    filter.button.disabled = count === undefined;
    filter.count.textContent = count?.toLocaleString('nl-NL') ?? '–';

    if (filter.hideWhenEmpty) {
      filter.button.hidden = !count;
      if (count === 0) {
        filter.active = false;
      }
    }
  }

  function refreshCoverageFilters(target) {
    const hasHouses = state.placeLoadStatus === 'ready' && state.houses.length > 0;
    const hasRadiusData = target !== 'containers' && hasHouses
      && state.houses.every((house) => typeof house.withinResidentialRadius === 'boolean');
    if (target !== 'containers') {
      walkingRange.setHouses(hasHouses ? state.houses : []);
    }

    for (const filter of filters) {
      if (target && filter.target !== target) {
        continue;
      }
      const available = hasHouses && (!filter.requiresRadiusData || hasRadiusData);
      refreshFilterMatches(filter, available);

      if (hasHouses && filter.matchingIds === null) {
        filter.active = false;
        filter.button.title = filter.usesWalkingRange
          ? 'Berekende loopafstanden zijn voor dit dorp niet beschikbaar.'
          : 'Hemelsbrede gegevens zijn voor dit dorp niet beschikbaar.';
      } else {
        filter.button.removeAttribute('title');
      }
    }

    syncFilters();
  }

  function applyFilters() {
    syncFilters();
    api.syncHouseMarkerStyles();
    api.syncHouseLayerVisibility();
    api.syncContainerMarkerStyles();
  }

  function clearFilters() {
    for (const filter of filters) {
      filter.active = false;
    }
    walkingRange.reset();
    refreshFilterMatches(walkingFilter, true);
    applyFilters();
  }

  function toggleFilterView() {
    const showFilters = elements.coverageFilters.hidden;
    elements.sidebarOverview.hidden = showFilters;
    elements.coverageFilters.hidden = !showFilters;
    elements.coverageFiltersToggle.setAttribute('aria-expanded', String(showFilters));
    elements.coverageFiltersToggle.textContent = showFilters ? 'Terug naar overzicht' : openButtonText;

    if (!showFilters) {
      clearFilters();
    }
  }

  function toggleCoverageCircles() {
    const showCircles = !map.hasLayer(coverageOverviewLayer);
    if (showCircles) {
      coverageOverviewLayer.addTo(map);
      api.fitCoverageOverview();
    } else {
      coverageOverviewLayer.remove();
    }
    elements.coverageCirclesToggle.setAttribute('aria-pressed', String(showCircles));
  }

  function bindCoverageFilterEvents() {
    walkingRange.bind();
    elements.coverageFilters.querySelector('#container-address-threshold').textContent = CONTAINER_ADDRESS_THRESHOLD.toLocaleString('nl-NL');
    elements.coverageCirclesToggle.querySelector('#coverage-circles-radius').textContent = RESIDENTIAL_RADIUS_METERS;
    elements.coverageCirclesToggle.addEventListener('click', toggleCoverageCircles);
    elements.coverageCirclesToggle.disabled = false;
    elements.coverageFiltersToggle.addEventListener('click', toggleFilterView);
    elements.coverageFiltersToggle.disabled = false;

    for (const filter of filters) {
      filter.button.addEventListener('click', () => {
        filter.active = !filter.active;
        applyFilters();
      });
    }

    elements.clearCoverageFilters.addEventListener('click', () => {
      const firstActiveButton = filters.find((filter) => filter.active)?.button;
      clearFilters();
      firstActiveButton?.focus();
    });
    elements.coverageFiltersShowMap.addEventListener('click', () => {
      api.closeMobileSidebar({ restoreFocus: true });
    });
  }

  return { bindCoverageFilterEvents, refreshCoverageFilters };
}
