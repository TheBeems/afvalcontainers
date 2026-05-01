import {
  HOUSE_CIRCLE_RADIUS,
  HOUSE_MARKER_FILL_OPACITY,
  HOUSE_MARKER_MIN_ZOOM,
  HOUSE_MARKER_MUTED_FILL_OPACITY,
  SEARCH_FOCUS_ZOOM,
  getRouteStyle
} from '../config.js';
import {
  getCoverageStatus,
  getWalkingDistanceColor
} from '../../shared/coverage.js';
import { isContainerAllowedForHouse } from '../../shared/address.js';
import { getContainerAccessLabel, hasRestafvalStream } from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';
import { formatDuration, formatMeters } from '../../shared/format.js';
import { isValidRouteGeometry } from '../../shared/geometry.js';

export function createHouseSelection(context, api) {
  const { elements, mapContext, state } = context;
  const {
    houseLayer,
    houseRenderer,
    map,
    resultLayer,
    resultRenderer,
    routeLayer,
    routeRenderer,
    selectionLayer,
    selectionRenderer
  } = mapContext;

  function renderHouseMarkers() {
    houseLayer.clearLayers();

    for (const house of state.houses) {
      const marker = L.circleMarker([house.lat, house.lon], {
        renderer: houseRenderer,
        radius: HOUSE_CIRCLE_RADIUS,
        weight: 1,
        color: '#ffffff',
        fillColor: getCoverageStatus(house.coverageStatus).color,
        fillOpacity: HOUSE_MARKER_FILL_OPACITY
      });

      marker.on('click', () => selectHouse(house));
      houseLayer.addLayer(marker);
    }
  }

  function setHouseLayerMuted(isMuted) {
    houseLayer.eachLayer((marker) => {
      if (typeof marker.setStyle === 'function') {
        marker.setStyle({
          weight: isMuted ? 0 : 1,
          fillOpacity: isMuted ? HOUSE_MARKER_MUTED_FILL_OPACITY : HOUSE_MARKER_FILL_OPACITY
        });
      }

      if (typeof marker.setRadius === 'function') {
        marker.setRadius(isMuted ? Math.max(3, HOUSE_CIRCLE_RADIUS - 1) : HOUSE_CIRCLE_RADIUS);
      }
    });
  }

  function syncHouseLayerVisibility() {
    const shouldShowHouses = state.houses.length > 0 && map.getZoom() >= HOUSE_MARKER_MIN_ZOOM;

    if (shouldShowHouses && !map.hasLayer(houseLayer)) {
      houseLayer.addTo(map);
    } else if (!shouldShowHouses && map.hasLayer(houseLayer)) {
      map.removeLayer(houseLayer);
    }

    if (!state.selectedHouse) {
      renderIdleHouseState();
    }
  }

  function resetHouseSelectionVisuals() {
    map.closePopup();
    selectionLayer.clearLayers();
    resultLayer.clearLayers();
    routeLayer.clearLayers();
    renderHouseMapInfo(null);
    setHouseLayerMuted(false);
    state.selectedHouseMarker = null;
  }

  function clearHouseSelection() {
    state.selectedHouse = null;
    resetHouseSelectionVisuals();
    renderIdleHouseState();
  }

  function renderIdleHouseState() {
    api.resetUiForIdleState();

    elements.houseSummary.hidden = true;
    elements.houseSummary.innerHTML = '';

    elements.houseDetails.hidden = false;
    elements.houseDetails.innerHTML = '<div class="empty-state">Klik op een huispunt of zoek je adres om de dekking en routes te bekijken.</div>';

    if (!state.coverage || state.houses.length === 0) {
      api.setCoverageStatus('Geen vooraf berekende huizenlaag beschikbaar.', 'error');
      return;
    }

    if (map.getZoom() < HOUSE_MARKER_MIN_ZOOM) {
      api.setCoverageStatus(`Zoom in tot niveau ${HOUSE_MARKER_MIN_ZOOM} om de huizenlaag te tonen. De batchsamenvatting blijft zichtbaar.`);
      return;
    }

    api.setCoverageStatus(`Klik op een huispunt om de opgeslagen dekking en maximaal 3 looproutes te zien. ${state.houses.length.toLocaleString('nl-NL')} adressen binnen de bebouwde kom geladen.`);
  }

  function renderHouseSummary(house, ranking) {
    const postcode = house.postcode ? `${house.postcode} ` : '';
    const coverageStatus = api.getHouseCoverageStatus(house, ranking);

    elements.houseSummary.hidden = false;
    elements.houseSummary.open = true;

    elements.houseSummary.innerHTML = `
      <summary>
        <span class="house-summary-heading">
          <span class="house-summary-title">Geselecteerd adres</span>
          <span class="house-address">${escapeHtml(house.address)}</span>
          <span class="house-meta">${escapeHtml(postcode)}${escapeHtml(house.city || api.getActivePlaceCity())}</span>
        </span>
        ${buildStatusBadge(coverageStatus)}
      </summary>

      <div class="sidebar-collapsible-body selected-house-body">
        ${buildMainResultCard(house, ranking)}
        ${buildAlternativeContainersMarkup(ranking)}
        ${buildMeasurementDetails(house, ranking)}
      </div>
    `;
  }

  function buildStatusBadge(status) {
    const coverageStatus = getCoverageStatus(status);
    return `<span class="status-badge" style="background:${coverageStatus.color}">${escapeHtml(coverageStatus.label)}</span>`;
  }

  function buildMainResultCard(house, ranking) {
    const nearest = ranking[0] || null;

    const walkingDistance = nearest?.walkingDistance ?? house.walkingDistance;
    const walkingDuration = nearest?.walkingDuration ?? house.walkingDuration;
    const straightDistance = nearest?.straightDistance ?? house.straightDistance;
    const coverageStatus = nearest?.coverageStatus ?? house.coverageStatus;

    const containerText = api.buildContainerTitleMarkup(nearest);

    const resultColor = getCoverageStatus(coverageStatus).color;

    return `
      <section class="selected-result-card" style="--result-color:${resultColor}" aria-label="Belangrijkste resultaat">
        <span class="selected-result-kicker">Dichtstbijzijnde container</span>

        <div class="selected-result-distance">
          ${escapeHtml(formatMeters(walkingDistance))}
          <span>- ${escapeHtml(formatDuration(walkingDuration))}</span>
        </div>

        <div class="selected-result-destination">
          naar ${containerText}
        </div>

        <div class="selected-result-sub">
          Hemelsbreed: ${escapeHtml(formatMeters(straightDistance))}
        </div>
      </section>
    `;
  }

  function buildAlternativeContainersMarkup(ranking) {
    const alternatives = ranking.slice(1, 3);

    if (alternatives.length === 0) {
      return '';
    }

    return `
      <section class="detail-section">
        <h3 class="detail-section-title">Andere containers in de buurt</h3>

        <div class="ranking-list ranking-list-compact">
          ${alternatives.map((container, index) => {
            const rank = index + 2;
            const color = getWalkingDistanceColor(container.walkingDistance);

            return `
              <div class="ranking-item">
                <span class="ranking-rank" style="--rank-color:${color}">${rank}</span>
                <div>
                  <div class="ranking-title">
                    ${api.buildContainerTitleMarkup(container)}
                  </div>
                  <div class="ranking-meta">
                    ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}
                    · hemelsbreed ${escapeHtml(formatMeters(container.straightDistance))}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function buildMeasurementRow(label, value) {
    return `
      <div class="measurement-row">
        <span>${escapeHtml(label)}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function buildMeasurementDetails(house, ranking) {
    const nearest = ranking[0] || null;
    const routeDisplay = nearest ? api.getRouteDisplay(house, nearest) : null;

    const routeText = routeDisplay
      ? `${escapeHtml(routeDisplay.label)}${routeDisplay.details ? ` (${escapeHtml(routeDisplay.details)})` : ''}`
      : 'Geen routegegevens';

    const analysisError = house.analysisError
      ? buildMeasurementRow('Opmerking', escapeHtml(house.analysisError))
      : '';
    const accessLabel = getContainerAccessLabel(nearest);
    const accessRow = accessLabel
      ? buildMeasurementRow('Toegang', escapeHtml(accessLabel))
      : '';

    return `
      <details class="measurement-details">
        <summary>Meetdetails en nauwkeurigheid</summary>

        <div class="measurement-list">
          ${buildMeasurementRow('Nauwkeurigheid locatie', escapeHtml(nearest?.accuracy || 'onbekend'))}
          ${accessRow}
          ${buildMeasurementRow('Routegegevens', routeText)}
          ${analysisError}
        </div>
      </details>
    `;
  }

  function highlightRanking(ranking) {
    resultLayer.clearLayers();

    for (const [index, container] of ranking.slice(0, 3).entries()) {
      const storedContainer = state.containersById.get(container.id);
      if (!storedContainer) {
        continue;
      }

      const color = getWalkingDistanceColor(container.walkingDistance);
      const latLng = [storedContainer.lat, storedContainer.lon];

      L.circleMarker(latLng, {
        renderer: resultRenderer,
        radius: 13,
        color,
        weight: 3,
        fillColor: color,
        fillOpacity: 0.08,
        interactive: false
      }).addTo(resultLayer);

      L.marker(latLng, {
        pane: 'resultMarkerPane',
        icon: L.divIcon({
          className: 'route-rank-marker',
          html: `<span style="--rank-color:${color}">${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        interactive: false
      }).addTo(resultLayer);
    }
  }

  function drawRoutes(house, ranking) {
    routeLayer.clearLayers();
    const routeCounts = {
      stored: 0,
      live: 0,
      drawn: 0,
      pending: 0,
      failed: 0,
      missing: 0
    };

    for (const [index, container] of ranking.entries()) {
      let routeGeometry = null;
      let isLiveRoute = false;

      if (container.routeSource === 'live' && api.hasRouteGeometry(container)) {
        routeGeometry = container.routeGeometry;
        isLiveRoute = true;
        routeCounts.live += 1;
      } else if (api.hasRouteGeometry(container)) {
        routeGeometry = container.routeGeometry;
        routeCounts.stored += 1;
      } else {
        const liveRoute = api.getLiveRouteState(house, container);
        if (liveRoute?.status === 'fulfilled' && isValidRouteGeometry(liveRoute.routeGeometry)) {
          routeGeometry = liveRoute.routeGeometry;
          isLiveRoute = true;
          routeCounts.live += 1;
        } else if (liveRoute?.status === 'pending') {
          routeCounts.pending += 1;
        } else if (liveRoute?.status === 'rejected') {
          routeCounts.failed += 1;
        } else {
          routeCounts.missing += 1;
        }
      }

      if (!routeGeometry) {
        continue;
      }

      const routeStyle = getRouteStyle(index);

      L.polyline(routeGeometry, {
        renderer: routeRenderer,
        color: getWalkingDistanceColor(container.walkingDistance),
        weight: routeStyle.weight,
        opacity: routeStyle.opacity,
        dashArray: isLiveRoute ? '8 6' : null,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      }).addTo(routeLayer);
      routeCounts.drawn += 1;
    }

    return routeCounts;
  }

  function buildCompactRankingMarkup(ranking) {
    const topThree = ranking.slice(0, 3);

    if (topThree.length === 0) {
      return '<div class="house-map-info-empty">Geen container-ranking opgeslagen.</div>';
    }

    return `
      <ol class="house-map-ranking">
        ${topThree.map((container, index) => `
          <li>
            <span class="ranking-rank" style="--rank-color:${getWalkingDistanceColor(container.walkingDistance)}">${index + 1}</span>
            <div>
              <div class="house-map-ranking-title">
                ${api.buildContainerTitleMarkup(container)}
              </div>
              <div class="house-map-ranking-meta">
                ${escapeHtml(formatMeters(container.walkingDistance))} - ${escapeHtml(formatDuration(container.walkingDuration))}
              </div>
            </div>
          </li>
        `).join('')}
      </ol>
    `;
  }

  function renderHouseMapInfo(house, ranking = []) {
    if (!elements.houseMapInfo) {
      return;
    }

    if (!house) {
      elements.houseMapInfo.hidden = true;
      elements.houseMapInfo.innerHTML = '';
      return;
    }

    const postcode = house.postcode ? `${house.postcode} ` : '';

    elements.houseMapInfo.hidden = false;
    elements.houseMapInfo.open = !state.houseInfoCollapsed;
    elements.houseMapInfo.innerHTML = `
      <summary>
        <span class="house-map-info-address">${escapeHtml(house.address)}</span>
      </summary>

      <div class="map-collapsible-body">
        <div class="house-map-info-meta">${escapeHtml(postcode)}${escapeHtml(house.city || api.getActivePlaceCity())}</div>
        ${buildCompactRankingMarkup(ranking)}
      </div>
    `;
  }

  function renderSelectedHouseMarker(house, coverageStatus) {
    selectionLayer.clearLayers();

    if (!Number.isFinite(house.lat) || !Number.isFinite(house.lon)) {
      state.selectedHouseMarker = null;
      return;
    }

    const selectedHouseColor = getCoverageStatus(coverageStatus).color;
    const selectedHouseLatLng = [house.lat, house.lon];

    L.circleMarker(selectedHouseLatLng, {
      renderer: selectionRenderer,
      radius: 15,
      color: '#ffffff',
      weight: 5,
      fillColor: selectedHouseColor,
      fillOpacity: 0.18,
      interactive: false
    }).addTo(selectionLayer);

    state.selectedHouseMarker = L.circleMarker(selectedHouseLatLng, {
      renderer: selectionRenderer,
      radius: 7,
      color: '#0f172a',
      weight: 3,
      fillColor: selectedHouseColor,
      fillOpacity: 1,
      interactive: false
    }).addTo(selectionLayer);

    state.selectedHouseMarker.bringToFront();
  }

  function getChangedContainerLiveRouteStatus(house) {
    const status = {
      fulfilled: 0,
      pending: 0,
      missing: 0,
      failed: 0
    };

    for (const container of api.getChangedContainers()
      .filter(api.requiresLiveContainerRoute)
      .filter(hasRestafvalStream)
      .filter((changedContainer) => isContainerAllowedForHouse(house, changedContainer))) {
      if (!api.canFetchLiveRoute(house, container)) {
        status.failed += 1;
        continue;
      }

      const liveRoute = api.getLiveRouteState(house, container);
      if (!liveRoute) {
        status.missing += 1;
      } else if (liveRoute.status === 'fulfilled') {
        status.fulfilled += 1;
      } else if (liveRoute.status === 'pending') {
        status.pending += 1;
      } else {
        status.failed += 1;
      }
    }

    return status;
  }

  function renderHouseSelection(house, ranking) {
    renderSelectedHouseMarker(house, api.getHouseCoverageStatus(house, ranking));
    renderHouseSummary(house, ranking);
    renderHouseMapInfo(house, ranking);

    const routeCounts = drawRoutes(house, ranking);
    const changedRouteStatus = getChangedContainerLiveRouteStatus(house);
    const changedRouteWaiting = changedRouteStatus.pending + changedRouteStatus.missing;

    elements.houseDetails.hidden = true;
    elements.houseDetails.innerHTML = '';

    highlightRanking(ranking);

    if (routeCounts.pending > 0 || changedRouteWaiting > 0) {
      api.setCoverageStatus('Adres geselecteerd: de looproutes worden geladen.', 'loading');
      return routeCounts;
    }

    if (routeCounts.drawn > 0) {
      const routeText = routeCounts.drawn === 1
        ? '1 looproute is zichtbaar'
        : `${routeCounts.drawn} looproutes zijn zichtbaar`;

      if (changedRouteStatus.failed > 0) {
        api.setCoverageStatus(
          `Adres geselecteerd: ${routeText} op de kaart. ${changedRouteStatus.failed} live afstand(en) konden niet worden opgehaald.`,
          'error'
        );
        return routeCounts;
      }

      api.setCoverageStatus(`Adres geselecteerd: ${routeText} op de kaart.`, 'success');
      return routeCounts;
    }

    if (routeCounts.failed > 0 || changedRouteStatus.failed > 0) {
      api.setCoverageStatus('Adres geselecteerd, maar de looproutes konden niet worden getoond.', 'error');
      return routeCounts;
    }

    api.setCoverageStatus('Adres geselecteerd, maar voor dit adres zijn nog geen routegegevens beschikbaar.', 'error');
    return routeCounts;
  }

  function getLiveRouteRequests(house, ranking) {
    const requests = new Map();

    function addRequest(container) {
      if (!hasRestafvalStream(container)) {
        return;
      }

      if (!isContainerAllowedForHouse(house, container)) {
        return;
      }

      if (!api.canFetchLiveRoute(house, container)) {
        return;
      }

      const liveRoute = api.getLiveRouteState(house, container);
      if (liveRoute?.status === 'fulfilled' || liveRoute?.status === 'rejected') {
        return;
      }

      requests.set(api.getLiveRouteKey(house, container), api.getCurrentContainer(container));
    }

    for (const container of api.getChangedContainers()
      .filter(api.requiresLiveContainerRoute)
      .filter(hasRestafvalStream)
      .filter((changedContainer) => isContainerAllowedForHouse(house, changedContainer))) {
      addRequest(container);
    }

    for (const container of ranking) {
      if (!api.hasRouteGeometry(container)) {
        addRequest(container);
      }
    }

    return Array.from(requests.values());
  }

  function loadMissingLiveRoutes(house, selectionId) {
    const requests = getLiveRouteRequests(house, api.getCurrentRanking(house));

    if (requests.length === 0) {
      return;
    }

    for (const container of requests) {
      api.loadLiveRoute(house, container).then(() => {
        if (state.houseSelectionId !== selectionId || state.selectedHouse?.id !== house.id) {
          return;
        }

        renderHouseSelection(house, api.getCurrentRanking(house));
      });
    }

    renderHouseSelection(house, api.getCurrentRanking(house));
  }

  function focusHouseOnMap(house) {
    if (!Number.isFinite(house.lat) || !Number.isFinite(house.lon)) {
      return;
    }

    map.setView(
      [house.lat, house.lon],
      Math.max(map.getZoom(), SEARCH_FOCUS_ZOOM),
      { animate: true }
    );
  }

  function refreshSelectedHouseLiveState() {
    if (!state.selectedHouse) {
      return;
    }

    state.houseSelectionId += 1;
    const selectionId = state.houseSelectionId;
    const ranking = api.getCurrentRanking(state.selectedHouse);
    renderHouseSelection(state.selectedHouse, ranking);
    loadMissingLiveRoutes(state.selectedHouse, selectionId);
  }

  function selectHouse(house, { focusMap = true } = {}) {
    const isNewHouse = state.selectedHouse?.id !== house.id;

    state.selectedHouse = house;
    state.houseSelectionId += 1;

    if (isNewHouse) {
      state.houseInfoCollapsed = false;
    }

    api.collapseUiForActiveHouse();

    const selectionId = state.houseSelectionId;
    resetHouseSelectionVisuals();
    setHouseLayerMuted(false);

    const ranking = api.getCurrentRanking(house);

    renderHouseSelection(house, ranking);
    loadMissingLiveRoutes(house, selectionId);

    if (focusMap) {
      focusHouseOnMap(house);
    }
  }

  return {
    renderHouseMarkers,
    setHouseLayerMuted,
    syncHouseLayerVisibility,
    resetHouseSelectionVisuals,
    clearHouseSelection,
    renderIdleHouseState,
    renderHouseSummary,
    buildStatusBadge,
    buildMainResultCard,
    buildAlternativeContainersMarkup,
    buildMeasurementRow,
    buildMeasurementDetails,
    highlightRanking,
    drawRoutes,
    buildCompactRankingMarkup,
    renderHouseMapInfo,
    renderSelectedHouseMarker,
    getChangedContainerLiveRouteStatus,
    renderHouseSelection,
    getLiveRouteRequests,
    loadMissingLiveRoutes,
    focusHouseOnMap,
    refreshSelectedHouseLiveState,
    selectHouse
  };
}
