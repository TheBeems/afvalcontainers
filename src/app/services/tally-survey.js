import {
  TALLY_FORM_ID,
  TALLY_HIDDEN_FIELDS,
  TALLY_WIDGET_URL
} from '../config.js';
import { getAddressStreet } from '../../shared/address.js';
import { escapeHtml } from '../../shared/html.js';

let tallyWidgetLoadPromise = null;
let tallySurveyDialog = null;
let tallySurveyTriggerButton = null;
let tallySurveySubmitHandler = null;

const TALLY_FEEDBACK_PAGE_PATH = 'terugkoppeling/';

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
    <aside class="survey-callout" aria-label="Enquête over containers">
      <p class="survey-callout-title">Wat vind jij van de containers?</p>
      <p class="survey-callout-text">Je reactie helpt de dorpsraad van Warmenhuizen zicht te krijgen op de meningen van de dorpsbewoners.</p>
      <button
        type="button"
        class="survey-button"
        data-survey-button
        data-tally-place="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.place])}"
        data-tally-street="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.street])}"
        data-tally-coverage-status="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.coverageStatus])}"
        data-tally-walking-distance="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.walkingDistance])}"
        data-tally-walking-duration="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.walkingDuration])}"
        data-tally-container-id="${escapeHtml(hiddenFields[TALLY_HIDDEN_FIELDS.containerId])}"
      >
        Vul de enquête in
      </button>
    </aside>
  `;
}

function loadTallyWidget() {
  if (window.Tally?.loadEmbeds) {
    return Promise.resolve(true);
  }

  if (tallyWidgetLoadPromise) {
    return tallyWidgetLoadPromise;
  }

  tallyWidgetLoadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = TALLY_WIDGET_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Tally?.loadEmbeds));
    script.onerror = () => {
      tallyWidgetLoadPromise = null;
      resolve(false);
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

function buildTallySurveyEmbedUrl(hiddenFields) {
  const url = new URL(`https://tally.so/embed/${TALLY_FORM_ID}`);

  url.searchParams.set('transparentBackground', '1');
  url.searchParams.set('dynamicHeight', '1');

  Object.entries(hiddenFields).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function removeTallySurveyDialog({ restoreFocus = false } = {}) {
  if (tallySurveySubmitHandler) {
    window.removeEventListener('message', tallySurveySubmitHandler);
    tallySurveySubmitHandler = null;
  }

  tallySurveyDialog?.remove();
  tallySurveyDialog = null;

  if (restoreFocus && tallySurveyTriggerButton?.isConnected) {
    tallySurveyTriggerButton.focus();
  }

  tallySurveyTriggerButton = null;
}

function closeTallySurvey() {
  if (tallySurveyDialog?.open) {
    tallySurveyDialog.close();
    return;
  }

  removeTallySurveyDialog({ restoreFocus: true });
}

function isTallyFormSubmittedMessage(event) {
  if (event.origin !== 'https://tally.so' || typeof event.data !== 'string') {
    return false;
  }

  if (!event.data.includes('Tally.FormSubmitted')) {
    return false;
  }

  try {
    const message = JSON.parse(event.data);
    return message?.payload?.formId === TALLY_FORM_ID;
  } catch {
    return false;
  }
}

function getRuntimeBasePath() {
  return document.querySelector('meta[name="app-base-path"]')?.content || './';
}

function goToTallyFeedbackPage() {
  const feedbackUrl = new URL(`${getRuntimeBasePath()}${TALLY_FEEDBACK_PAGE_PATH}`, window.location.href);
  const returnHash = window.location.hash || '#kaart';
  feedbackUrl.searchParams.set('returnTo', `${window.location.pathname}${window.location.search}${returnHash}`);
  window.location.assign(feedbackUrl);
}

function createTallySurveyFrame(embedUrl) {
  const frame = document.createElement('iframe');
  frame.className = 'tally-survey-frame';
  frame.dataset.tallySrc = embedUrl;
  frame.loading = 'lazy';
  frame.width = '100%';
  frame.height = '720';
  frame.frameBorder = '0';
  frame.marginHeight = '0';
  frame.marginWidth = '0';
  frame.title = 'Enquête over containers';

  return frame;
}

function showTallySurveyDialog(triggerButton, hiddenFields) {
  if (typeof HTMLDialogElement === 'undefined') {
    throw new Error('Enquêtevenster wordt niet ondersteund door deze browser.');
  }

  removeTallySurveyDialog();
  tallySurveyTriggerButton = triggerButton;

  const dialog = document.createElement('dialog');
  dialog.className = 'tally-survey-dialog';
  dialog.setAttribute('aria-label', 'Enquête over containers');

  const card = document.createElement('section');
  card.className = 'tally-survey-dialog-card';
  card.setAttribute('role', 'document');

  const header = document.createElement('div');
  header.className = 'tally-survey-dialog-header';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'tally-survey-dialog-close';
  closeButton.setAttribute('aria-label', 'Enquête sluiten');
  closeButton.title = 'Enquête sluiten';
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeTallySurvey);

  const frame = createTallySurveyFrame(buildTallySurveyEmbedUrl(hiddenFields));

  header.appendChild(closeButton);
  card.append(header, frame);
  dialog.appendChild(card);
  dialog.addEventListener('close', () => removeTallySurveyDialog({ restoreFocus: true }), { once: true });

  tallySurveySubmitHandler = (event) => {
    if (isTallyFormSubmittedMessage(event)) {
      removeTallySurveyDialog();
      goToTallyFeedbackPage();
    }
  };
  window.addEventListener('message', tallySurveySubmitHandler);

  document.body.appendChild(dialog);
  tallySurveyDialog = dialog;
  dialog.showModal();
  closeButton.focus();

  return frame;
}

function loadTallySurveyFrame(frame, isWidgetLoaded) {
  if (!frame.isConnected) {
    return;
  }

  if (isWidgetLoaded && window.Tally?.loadEmbeds) {
    try {
      window.Tally.loadEmbeds();
      return;
    } catch {
      // Fall back to a plain iframe source when the widget cannot initialize.
    }
  }

  frame.src = frame.dataset.tallySrc;
}

export async function openTallySurvey(button, setCoverageStatus) {
  if (!isTallyFormConfigured()) {
    setCoverageStatus('Enquêteformulier is nog niet gekoppeld. Vul TALLY_FORM_ID in om de enquête te openen.', 'error');
    return;
  }

  button.setAttribute('aria-busy', 'true');
  button.disabled = true;

  try {
    const frame = showTallySurveyDialog(button, getTallyHiddenFieldsFromButton(button));
    const isWidgetLoaded = await loadTallyWidget();
    loadTallySurveyFrame(frame, isWidgetLoaded);
  } catch (error) {
    removeTallySurveyDialog();
    setCoverageStatus(error.message || 'De enquête kon niet worden geopend.', 'error');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
