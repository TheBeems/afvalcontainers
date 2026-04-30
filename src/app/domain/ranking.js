import { classifyCoverageStatus } from '../../shared/coverage.js';
import { isContainerAllowedForHouse } from '../../shared/address.js';
import {
  getContainerAnalysisStatus,
  getContainerAnalysisType,
  hasRestafvalStream
} from '../../shared/containers.js';
import { haversineMeters, roundMetric } from '../../shared/geometry.js';

export function createRanking(context, api) {
  const { state } = context;

  function shouldIgnoreStoredContainerId(house, containerId) {
    const container = state.containersById.get(containerId);
    return !container
      || !hasRestafvalStream(container)
      || api.requiresLiveContainerRoute(container)
      || !isContainerAllowedForHouse(house, container);
  }

  function mergeStoredContainerEntry(entry) {
    const currentContainer = state.containersById.get(entry.id);
    return {
      ...entry,
      ...(currentContainer ? {
        id: currentContainer.id,
        address: currentContainer.address,
        accuracy: currentContainer.accuracy,
        type: getContainerAnalysisType(currentContainer),
        status: getContainerAnalysisStatus(currentContainer),
        streams: currentContainer.streams,
        ...(currentContainer.access ? { access: currentContainer.access } : {}),
        lat: currentContainer.lat,
        lon: currentContainer.lon,
        clientKey: currentContainer.clientKey
      } : {}),
      routeSource: 'stored'
    };
  }

  function getStoredRanking(house) {
    if (Array.isArray(house.nearestContainers) && house.nearestContainers.length > 0) {
      return house.nearestContainers
        .filter((entry) => !shouldIgnoreStoredContainerId(house, entry.id))
        .map(mergeStoredContainerEntry);
    }

    if (!house.nearestContainerId || shouldIgnoreStoredContainerId(house, house.nearestContainerId)) {
      return [];
    }

    return [mergeStoredContainerEntry({
      id: house.nearestContainerId,
      address: house.nearestContainerAddress,
      accuracy: house.nearestContainerAccuracy,
      straightDistance: house.straightDistance,
      walkingDistance: house.walkingDistance,
      walkingDuration: house.walkingDuration,
      coverageStatus: house.coverageStatus
    })];
  }

  function buildLiveContainerRankingEntry(house, container, liveRoute) {
    const straightDistance = haversineMeters(house.lat, house.lon, container.lat, container.lon);
    const walkingDistance = roundMetric(liveRoute.walkingDistance);

    return {
      id: container.id,
      address: container.address,
      accuracy: container.accuracy,
      type: getContainerAnalysisType(container),
      status: getContainerAnalysisStatus(container),
      streams: container.streams,
      ...(container.access ? { access: container.access } : {}),
      lat: container.lat,
      lon: container.lon,
      clientKey: container.clientKey,
      straightDistance: roundMetric(straightDistance),
      walkingDistance,
      walkingDuration: roundMetric(liveRoute.walkingDuration),
      coverageStatus: classifyCoverageStatus(walkingDistance),
      routeGeometry: liveRoute.routeGeometry || [],
      routeError: null,
      routeSource: 'live'
    };
  }

  function getLiveEditedRankingEntries(house) {
    return api.getChangedContainers()
      .filter(api.requiresLiveContainerRoute)
      .filter(hasRestafvalStream)
      .filter((container) => isContainerAllowedForHouse(house, container))
      .map((container) => {
        const liveRoute = api.getLiveRouteState(house, container);
        if (liveRoute?.status !== 'fulfilled') {
          return null;
        }

        return buildLiveContainerRankingEntry(house, container, liveRoute);
      })
      .filter(Boolean);
  }

  function sortRankingByWalkingDistance(ranking) {
    return ranking.sort((left, right) => {
      const leftDistance = Number.isFinite(left.walkingDistance) ? left.walkingDistance : Number.POSITIVE_INFINITY;
      const rightDistance = Number.isFinite(right.walkingDistance) ? right.walkingDistance : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    });
  }

  function getCurrentRanking(house) {
    return sortRankingByWalkingDistance([
      ...getStoredRanking(house),
      ...getLiveEditedRankingEntries(house)
    ]);
  }

  function getHouseCoverageStatus(house, ranking) {
    return ranking[0]?.coverageStatus || house.coverageStatus;
  }

  return {
    shouldIgnoreStoredContainerId,
    mergeStoredContainerEntry,
    getStoredRanking,
    buildLiveContainerRankingEntry,
    getLiveEditedRankingEntries,
    sortRankingByWalkingDistance,
    getCurrentRanking,
    getHouseCoverageStatus
  };
}
