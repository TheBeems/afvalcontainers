export function formatMeters(distance) {
  if (!Number.isFinite(distance)) {
    return 'onbekend';
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1).replace('.', ',')} km`;
  }

  return `${Math.round(distance)} m`;
}

export function formatDuration(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) {
    return 'onbekende tijd';
  }

  return `${Math.max(1, Math.round(durationSeconds / 60))} min lopen`;
}

export function formatPercent(count, total) {
  if (!Number.isFinite(total) || total <= 0) {
    return '0,0%';
  }

  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(count / total);
}

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'onbekend';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'onbekend';
  }

  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}
