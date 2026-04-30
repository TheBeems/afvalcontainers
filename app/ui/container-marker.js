import {
  getContainerCategory,
  getContainerMarkerColors,
  getContainerTypeCount
} from '../../shared/containers.js';

export function getContainerMarkerColor(container) {
  return getContainerCategory(container).borderColor;
}

function buildMarkerFill(container) {
  const colors = getContainerMarkerColors(container);
  if (colors.length <= 1) {
    return {
      defs: '',
      fill: colors[0] || getContainerMarkerColor(container)
    };
  }

  const gradientId = `container-marker-gradient-${String(container.id || 'marker').replace(/[^a-z0-9_-]/gi, '-')}`;
  const step = 100 / colors.length;
  const stops = colors.map((color, index) => {
    const start = (index * step).toFixed(2);
    const end = ((index + 1) * step).toFixed(2);
    return `
      <stop offset="${start}%" stop-color="${color}"/>
      <stop offset="${end}%" stop-color="${color}"/>
    `;
  }).join('');

  return {
    defs: `<defs><linearGradient id="${gradientId}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>`,
    fill: `url(#${gradientId})`
  };
}

export function createContainerMarkerSvg(container, { variant = '' } = {}) {
  const typeCount = getContainerTypeCount(container);
  const { defs, fill } = buildMarkerFill(container);
  const markerCenter = typeCount > 1
    ? `<text class="container-marker-count" x="32" y="30" text-anchor="middle" dominant-baseline="central">${typeCount}</text>`
    : '<circle cx="32" cy="30" r="12" fill="#ffffff"/>';
  const variantClass = variant ? ` container-marker-svg--${variant}` : '';

  return `
    <svg
      class="container-marker-svg${variantClass}"
      width="42"
      height="58"
      viewBox="0 0 64 88"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      ${defs}
      <path
        d="M32 84C32 84 56 52 56 30C56 16.745 45.255 6 32 6C18.745 6 8 16.745 8 30C8 52 32 84 32 84Z"
        fill="${fill}"
        stroke="#ffffff"
        stroke-width="6"
      />

      ${markerCenter}
    </svg>
  `;
}

export function createContainerMarkerIcon(container, isActive = false) {
  return L.divIcon({
    className: `container-marker-icon${isActive ? ' container-marker-active' : ''}`,
    html: createContainerMarkerSvg(container),
    iconSize: [42, 58],
    iconAnchor: [21, 58],
    popupAnchor: [0, -58]
  });
}
