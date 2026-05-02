import { getCoverageStatus } from '../../shared/coverage.js';
import { escapeHtml } from '../../shared/html.js';
import { formatMeters } from '../../shared/format.js';

const OBJECTION_RECIPIENT = 'griffie@schagen.nl';
const COPY_SUCCESS_TEXT = 'Tekst gekopieerd';
const COPY_DEFAULT_TEXT = 'Kopieer tekst';
const COPY_RESET_DELAY_MS = 2200;
const OBJECTION_BUTTON_LABEL = 'Stuur de gemeente een bericht';

export function createObjectionMail(context, api) {
  const { elements, state } = context;

  let isGeneratedTextDirty = false;
  let lastGeneratedText = '';
  let lastFocusedElement = null;
  let copyResetTimeout = null;

  function getReasonInputs() {
    return Array.from(document.querySelectorAll('input[name="objection-reason"]'));
  }

  function getSelectedReasons() {
    return getReasonInputs()
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function getInputValue(element, fallback) {
    const value = element?.value.trim();
    return value || fallback;
  }

  function getSelectedHouseObjectionData() {
    const house = state.selectedHouse;

    if (!house) {
      return null;
    }

    const ranking = api.getCurrentRanking(house);
    const nearest = ranking[0] || null;
    const walkingDistance = nearest?.walkingDistance ?? house.walkingDistance;
    const coverageStatus = nearest?.coverageStatus ?? house.coverageStatus;
    const placeName = api.getActivePlaceName();
    const city = house.city || api.getActivePlaceCity() || placeName;
    const containerLocation = nearest
      ? [nearest.id, nearest.address].filter(Boolean).join(' - ')
      : '';
    const hasCompleteRouteData = Boolean(
      nearest
      && Number.isFinite(walkingDistance)
      && containerLocation
    );

    return {
      address: house.address || 'onbekend adres',
      postcode: house.postcode || '',
      city,
      placeName,
      walkingDistance,
      walkingDistanceText: formatMeters(walkingDistance),
      containerLocation: containerLocation || 'onbekend',
      coverageLabel: getCoverageStatus(coverageStatus).label,
      hasCompleteRouteData
    };
  }

  function buildObjectionSubject(data) {
    const placeName = data?.placeName || api.getActivePlaceName();
    const address = data?.address || 'geselecteerd adres';
    return `Reactie ondergrondse restafvalcontainers ${placeName} - ${address}`;
  }

  function buildObjectionBody(data) {
    if (!data) {
      return '';
    }

    const reasons = getSelectedReasons();
    const reasonLines = reasons.length > 0
      ? reasons.map((reason) => `- ${reason}`).join('\n')
      : '- [vul uw redenen aan]';
    const personalNote = elements.objectionPersonalNote?.value.trim();
    const personalNoteSection = personalNote ? `\n\n${personalNote}` : '';
    const name = getInputValue(elements.objectionName, '[naam]');
    const addressLine = getInputValue(elements.objectionAddressLine, '[adres]');
    const city = getInputValue(elements.objectionCity, '[woonplaats]');

    return `Geachte gemeenteraad, geacht college,

Via deze <a href="https://thebeems.github.io/afvalcontainers/" target="_blank">website</a> met werkelijke loopafstanden naar de aangekondigde restafvalcontainers,heb ik mijn adres opgezocht: ${data.address}, ${data.placeName}.

Voor mijn adres bedraagt de geschatte werkelijke loopafstand naar de dichtstbijzijnde ondergrondse restafvalcontainer ongeveer ${data.walkingDistanceText}. De dichtstbijzijnde container is volgens de kaart: ${data.containerLocation}.

Ik maak mij zorgen over deze loopafstand en de invoering van ondergrondse restafvalcontainers in ${data.placeName}.

Mijn redenen zijn:
${reasonLines}${personalNoteSection}

Ik verzoek de gemeente om:
1. de werkelijke loopafstand als uitgangspunt te nemen en niet de hemelsbrede afstand;
2. opnieuw te beoordelen of de voorgestelde containerlocaties eerlijk en praktisch verdeeld zijn;
3. extra of alternatieve containerlocaties te onderzoeken voor adressen met een grote loopafstand;
4. deze reactie te delen met de gemeenteraad, het college en de projectleider van het project ondergrondse restafvalcontainers ${data.placeName}.

Met vriendelijke groet,

${name}
${addressLine}
${city}`;
  }

  function createObjectionMailtoUrl(subject, body) {
    return `mailto:${OBJECTION_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function clearObjectionError() {
    if (!elements.objectionError) {
      return;
    }

    elements.objectionError.hidden = true;
    elements.objectionError.textContent = '';
  }

  function showObjectionError(message) {
    if (!elements.objectionError) {
      return;
    }

    elements.objectionError.textContent = message;
    elements.objectionError.hidden = false;
  }

  function resetCopyButtonText() {
    if (copyResetTimeout) {
      window.clearTimeout(copyResetTimeout);
      copyResetTimeout = null;
    }

    if (elements.objectionCopyButton) {
      elements.objectionCopyButton.textContent = COPY_DEFAULT_TEXT;
    }
  }

  function renderObjectionAddressSummary(data) {
    if (!elements.objectionAddressSummary) {
      return;
    }

    if (!data) {
      elements.objectionAddressSummary.innerHTML = '<p class="objection-incomplete">Selecteer eerst een adres.</p>';
      return;
    }

    const postcodeLine = [data.postcode, data.city].filter(Boolean).join(' ');
    const incompleteMessage = data.hasCompleteRouteData
      ? ''
      : '<p class="objection-incomplete">Voor dit adres is nog geen volledige loopafstand beschikbaar.</p>';

    elements.objectionAddressSummary.innerHTML = `
      ${incompleteMessage}
      <dl>
        <div>
          <dt>Geselecteerd adres</dt>
          <dd>${escapeHtml(data.address)}${postcodeLine ? `<span>${escapeHtml(postcodeLine)}</span>` : ''}</dd>
        </div>
        <div>
          <dt>Werkelijke loopafstand</dt>
          <dd>${escapeHtml(data.walkingDistanceText)}</dd>
        </div>
        <div>
          <dt>Dichtstbijzijnde container</dt>
          <dd>${escapeHtml(data.containerLocation)}</dd>
        </div>
        <div>
          <dt>Afstandscategorie</dt>
          <dd>${escapeHtml(data.coverageLabel)}</dd>
        </div>
      </dl>
    `;
  }

  function updateGeneratedObjectionText({ force = false } = {}) {
    const data = getSelectedHouseObjectionData();
    renderObjectionAddressSummary(data);
    resetCopyButtonText();

    if (!elements.objectionGeneratedText || !data) {
      return;
    }

    if (isGeneratedTextDirty && !force) {
      return;
    }

    lastGeneratedText = buildObjectionBody(data);
    elements.objectionGeneratedText.value = lastGeneratedText;
    isGeneratedTextDirty = false;
  }

  function openObjectionModal() {
    if (!elements.objectionModal || !elements.objectionDialog) {
      return;
    }

    lastFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    elements.objectionModal.hidden = false;
    clearObjectionError();
    updateGeneratedObjectionText();
    elements.objectionDialog.focus({ preventScroll: true });
  }

  function closeObjectionModal() {
    if (!elements.objectionModal) {
      return;
    }

    elements.objectionModal.hidden = true;
    clearObjectionError();
    resetCopyButtonText();

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  function openMailProgram() {
    const data = getSelectedHouseObjectionData();

    if (!data || !elements.objectionGeneratedText) {
      showObjectionError('Selecteer eerst een adres.');
      return;
    }

    clearObjectionError();
    const subject = buildObjectionSubject(data);
    const body = elements.objectionGeneratedText.value;
    window.location.href = createObjectionMailtoUrl(subject, body);
  }

  async function copyObjectionText() {
    if (!elements.objectionGeneratedText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(elements.objectionGeneratedText.value);
      clearObjectionError();
      elements.objectionCopyButton.textContent = COPY_SUCCESS_TEXT;

      if (copyResetTimeout) {
        window.clearTimeout(copyResetTimeout);
      }

      copyResetTimeout = window.setTimeout(resetCopyButtonText, COPY_RESET_DELAY_MS);
    } catch {
      showObjectionError('De tekst kon niet automatisch worden gekopieerd. Selecteer en kopieer de tekst handmatig.');
    }
  }

  function buildObjectionActionMarkup({ context = 'sidebar' } = {}) {
    const className = context === 'map'
      ? 'objection-callout objection-callout-map'
      : 'objection-callout';

    return `
      <section class="${className}" aria-label="Persoonlijke reactie maken">
        <button type="button" class="editor-button objection-open-button">${OBJECTION_BUTTON_LABEL}</button>
      </section>
    `;
  }

  function refreshObjectionModal() {
    if (elements.objectionModal?.hidden === false) {
      updateGeneratedObjectionText();
    }
  }

  function bindObjectionModalEvents() {
    function handleObjectionOpenClick(event) {
      const target = event.target;

      if (!(target instanceof Element) || !target.closest('.objection-open-button')) {
        return;
      }

      openObjectionModal();
    }

    elements.houseSummary?.addEventListener('click', handleObjectionOpenClick);
    elements.mapInfoStack?.addEventListener('click', handleObjectionOpenClick);

    elements.objectionCloseButton?.addEventListener('click', closeObjectionModal);
    elements.objectionModal?.addEventListener('click', (event) => {
      const target = event.target;

      if (target instanceof Element && target.hasAttribute('data-objection-close')) {
        closeObjectionModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && elements.objectionModal?.hidden === false) {
        closeObjectionModal();
      }
    });

    getReasonInputs().forEach((input) => {
      input.addEventListener('change', () => updateGeneratedObjectionText());
    });

    [
      elements.objectionPersonalNote,
      elements.objectionName,
      elements.objectionAddressLine,
      elements.objectionCity
    ].forEach((input) => {
      input?.addEventListener('input', () => updateGeneratedObjectionText());
    });

    elements.objectionGeneratedText?.addEventListener('input', () => {
      isGeneratedTextDirty = elements.objectionGeneratedText.value !== lastGeneratedText;
      resetCopyButtonText();
    });

    elements.objectionRegenerateButton?.addEventListener('click', () => {
      isGeneratedTextDirty = false;
      updateGeneratedObjectionText({ force: true });
      elements.objectionGeneratedText?.focus();
    });

    elements.objectionMailtoButton?.addEventListener('click', openMailProgram);
    elements.objectionCopyButton?.addEventListener('click', () => {
      void copyObjectionText();
    });
  }

  return {
    getSelectedHouseObjectionData,
    buildObjectionSubject,
    buildObjectionBody,
    createObjectionMailtoUrl,
    openObjectionModal,
    closeObjectionModal,
    updateGeneratedObjectionText,
    bindObjectionModalEvents,
    buildObjectionActionMarkup,
    refreshObjectionModal
  };
}
