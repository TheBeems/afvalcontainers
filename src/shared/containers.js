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
  'existing:semi-rest': {
    label: 'Bestaand semi-rest',
    borderColor: '#6d28d9',
    fillColor: '#ede9fe'
  },
  'new:gfe': {
    label: 'Nieuw GFE',
    borderColor: '#18bf20',
    fillColor: '#dcfce7'
  },
  'existing:gfe': {
    label: 'Bestaand GFE',
    borderColor: '#047857',
    fillColor: '#d1fae5'
  }
};

export const VALID_CONTAINER_TYPES = new Set(Object.keys(CONTAINER_TYPE_LABELS));
export const VALID_CONTAINER_STATUSES = new Set(Object.keys(CONTAINER_STATUS_LABELS));
export const VALID_CONTAINER_CATEGORIES = new Set(Object.keys(CONTAINER_CATEGORIES));
export const RESTAFVAL_CONTAINER_TYPES = new Set(['rest', 'semi-rest']);
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

export function createDefaultContainerStream() {
  return {
    type: DEFAULT_CONTAINER_TYPE,
    status: DEFAULT_CONTAINER_STATUS
  };
}

export function hasExplicitStreamStatus(stream) {
  return Object.prototype.hasOwnProperty.call(stream || {}, 'status')
    && stream.status !== null
    && stream.status !== undefined
    && String(stream.status).trim() !== '';
}

export function normalizeContainerStream(stream) {
  return {
    type: normalizeContainerType(stream?.type),
    status: hasExplicitStreamStatus(stream)
      ? normalizeContainerStatus(stream.status)
      : DEFAULT_CONTAINER_STATUS
  };
}

export function normalizeContainerStreams(container) {
  const rawStreams = Array.isArray(container?.streams) && container.streams.length > 0
    ? container.streams
    : [{
      type: container?.type,
      ...(hasExplicitContainerStatus(container) ? { status: container.status } : {})
    }];

  const streams = [];
  const seenTypes = new Set();

  for (const rawStream of rawStreams) {
    const stream = normalizeContainerStream(rawStream);
    if (seenTypes.has(stream.type)) {
      continue;
    }

    seenTypes.add(stream.type);
    streams.push(stream);
  }

  return streams.length > 0 ? streams : [createDefaultContainerStream()];
}

export function cloneContainerStreams(container) {
  return normalizeContainerStreams(container).map((stream) => ({ ...stream }));
}

export function getContainerCategoryForStream(stream) {
  const normalized = normalizeContainerStream(stream);
  const { type, status } = normalized;
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

export function getContainerCategories(container) {
  return normalizeContainerStreams(container).map(getContainerCategoryForStream);
}

export function getContainerCategory(container) {
  const categories = getContainerCategories(container);
  return categories.find((category) => RESTAFVAL_CONTAINER_TYPES.has(category.type))
    || categories[0]
    || getContainerCategoryForStream(createDefaultContainerStream());
}

export function formatContainerCategory(container) {
  return getContainerCategories(container)
    .map((category) => category.label)
    .join(', ');
}

export function formatContainerStream(stream) {
  return getContainerCategoryForStream(stream).label;
}

export function getContainerTypeCount(container) {
  return new Set(normalizeContainerStreams(container).map((stream) => stream.type)).size;
}

export function hasRestafvalStream(container) {
  return normalizeContainerStreams(container).some((stream) => RESTAFVAL_CONTAINER_TYPES.has(stream.type));
}

export function getContainerRestafvalStream(container) {
  return normalizeContainerStreams(container).find((stream) => RESTAFVAL_CONTAINER_TYPES.has(stream.type)) || null;
}

export function getContainerAnalysisType(container) {
  return getContainerRestafvalStream(container)?.type || DEFAULT_CONTAINER_TYPE;
}

export function getContainerAnalysisStatus(container) {
  return getContainerRestafvalStream(container)?.status || DEFAULT_CONTAINER_STATUS;
}

export function getContainerMarkerColors(container) {
  const colors = getContainerCategories(container).map((category) => category.borderColor);
  return [...new Set(colors)];
}

export function countRestafvalContainers(containers) {
  return containers.filter(hasRestafvalStream).length;
}
