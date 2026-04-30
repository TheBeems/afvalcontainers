export const CONTAINER_TYPE_LABELS = {
  rest: 'Rest',
  'semi-rest': 'Semi-rest',
  gfe: 'GFE'
};

export const CONTAINER_STATUS_LABELS = {
  new: 'Nieuw',
  existing: 'Bestaand'
};

export const CONTAINER_CATEGORIES = {
  'new:rest': {
    label: 'Nieuw rest',
    borderColor: '#ef1d1d',
    fillColor: '#fee2e2'
  },
  'existing:rest': {
    label: 'Bestaand rest',
    borderColor: '#111111',
    fillColor: '#f8fafc'
  },
  'new:semi-rest': {
    label: 'Nieuw semi-rest',
    borderColor: '#b91bb8',
    fillColor: '#f3e8ff'
  },
  'new:gfe': {
    label: 'Nieuw GFE',
    borderColor: '#18bf20',
    fillColor: '#dcfce7'
  }
};

export const VALID_CONTAINER_TYPES = new Set(Object.keys(CONTAINER_TYPE_LABELS));
export const VALID_CONTAINER_STATUSES = new Set(Object.keys(CONTAINER_STATUS_LABELS));
export const VALID_CONTAINER_CATEGORIES = new Set(Object.keys(CONTAINER_CATEGORIES));
export const CONTAINER_ID_PATTERN = /^WH\d{2}$/;
export const DEFAULT_CONTAINER_TYPE = 'rest';
export const DEFAULT_CONTAINER_STATUS = 'new';
export const PRIVATE_ACCESS_SCOPE = 'private';
export const MANUAL_CONTAINER_ACCURACY = 'handmatig bepaald (zeer hoog, onzekerheid -1 m)';

function getContainerIdNumber(id) {
  const match = String(id || '').match(CONTAINER_ID_PATTERN);
  return match ? Number(match[0].slice(2)) : null;
}

export function compareContainerIds(leftId, rightId) {
  const leftNumber = getContainerIdNumber(leftId);
  const rightNumber = getContainerIdNumber(rightId);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  if (leftNumber !== null && rightNumber === null) {
    return -1;
  }

  if (leftNumber === null && rightNumber !== null) {
    return 1;
  }

  return String(leftId || '').localeCompare(String(rightId || ''), 'en', { numeric: true });
}

export function compareContainersById(left, right) {
  return compareContainerIds(left?.id, right?.id);
}

export function sortContainersById(containers) {
  return [...containers].sort(compareContainersById);
}

export function cloneContainerAccess(access) {
  if (!access || typeof access !== 'object') {
    return null;
  }

  return {
    scope: access.scope,
    label: access.label,
    allowedAddressRange: access.allowedAddressRange
      ? { ...access.allowedAddressRange }
      : undefined
  };
}

export function hasPrivateContainerAccess(container) {
  return container?.access?.scope === PRIVATE_ACCESS_SCOPE;
}

export function getContainerAccessLabel(container) {
  return hasPrivateContainerAccess(container)
    ? container.access.label || 'Privé'
    : '';
}

export function normalizeContainerType(type) {
  return VALID_CONTAINER_TYPES.has(type) ? type : DEFAULT_CONTAINER_TYPE;
}

export function formatContainerType(type) {
  return CONTAINER_TYPE_LABELS[normalizeContainerType(type)];
}

export function hasExplicitContainerStatus(container) {
  return Object.prototype.hasOwnProperty.call(container, 'status')
    && container.status !== null
    && container.status !== undefined
    && String(container.status).trim() !== '';
}

export function normalizeContainerStatus(status) {
  return VALID_CONTAINER_STATUSES.has(status) ? status : DEFAULT_CONTAINER_STATUS;
}

export function getContainerCategory(container) {
  const type = normalizeContainerType(container.type);
  const status = hasExplicitContainerStatus(container)
    ? normalizeContainerStatus(container.status)
    : DEFAULT_CONTAINER_STATUS;
  const key = `${status}:${type}`;

  if (CONTAINER_CATEGORIES[key]) {
    return {
      type,
      status,
      ...CONTAINER_CATEGORIES[key]
    };
  }

  return {
    type,
    status: DEFAULT_CONTAINER_STATUS,
    ...CONTAINER_CATEGORIES[`${DEFAULT_CONTAINER_STATUS}:${type}`]
  };
}

export function formatContainerCategory(container) {
  return getContainerCategory(container).label;
}
