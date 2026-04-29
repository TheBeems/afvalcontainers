import { getContainerAccessLabel } from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';

export function createContainerMarkup() {
  function buildContainerAccessPill(container) {
    const label = getContainerAccessLabel(container);
    return label
      ? `<span class="container-access-pill">${escapeHtml(label)}</span>`
      : '';
  }

  function buildContainerTitleMarkup(container) {
    if (!container) {
      return 'Geen gekoppelde container';
    }

    return `
      <span class="container-title-text">
        <strong>${escapeHtml(container.id)}</strong> - ${escapeHtml(container.address || 'onbekend adres')}
      </span>
      ${buildContainerAccessPill(container)}
    `;
  }

  return {
    buildContainerAccessPill,
    buildContainerTitleMarkup
  };
}
