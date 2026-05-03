import { SUMMARY_DISTANCE_ROWS } from '../../shared/coverage.js';
import { countRestafvalContainers } from '../../shared/containers.js';
import { escapeHtml } from '../../shared/html.js';
import { formatPercent, formatTimestamp } from '../../shared/format.js';

export function createCoverageSummary(context) {
  const { elements, state } = context;

  function buildSummaryStat(value, label, { total = 0, showPercent = false } = {}) {
    const safeValue = Number.isFinite(value) ? value : 0;
    const percent = showPercent
      ? `<span class="summary-percent">(${formatPercent(safeValue, total)})</span>`
      : '';

    return `
      <div class="summary-stat">
        <strong>${safeValue.toLocaleString('nl-NL')}${percent}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function getSummaryCounts(houses = []) {
    const counts = {
      within_100: 0,
      between_100_125: 0,
      between_125_150: 0,
      between_150_275: 0,
      over_275: 0,
      unreachable: 0
    };

    for (const house of houses) {
      if (Object.prototype.hasOwnProperty.call(counts, house.coverageStatus)) {
        counts[house.coverageStatus] += 1;
      }
    }

    return counts;
  }

  function renderCoverageSummary() {
    const summary = state.coverage?.summary || {};
    const counts = summary.counts || getSummaryCounts(state.houses);
    const totalAddresses = Number.isFinite(summary.totalAddresses)
      ? summary.totalAddresses
      : state.houses.length;
    const containerCount = Number.isFinite(summary.containerCount)
      ? summary.containerCount
      : countRestafvalContainers(state.containers);
    const scopeLabel = state.coverage?.analysisScope?.label || '';
    const addressLabel = state.coverage?.analysisScope?.type === 'built_up_area'
      ? 'adressen binnen bebouwde kom'
      : 'adressen';
    const excludedAddressCount = Number.isFinite(summary.excludedAddressCount)
      ? summary.excludedAddressCount
      : null;
    const scopeMeta = scopeLabel
      ? `<div class="summary-meta">
        Scope: ${escapeHtml(scopeLabel)}${excludedAddressCount !== null ? `; ${excludedAddressCount.toLocaleString('nl-NL')} BAG-adressen buiten analyse.` : ''}
      </div>`
      : '';

    const distanceStats = SUMMARY_DISTANCE_ROWS
      .map(({ key, label }) => buildSummaryStat(counts[key] || 0, label, {
        total: totalAddresses,
        showPercent: true
      }))
      .join('');

    elements.coverageSummary.hidden = false;
    elements.coverageSummary.innerHTML = `
      ${buildSummaryStat(totalAddresses, addressLabel)}
      ${buildSummaryStat(containerCount, 'containers')}
      ${distanceStats}
      <div class="summary-meta">
        Gegenereerd: ${escapeHtml(formatTimestamp(state.coverage?.generatedAt))}
      </div>
      ${scopeMeta}
    `;
  }

  return {
    buildSummaryStat,
    getSummaryCounts,
    renderCoverageSummary
  };
}
