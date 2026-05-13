import {
  TALLY_FORM_ID,
  TALLY_HIDDEN_FIELDS,
  TALLY_WIDGET_URL
} from '../config.js';
import { getAddressStreet } from '../../shared/address.js';
import { escapeHtml } from '../../shared/html.js';

let tallyWidgetLoadPromise = null;

function isTallyFormConfigured() {
  return TALLY_FORM_ID
    && TALLY_FORM_ID !== 'REPLACE_WITH_TALLY_FORM_ID';
}

function getNearestSurveyContainer(ranking) {
  return ranking[0] || null;
}

function buildTallySurveyHiddenFields(house, nearest, activePlaceCity) {
  return {
    [TALLY_HIDDEN_FIELDS.place]: house.city || activePlaceCity,
    [TALLY_HIDDEN_FIELDS.street]: getAddressStreet(house.address),
    [TALLY_HIDDEN_FIELDS.coverageStatus]: nearest?.coverageStatus || house.coverageStatus || '',
    [TALLY_HIDDEN_FIELDS.walkingDistance]: Number.isFinite(nearest?.walkingDistance)
      ? Math.round(nearest.walkingDistance)
      : '',
    [TALLY_HIDDEN_FIELDS.walkingDuration]: Number.isFinite(nearest?.walkingDuration)
      ? Math.round(nearest.walkingDuration)
      : '',
    [TALLY_HIDDEN_FIELDS.containerId]: nearest?.id || ''
  };
}

export function buildTallySurveyButtonMarkup(house, ranking, activePlaceCity) {
  const nearest = getNearestSurveyContainer(ranking);

  if (!house || !nearest) {
    return '';
  }

  const hiddenFields = buildTallySurveyHiddenFields(house, nearest, activePlaceCity);

  return `
    <button
      type="button"
      class="survey-button"
      data-survey-button
      data-tally-open="${escapeHtml(TALLY_FORM_ID)}"
      data-tally-place="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.place])}"
      data-tally-street="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.street])}"
      data-tally-coverage-status="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.coverageStatus])}"
      data-tally-walking-distance="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.walkingDistance])}"
      data-tally-walking-duration="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.walkingDuration])}"
      data-tally-container-id="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.containerId])}"
    >
      Deel wat deze afstand voor jou betekent
    </button>
  `;
}

function loadTallyWidget() {
  if (window.Tally?.openPopup) {
    return Promise.resolve();
  }

  if (tallyWidgetLoadPromise) {
    return tallyWidgetLoadPromise;
  }

  tallyWidgetLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TALLY_WIDGET_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      tallyWidgetLoadPromise = null;
      reject(new Error('Tally-widget kon niet worden geladen.'));
    };
    document.head.appendChild(script);
  });

  return tallyWidgetLoadPromise;
}

function getTallyHiddenFieldsFromButton(button) {
  return {
    [TALLY_HIDDEN_FIELDS.place]: button.dataset.tallyPlace || '',
    [TALLY_HIDDEN_FIELDS.street]: button.dataset.tallyStreet || '',
    [TALLY_HIDDEN_FIELDS.coverageStatus]: button.dataset.tallyCoverageStatus || '',
    [TALLY_HIDDEN_FIELDS.walkingDistance]: button.dataset.tallyWalkingDistance || '',
    [TALLY_HIDDEN_FIELDS.walkingDuration]: button.dataset.tallyWalkingDuration || '',
    [TALLY_HIDDEN_FIELDS.containerId]: button.dataset.tallyContainerId || ''
  };
}

export async function openTallySurvey(button, setCoverageStatus) {
  if (!isTallyFormConfigured()) {
    setCoverageStatus('Enquêteformulier is nog niet gekoppeld. Vul TALLY_FORM_ID in om de enquête te openen.', 'error');
    return;
  }

  button.setAttribute('aria-busy', 'true');
  button.disabled = true;

  try {
    await loadTallyWidget();

    if (!window.Tally?.openPopup) {
      throw new Error('Tally-popup is niet beschikbaar.');
    }

    window.Tally.openPopup(TALLY_FORM_ID, {
      hiddenFields: getTallyHiddenFieldsFromButton(button)
    });
  } catch (error) {
    setCoverageStatus(error.message || 'De enquête kon niet worden geopend.', 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
