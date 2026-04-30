import {
  cloneContainerAccess,
  DEFAULT_CONTAINER_STATUS,
  DEFAULT_CONTAINER_TYPE,
  formatContainerCategory,
  getContainerCategory,
  hasExplicitContainerStatus,
  normalizeContainerStatus,
  normalizeContainerType
} from '../../shared/containers.js';
import { roundCoordinate } from '../../shared/geometry.js';

export function createContainerStore(context) {
  const { state } = context;

  function createContainerClientKey() {
    const key = `container-${state.nextContainerClientKey}`;
    state.nextContainerClientKey += 1;
    return key;
  }

  function cloneContainer(container) {
    const cloned = {
      id: container.id,
      address: container.address,
      lat: container.lat,
      lon: container.lon,
      accuracy: container.accuracy,
      type: normalizeContainerType(container.type)
    };

    if (hasExplicitContainerStatus(container)) {
      cloned.status = normalizeContainerStatus(container.status);
    }

    const access = cloneContainerAccess(container.access);
    if (access) {
      cloned.access = access;
    }

    return cloned;
  }

  function cloneContainerForState(container, clientKey = createContainerClientKey()) {
    return {
      ...cloneContainer(container),
      clientKey
    };
  }

  function syncContainerIndex() {
    state.containersById = new Map(state.containers.map((container) => [container.id, container]));
    state.containersByKey = new Map(state.containers.map((container) => [container.clientKey, container]));
  }

  function setOriginalContainers(containers) {
    state.nextContainerClientKey = 1;
    state.originalContainers = containers.map((container) => cloneContainerForState(container));
    state.originalContainersById = new Map(state.originalContainers.map((container) => [container.id, container]));
    state.originalContainersByKey = new Map(state.originalContainers.map((container) => [container.clientKey, container]));
  }

  function normalizeContainerCoordinate(value) {
    return roundCoordinate(value);
  }

  function getContainerStoredStatus(container) {
    return hasExplicitContainerStatus(container) ? normalizeContainerStatus(container.status) : null;
  }

  function getContainerStoredAccess(container) {
    const access = cloneContainerAccess(container.access);
    return access ? JSON.stringify(access) : '';
  }

  function getOriginalContainer(container) {
    return state.originalContainersByKey.get(container.clientKey) || null;
  }

  function getContainerByKey(containerKey) {
    return state.containersByKey.get(containerKey) || null;
  }

  function getContainerIndexByKey(containerKey) {
    return state.containers.findIndex((container) => container.clientKey === containerKey);
  }

  function hasContainerChanged(container) {
    const original = getOriginalContainer(container);

    if (!original) {
      return true;
    }

    return original.address !== container.address
      || original.id !== container.id
      || original.accuracy !== container.accuracy
      || getContainerStoredAccess(original) !== getContainerStoredAccess(container)
      || getContainerStoredStatus(original) !== getContainerStoredStatus(container)
      || normalizeContainerType(original.type) !== normalizeContainerType(container.type)
      || normalizeContainerCoordinate(original.lat) !== normalizeContainerCoordinate(container.lat)
      || normalizeContainerCoordinate(original.lon) !== normalizeContainerCoordinate(container.lon);
  }

  function hasContainerLocationChanged(container) {
    const original = getOriginalContainer(container);
    if (!original) {
      return true;
    }

    return normalizeContainerCoordinate(original.lat) !== normalizeContainerCoordinate(container.lat)
      || normalizeContainerCoordinate(original.lon) !== normalizeContainerCoordinate(container.lon);
  }

  function hasContainerIdChanged(container) {
    const original = getOriginalContainer(container);
    return Boolean(original && original.id !== container.id);
  }

  function requiresLiveContainerRoute(container) {
    return !getOriginalContainer(container)
      || hasContainerIdChanged(container)
      || hasContainerLocationChanged(container);
  }

  function getChangedContainers() {
    return state.containers.filter(hasContainerChanged);
  }

  function getChangedContainerCount() {
    return getChangedContainers().length;
  }

  function getContainerChangeLabel(container) {
    const original = getOriginalContainer(container);
    if (!original) {
      return `${container.id} toegevoegd`;
    }

    const idChanged = original.id !== container.id;
    const locationChanged = hasContainerLocationChanged(container);
    const infoChanged = original.address !== container.address
      || getContainerStoredAccess(original) !== getContainerStoredAccess(container)
      || getContainerStoredStatus(original) !== getContainerStoredStatus(container)
      || normalizeContainerType(original.type) !== normalizeContainerType(container.type);

    if (idChanged) {
      return `${original.id} -> ${container.id}`;
    }

    if (locationChanged && infoChanged) {
      return `${container.id} verplaatst + info`;
    }

    if (locationChanged) {
      return `${container.id} verplaatst`;
    }

    return `${container.id} info gewijzigd`;
  }

  function serializeContainersForDownload() {
    return state.containers.map(cloneContainer);
  }

  function getNextContainerId() {
    for (let index = 1; index <= 99; index += 1) {
      const id = `WH${String(index).padStart(2, '0')}`;
      if (!state.containersById.has(id)) {
        return id;
      }
    }

    return 'WH99';
  }

  return {
    cloneContainer,
    cloneContainerForState,
    createContainerClientKey,
    syncContainerIndex,
    setOriginalContainers,
    normalizeContainerCoordinate,
    getContainerStoredStatus,
    getContainerStoredAccess,
    getContainerCategory,
    formatContainerCategory,
    getOriginalContainer,
    getContainerByKey,
    getContainerIndexByKey,
    hasContainerChanged,
    hasContainerLocationChanged,
    hasContainerIdChanged,
    requiresLiveContainerRoute,
    getChangedContainers,
    getChangedContainerCount,
    getContainerChangeLabel,
    serializeContainersForDownload,
    getNextContainerId,
    DEFAULT_CONTAINER_TYPE,
    DEFAULT_CONTAINER_STATUS
  };
}
