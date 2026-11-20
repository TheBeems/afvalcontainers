const DEFAULT_MIN_WALKING_DISTANCE = 100;

function getDistanceLimit(houses) {
  let limit = null;
  for (const { walkingDistance } of houses) {
    if (Number.isFinite(walkingDistance)) {
      limit = Math.max(limit ?? 0, Math.ceil(walkingDistance));
    }
  }
  return limit;
}

export function createWalkingDistanceRange(element, onRangeChange) {
  const track = element.querySelector('.coverage-distance-track');
  const controls = ['min', 'max'].map((bound) => ({
    bound,
    slider: element.querySelector(`#walking-distance-${bound}`),
    number: element.querySelector(`#walking-distance-${bound}-value`)
  }));
  let limit = null;
  let selectedMin = DEFAULT_MIN_WALKING_DISTANCE;
  let selectedMax = null;

  function getBounds() {
    if (limit === null) {
      return null;
    }
    const max = Math.min(selectedMax ?? limit, limit);
    return { min: Math.min(selectedMin, max), max };
  }

  function render() {
    const bounds = getBounds();
    element.hidden = !bounds;
    if (!bounds) {
      return;
    }

    for (const { bound, slider, number } of controls) {
      const value = bounds[bound];
      const min = bound === 'min' ? 0 : bounds.min;
      const max = bound === 'min' ? bounds.max : limit;
      // Both thumbs share the full track. The other thumb constrains the chosen value.
      slider.max = limit;
      slider.value = value;
      slider.setAttribute('aria-valuemin', String(min));
      slider.setAttribute('aria-valuemax', String(max));
      slider.setAttribute('aria-valuetext', `${value.toLocaleString('nl-NL')} meter`);
      number.min = min;
      number.max = max;
      number.value = value;
      track.style.setProperty(`--walking-distance-${bound}`, `${value / Math.max(1, limit) * 100}%`);
    }
  }

  function setBound(bound, value) {
    const bounds = getBounds();
    if (!bounds) {
      return;
    }
    if (!Number.isFinite(value)) {
      render();
      return;
    }

    const meters = Math.round(value);
    if (bound === 'min') {
      selectedMin = Math.max(0, Math.min(meters, bounds.max));
    } else {
      const max = Math.max(bounds.min, Math.min(meters, limit));
      selectedMax = max === limit ? null : max;
    }
    render();
    onRangeChange();
  }

  function bind() {
    for (const { bound, slider, number } of controls) {
      slider.addEventListener('input', () => setBound(bound, slider.valueAsNumber));
      number.addEventListener('change', () => setBound(bound, number.valueAsNumber));
    }
  }

  function setHouses(houses) {
    limit = getDistanceLimit(houses);
    render();
  }

  function reset() {
    selectedMin = DEFAULT_MIN_WALKING_DISTANCE;
    selectedMax = null;
    render();
  }

  return { bind, getBounds, setHouses, reset };
}
