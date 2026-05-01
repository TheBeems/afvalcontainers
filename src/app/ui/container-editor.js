import {
  CHANGED_CONTAINER_PREVIEW_LIMIT
} from '../config.js';
import {
  CONTAINER_CATEGORIES,
  CONTAINER_STATUS_LABELS,
  CONTAINER_TYPE_LABELS,
  MANUAL_CONTAINER_ACCURACY,
  PRIVATE_ACCESS_SCOPE,
  VALID_CONTAINER_STATUSES,
  VALID_CONTAINER_TYPES,
  createDefaultContainerStream,
  normalizeContainerStreams,
  normalizeContainerStatus,
  normalizeContainerType
} from '../../shared/containers.js';
import {
  normalizeAllowedAddressRules,
  validateAllowedAddressRules
} from '../../shared/address.js';
import { escapeHtml } from '../../shared/html.js';

export function createContainerEditor(context, api) {
  const { elements, mapContext, state } = context;
  const { map } = mapContext;

  function renderContainerChangeList() {
    if (!elements.containerChangeList) {
      return;
    }

    const changedContainers = api.getChangedContainers();
    if (changedContainers.length === 0) {
      elements.containerChangeList.hidden = true;
      elements.containerChangeList.innerHTML = '';
      return;
    }

    const visibleChanges = changedContainers.slice(0, CHANGED_CONTAINER_PREVIEW_LIMIT);
    const remainingCount = changedContainers.length - visibleChanges.length;
    const remainingText = remainingCount > 0
      ? `<li class="container-change-more">+ ${remainingCount} meer</li>`
      : '';

    elements.containerChangeList.hidden = false;
    elements.containerChangeList.innerHTML = `
      <ul>
        ${visibleChanges.map((container) => `<li>${escapeHtml(api.getContainerChangeLabel(container))}</li>`).join('')}
        ${remainingText}
      </ul>
    `;
  }

  function syncContainerEditorVisibility() {
    if (!elements.containerEditor) {
      return;
    }

    const isExpanded = state.containerEditorExpanded;
    const changedCount = api.getChangedContainerCount();

    elements.containerEditor.classList.toggle('expanded', isExpanded);
    elements.containerEditor.classList.toggle('collapsed', !isExpanded);

    if (elements.containerEditorPanel) {
      elements.containerEditorPanel.hidden = !isExpanded;
    }

    if (elements.containerEditorToggle) {
      elements.containerEditorToggle.setAttribute('aria-expanded', String(isExpanded));
      elements.containerEditorToggle.setAttribute(
        'aria-label',
        isExpanded ? 'Containereditor sluiten' : 'Containereditor openen'
      );
    }

    if (elements.containerEditorBadge) {
      elements.containerEditorBadge.hidden = changedCount === 0 || isExpanded;
      elements.containerEditorBadge.textContent = String(changedCount);
    }
  }

  function toggleContainerEditor() {
    state.containerEditorExpanded = !state.containerEditorExpanded;
    updateContainerEditorControls();
  }

  function setContainerEditorStatus(message, tone = '') {
    if (!elements.containerEditorStatus) {
      return;
    }

    elements.containerEditorStatus.textContent = message;
    elements.containerEditorStatus.className = tone
      ? `container-editor-status ${tone}`
      : 'container-editor-status';
  }

  function updateContainerEditorControls() {
    const changedCount = api.getChangedContainerCount();
    const hasChanges = changedCount > 0;

    if (elements.containerChangeCount) {
      const label = changedCount === 1 ? '1 wijziging' : `${changedCount} wijzigingen`;
      elements.containerChangeCount.textContent = label;
    }

    if (elements.downloadContainersButton) {
      elements.downloadContainersButton.disabled = !hasChanges;
    }

    if (elements.resetContainersButton) {
      elements.resetContainersButton.disabled = !hasChanges;
    }

    if (elements.addContainerButton) {
      elements.addContainerButton.classList.toggle('active', state.addContainerMode);
      elements.addContainerButton.setAttribute('aria-pressed', String(state.addContainerMode));
    }

    syncContainerEditorVisibility();
    renderContainerChangeList();
    renderContainerEditPanel();
  }

  function downloadContainerLocations() {
    const filename = api.getContainerDownloadFilename();
    const payload = `${JSON.stringify(api.serializeContainersForDownload(), null, 2)}\n`;
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setContainerEditorStatus(`${filename} is klaargezet als download.`, 'success');
  }

  function resetContainerLocations() {
    if (api.getChangedContainerCount() === 0) {
      return;
    }

    if (!window.confirm('Alle niet-gedownloade containerwijzigingen terugzetten?')) {
      return;
    }

    state.containers = state.originalContainers.map((container) => api.cloneContainerForState(container, container.clientKey));
    api.syncContainerIndex();
    state.liveRouteCache.clear();
    state.addContainerMode = false;
    state.pendingNewContainer = null;
    state.editingContainerKey = null;
    state.unlockedContainerKey = null;
    map.getContainer().classList.remove('adding-container');
    api.renderContainers();
    api.clearContainerSelection();
    api.refreshSelectedHouseLiveState();
    updateContainerEditorControls();
    setContainerEditorStatus('Containerlocaties zijn teruggezet naar de geladen JSON.', 'success');
  }

  function getContainerTypeOptions(selectedType) {
    const normalizedType = normalizeContainerType(selectedType);
    return Object.entries(CONTAINER_TYPE_LABELS)
      .map(([value, label]) => `
        <option value="${escapeHtml(value)}"${value === normalizedType ? ' selected' : ''}>${escapeHtml(label)}</option>
      `)
      .join('');
  }

  function getContainerStatusOptions(selectedStatus) {
    const normalizedStatus = normalizeContainerStatus(selectedStatus);
    return Object.entries(CONTAINER_STATUS_LABELS)
      .map(([value, label]) => `
        <option value="${escapeHtml(value)}"${value === normalizedStatus ? ' selected' : ''}>${escapeHtml(label)}</option>
      `)
      .join('');
  }

  function buildContainerStreamRow(stream) {
    return `
      <div class="container-stream-row">
        <label>
          <span>Type</span>
          <select name="stream-type" required>
            ${getContainerTypeOptions(stream.type)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="stream-status" required>
            ${getContainerStatusOptions(stream.status)}
          </select>
        </label>
        <button type="button" class="editor-button container-stream-remove-button">Verwijderen</button>
      </div>
    `;
  }

  function buildContainerStreamRowsMarkup(container) {
    return normalizeContainerStreams(container)
      .map((stream) => buildContainerStreamRow(stream))
      .join('');
  }

  function buildContainerAccessAddressRow(rule = {}) {
    return `
      <div class="container-access-address-row">
        <label>
          <span>Straat</span>
          <input name="access-street" value="${escapeHtml(rule.street || '')}" autocomplete="off" />
        </label>
        <label>
          <span>Huisnummers</span>
          <input name="access-house-numbers" value="${escapeHtml(rule.houseNumbers || '')}" autocomplete="off" placeholder="23, 25-30" />
        </label>
        <button type="button" class="editor-button container-access-address-remove-button">Verwijderen</button>
      </div>
    `;
  }

  function getContainerAccessAddressRows(container) {
    const rules = normalizeAllowedAddressRules(container.access?.allowedAddresses);
    return rules.length > 0 ? rules : [{ street: '', houseNumbers: '' }];
  }

  function buildContainerAccessAddressRowsMarkup(container) {
    return getContainerAccessAddressRows(container)
      .map((rule) => buildContainerAccessAddressRow(rule))
      .join('');
  }

  function getEditableContainer() {
    if (state.pendingNewContainer) {
      return state.pendingNewContainer;
    }

    return api.getContainerByKey(state.editingContainerKey || state.activeContainerKey);
  }

  function getContainerEditTitle(container) {
    return state.pendingNewContainer
      ? 'Nieuwe container'
      : `Container ${container.id}`;
  }

  function renderContainerEditPanel() {
    if (!elements.containerEditPanel) {
      return;
    }

    if (state.addContainerMode && !state.pendingNewContainer) {
      elements.containerEditPanel.hidden = true;
      elements.containerEditPanel.innerHTML = '';
      return;
    }

    const container = getEditableContainer();
    if (!container) {
      elements.containerEditPanel.hidden = true;
      elements.containerEditPanel.innerHTML = '';
      return;
    }

    const isNew = container === state.pendingNewContainer;
    const isPrivate = container.access?.scope === PRIVATE_ACCESS_SCOPE;
    const accessLabel = isPrivate ? container.access?.label || '' : '';
    const locationText = Number.isFinite(container.lat) && Number.isFinite(container.lon)
      ? `${container.lat.toFixed(6)}, ${container.lon.toFixed(6)}`
      : 'onbekend';

    elements.containerEditPanel.hidden = false;
    elements.containerEditPanel.innerHTML = `
      <form id="container-edit-form" class="container-edit-form" novalidate>
        <div class="container-edit-heading">
          <strong>${escapeHtml(getContainerEditTitle(container))}</strong>
          <span>${isNew ? 'Klikpositie' : 'Locatie'}: ${escapeHtml(locationText)}</span>
        </div>
        <label>
          <span>ID</span>
          <input name="id" value="${escapeHtml(container.id)}" autocomplete="off" required />
        </label>
        <label>
          <span>Adres of omschrijving</span>
          <input name="address" value="${escapeHtml(container.address)}" autocomplete="off" required />
        </label>
        <fieldset class="container-streams-fieldset">
          <legend>Typen en status</legend>
          <div id="container-stream-rows" class="container-stream-rows">
            ${buildContainerStreamRowsMarkup(container)}
          </div>
          <button type="button" id="add-container-stream-button" class="editor-button">Type toevoegen</button>
        </fieldset>
        <fieldset class="container-access-fieldset">
          <legend>Toegang</legend>
          <label class="container-private-toggle">
            <input name="access-private" type="checkbox"${isPrivate ? ' checked' : ''} />
            <span>Privé container</span>
          </label>
          <div id="container-access-settings" class="container-access-settings"${isPrivate ? '' : ' hidden'}>
            <label>
              <span>Label</span>
              <input name="access-label" value="${escapeHtml(accessLabel)}" autocomplete="off" placeholder="Privé Angelapark" />
            </label>
            <fieldset class="container-access-addresses-fieldset">
              <legend>Toegestane adressen</legend>
              <div id="container-access-address-rows" class="container-access-address-rows">
                ${buildContainerAccessAddressRowsMarkup(container)}
              </div>
              <button type="button" id="add-container-access-address-button" class="editor-button">Adresregel toevoegen</button>
            </fieldset>
          </div>
        </fieldset>
        <div id="container-edit-error" class="container-edit-error" role="alert" hidden></div>
        <div class="container-edit-actions">
          <button type="submit" class="editor-button editor-button-primary">Opslaan</button>
          <button type="button" id="cancel-container-edit-button" class="editor-button">Annuleren</button>
        </div>
      </form>
    `;

    const form = document.getElementById('container-edit-form');
    const cancelButton = document.getElementById('cancel-container-edit-button');
    form?.addEventListener('submit', handleContainerEditSubmit);
    form?.addEventListener('click', handleContainerEditFormClick);
    form?.addEventListener('change', handleContainerEditFormChange);
    cancelButton?.addEventListener('click', cancelContainerEdit);
    syncContainerStreamRowControls(form);
    syncContainerAccessRowControls(form);
  }

  function syncContainerStreamRowControls(form) {
    const rows = form?.querySelectorAll('.container-stream-row') || [];
    const removeButtons = form?.querySelectorAll('.container-stream-remove-button') || [];
    const removeDisabled = rows.length <= 1;

    removeButtons.forEach((button, index) => {
      button.disabled = removeDisabled;
      button.setAttribute('aria-label', `Type ${index + 1} verwijderen`);
    });
  }

  function addContainerStreamRow(form) {
    const rowsElement = form.querySelector('#container-stream-rows');
    if (!rowsElement) {
      return;
    }

    rowsElement.insertAdjacentHTML('beforeend', buildContainerStreamRow(createDefaultContainerStream()));
    syncContainerStreamRowControls(form);
  }

  function removeContainerStreamRow(button, form) {
    const row = button.closest('.container-stream-row');
    if (!row) {
      return;
    }

    row.remove();
    syncContainerStreamRowControls(form);
  }

  function syncContainerAccessVisibility(form) {
    const settings = form?.querySelector('#container-access-settings');
    const checkbox = form?.querySelector('input[name="access-private"]');
    if (!settings || !checkbox) {
      return;
    }

    settings.hidden = !checkbox.checked;
  }

  function syncContainerAccessRowControls(form) {
    const rows = form?.querySelectorAll('.container-access-address-row') || [];
    const removeButtons = form?.querySelectorAll('.container-access-address-remove-button') || [];
    const removeDisabled = rows.length <= 1;

    removeButtons.forEach((button, index) => {
      button.disabled = removeDisabled;
      button.setAttribute('aria-label', `Adresregel ${index + 1} verwijderen`);
    });
  }

  function addContainerAccessAddressRow(form) {
    const rowsElement = form.querySelector('#container-access-address-rows');
    if (!rowsElement) {
      return;
    }

    rowsElement.insertAdjacentHTML('beforeend', buildContainerAccessAddressRow());
    syncContainerAccessRowControls(form);
  }

  function removeContainerAccessAddressRow(button, form) {
    const row = button.closest('.container-access-address-row');
    if (!row) {
      return;
    }

    row.remove();
    syncContainerAccessRowControls(form);
  }

  function handleContainerEditFormClick(event) {
    const form = event.currentTarget;
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.id === 'add-container-stream-button') {
      addContainerStreamRow(form);
      return;
    }

    if (target.classList.contains('container-stream-remove-button')) {
      removeContainerStreamRow(target, form);
      return;
    }

    if (target.id === 'add-container-access-address-button') {
      addContainerAccessAddressRow(form);
      return;
    }

    if (target.classList.contains('container-access-address-remove-button')) {
      removeContainerAccessAddressRow(target, form);
    }
  }

  function handleContainerEditFormChange(event) {
    const form = event.currentTarget;
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.name === 'access-private') {
      syncContainerAccessVisibility(form);
    }
  }

  function setContainerEditError(message) {
    const errorElement = document.getElementById('container-edit-error');
    if (!errorElement) {
      return;
    }

    errorElement.hidden = !message;
    errorElement.textContent = message || '';
  }

  function readContainerEditForm(form) {
    const formData = new FormData(form);
    const streamTypes = formData.getAll('stream-type');
    const streamStatuses = formData.getAll('stream-status');
    const accessStreets = formData.getAll('access-street');
    const accessHouseNumbers = formData.getAll('access-house-numbers');
    const accessPrivate = formData.get('access-private') === 'on';

    return {
      id: String(formData.get('id') || '').trim().toUpperCase(),
      address: String(formData.get('address') || '').trim(),
      streams: streamTypes.map((type, index) => ({
        type: String(type || '').trim(),
        status: String(streamStatuses[index] || '').trim()
      })),
      access: accessPrivate ? {
        scope: PRIVATE_ACCESS_SCOPE,
        label: String(formData.get('access-label') || '').trim(),
        allowedAddresses: normalizeAllowedAddressRules(accessStreets.map((street, index) => ({
          street,
          houseNumbers: accessHouseNumbers[index]
        })))
      } : null
    };
  }

  function validateContainerEditForm(values, currentContainerKey = null) {
    if (!api.getContainerIdPattern().test(values.id)) {
      return `Gebruik een id in de vorm ${api.getContainerIdFormat()}, bijvoorbeeld ${api.getContainerIdExample()}.`;
    }

    const duplicate = state.containers.find((container) => (
      container.id === values.id && container.clientKey !== currentContainerKey
    ));
    if (duplicate) {
      return `Container ${values.id} bestaat al.`;
    }

    if (!values.address) {
      return 'Vul een adres of omschrijving in.';
    }

    if (!Array.isArray(values.streams) || values.streams.length === 0) {
      return 'Voeg minimaal één containertype toe.';
    }

    const seenTypes = new Set();
    for (const stream of values.streams) {
      if (!VALID_CONTAINER_TYPES.has(stream.type)) {
        return 'Kies een geldig containertype.';
      }

      if (seenTypes.has(stream.type)) {
        return 'Gebruik elk containertype maximaal één keer per locatie.';
      }
      seenTypes.add(stream.type);

      if (!VALID_CONTAINER_STATUSES.has(stream.status)) {
        return 'Kies een geldige containerstatus.';
      }

      if (!CONTAINER_CATEGORIES[`${stream.status}:${stream.type}`]) {
        return 'Deze combinatie van status en type wordt niet ondersteund.';
      }
    }

    if (values.access) {
      if (!values.access.label) {
        return 'Vul een label in voor de privé container.';
      }

      const accessError = validateAllowedAddressRules(values.access.allowedAddresses);
      if (accessError) {
        return accessError;
      }
    }

    return '';
  }

  function cancelContainerEdit() {
    if (state.pendingNewContainer) {
      state.pendingNewContainer = null;
      state.addContainerMode = false;
      map.getContainer().classList.remove('adding-container');
      setContainerEditorStatus('Nieuwe container toevoegen is geannuleerd.');
    } else {
      setContainerEditorStatus('Bewerking is geannuleerd.');
    }

    updateContainerEditorControls();
  }

  function handleContainerEditSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const values = readContainerEditForm(form);
    const container = getEditableContainer();
    const currentKey = state.pendingNewContainer ? null : container?.clientKey;
    const error = validateContainerEditForm(values, currentKey);

    if (error) {
      setContainerEditError(error);
      return;
    }

    if (state.pendingNewContainer) {
      saveNewContainer(values);
      return;
    }

    if (container) {
      saveContainerMetadata(container, values);
    }
  }

  function saveNewContainer(values) {
    const container = api.cloneContainerForState({
      ...state.pendingNewContainer,
      ...values
    }, state.pendingNewContainer.clientKey);

    state.pendingNewContainer = null;
    state.addContainerMode = false;
    state.activeContainerKey = container.clientKey;
    state.editingContainerKey = container.clientKey;
    state.containers.push(container);
    api.syncContainerIndex();
    state.liveRouteCache.clear();
    map.getContainer().classList.remove('adding-container');
    api.renderContainers();
    api.showCoverageCircle(container);
    api.renderContainerMapInfo(container);
    map.panTo([container.lat, container.lon], { animate: true });
    api.refreshSelectedHouseLiveState();
    setContainerEditorStatus(`Container ${container.id} is toegevoegd. Download de JSON om de wijziging te bewaren.`, 'success');
  }

  function saveContainerMetadata(container, values) {
    const previousId = container.id;

    container.id = values.id;
    container.address = values.address;
    container.streams = values.streams.map((stream) => ({ ...stream }));
    if (values.access) {
      container.access = {
        ...values.access,
        allowedAddresses: values.access.allowedAddresses.map((rule) => ({ ...rule }))
      };
    } else {
      delete container.access;
    }
    delete container.type;
    delete container.status;
    api.syncContainerIndex();

    if (previousId !== container.id) {
      state.liveRouteCache.clear();
    }

    api.renderContainers();
    api.refreshSelectedHouseLiveState();
    setContainerEditorStatus(`Container ${container.id} is bijgewerkt. Download de JSON om de wijziging te bewaren.`, 'success');
  }

  function setAddContainerMode(isActive, message = null) {
    state.addContainerMode = isActive;
    map.getContainer().classList.toggle('adding-container', isActive);
    updateContainerEditorControls();

    if (message) {
      setContainerEditorStatus(message, isActive ? 'active' : '');
    }
  }

  function beginAddContainerMode() {
    api.lockUnlockedContainer();
    state.pendingNewContainer = null;
    state.editingContainerKey = null;
    const nextMode = !state.addContainerMode;
    setAddContainerMode(
      nextMode,
      nextMode
        ? 'Klik op de kaart om de nieuwe containerpositie te kiezen.'
        : 'Nieuwe container toevoegen is geannuleerd.'
    );
  }

  function addContainerAtLatLng(latlng) {
    state.pendingNewContainer = api.cloneContainerForState({
      id: api.getNextContainerId(),
      address: '',
      lat: api.normalizeContainerCoordinate(latlng.lat),
      lon: api.normalizeContainerCoordinate(latlng.lng),
      accuracy: MANUAL_CONTAINER_ACCURACY,
      streams: [createDefaultContainerStream()]
    });
    setAddContainerMode(false);
    updateContainerEditorControls();
    setContainerEditorStatus('Vul de gegevens voor de nieuwe container in.', 'active');
  }

  function handleMapClick(event) {
    if (state.addContainerMode) {
      addContainerAtLatLng(event.latlng);
      return;
    }

    if (state.activeContainerIndex !== null) {
      api.clearContainerSelection();
    }
  }

  return {
    renderContainerChangeList,
    syncContainerEditorVisibility,
    toggleContainerEditor,
    setContainerEditorStatus,
    updateContainerEditorControls,
    downloadContainerLocations,
    resetContainerLocations,
    getContainerTypeOptions,
    getContainerStatusOptions,
    getEditableContainer,
    getContainerEditTitle,
    renderContainerEditPanel,
    setContainerEditError,
    readContainerEditForm,
    validateContainerEditForm,
    cancelContainerEdit,
    handleContainerEditSubmit,
    saveNewContainer,
    saveContainerMetadata,
    setAddContainerMode,
    beginAddContainerMode,
    addContainerAtLatLng,
    handleMapClick
  };
}
