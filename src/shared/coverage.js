export const REFERENCE_RADIUS_METERS = 275;

export const COVERAGE_STATUS = {
  within_100: {
    label: '0-100 m',
    color: '#15803d'
  },
  between_100_125: {
    label: '100-125 m',
    color: '#eab308'
  },
  between_125_150: {
    label: '125-150 m',
    color: '#f97316'
  },
  between_150_275: {
    label: '150-275 m',
    color: '#dc2626'
  },
  over_275: {
    label: 'Meer dan 275 m',
    color: '#7f1d1d'
  },
  unreachable: {
    label: 'Geen route',
    color: '#64748b'
  }
};

export const COVERAGE_STATUS_KEYS = Object.keys(COVERAGE_STATUS);

export const SUMMARY_DISTANCE_ROWS = [
  { key: 'within_100', label: '0-100 m' },
  { key: 'between_100_125', label: '100-125 m' },
  { key: 'between_125_150', label: '125-150 m' },
  { key: 'between_150_275', label: '150-275 m' },
  { key: 'over_275', label: 'meer dan 275 m' },
  { key: 'unreachable', label: 'geen route' }
];

export function getCoverageStatus(status) {
  return COVERAGE_STATUS[status] || COVERAGE_STATUS.unreachable;
}

export function classifyCoverageStatus(distance) {
  if (!Number.isFinite(distance)) {
    return 'unreachable';
  }

  if (distance <= 100) {
    return 'within_100';
  }

  if (distance <= 125) {
    return 'between_100_125';
  }

  if (distance <= 150) {
    return 'between_125_150';
  }

  if (distance <= REFERENCE_RADIUS_METERS) {
    return 'between_150_275';
  }

  return 'over_275';
}

export function getWalkingDistanceColor(distance) {
  return getCoverageStatus(classifyCoverageStatus(distance)).color;
}
