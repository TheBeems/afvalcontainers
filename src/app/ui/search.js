import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_RESULT_LIMIT
} from '../config.js';
import { escapeHtml } from '../../shared/html.js';

export function createSearch(context, api) {
  const { state } = context;

  async function initSearch() {
    return new Promise((resolve) => {
      if (typeof Fuse === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
        script.onload = () => {
          if (typeof Fuse !== 'undefined') {
            setupSearch();
          }
          resolve();
        };
        script.onerror = () => {
          resolve();
        };
        document.head.appendChild(script);
      } else {
        setupSearch();
        resolve();
      }
    });
  }

  function setupSearch() {
    const input = document.getElementById('house-search');
    const resultsDiv = document.getElementById('search-results');

    if (!input || !resultsDiv) {
      return;
    }

    const searchRoot = input.closest('.search-panel') || input;

    const fuse = new Fuse(state.houses, {
      keys: ['address', 'postcode'],
      includeScore: true,
      threshold: 0.3
    });

    let matches = [];
    let activeIndex = -1;

    function getQuery() {
      return input.value.trim();
    }

    function getResultId(index) {
      return `search-result-${index}`;
    }

    function setExpanded(isExpanded) {
      input.setAttribute('aria-expanded', String(isExpanded));
    }

    function clearActiveResult() {
      activeIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }

    function closeResults() {
      matches = [];
      resultsDiv.innerHTML = '';
      clearActiveResult();
      setExpanded(false);
    }

    function setActiveIndex(nextIndex) {
      if (matches.length === 0) {
        clearActiveResult();
        return;
      }

      activeIndex = (nextIndex + matches.length) % matches.length;

      const buttons = resultsDiv.querySelectorAll('.search-result');

      buttons.forEach((button, index) => {
        const isActive = index === activeIndex;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });

      const activeButton = buttons[activeIndex];

      if (activeButton) {
        input.setAttribute('aria-activedescendant', activeButton.id);
        activeButton.scrollIntoView({ block: 'nearest' });
      }
    }

    function selectMatch(index = activeIndex) {
      const match = matches[index];

      if (!match) {
        return;
      }

      const house = match.item;

      api.selectHouse(house, { focusMap: true });
      input.value = house.address;
      closeResults();
    }

    function renderEmptyResult() {
      resultsDiv.innerHTML = '<div class="search-empty" role="status">Geen adres gevonden.</div>';
      clearActiveResult();
      setExpanded(true);
    }

    function createResultButton(result, index) {
      const house = result.item;
      const postcode = house.postcode ? `${house.postcode} ` : '';
      const city = house.city || 'Warmenhuizen';

      const button = document.createElement('button');
      button.type = 'button';
      button.id = getResultId(index);
      button.className = 'search-result';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;

      button.innerHTML = `
        <span class="search-result-address">${escapeHtml(house.address)}</span>
        <span class="search-result-meta">${escapeHtml(postcode)}${escapeHtml(city)}</span>
      `;

      button.addEventListener('pointerenter', () => setActiveIndex(index));
      button.addEventListener('click', () => selectMatch(index));

      return button;
    }

    function renderResults() {
      const query = getQuery();

      resultsDiv.innerHTML = '';
      matches = [];
      clearActiveResult();

      if (query.length < SEARCH_MIN_QUERY_LENGTH) {
        setExpanded(false);
        return;
      }

      matches = fuse.search(query).slice(0, SEARCH_RESULT_LIMIT);

      if (matches.length === 0) {
        renderEmptyResult();
        return;
      }

      const fragment = document.createDocumentFragment();

      matches.forEach((result, index) => {
        fragment.appendChild(createResultButton(result, index));
      });

      resultsDiv.appendChild(fragment);
      setExpanded(true);
      setActiveIndex(0);
    }

    function handleSearchKeydown(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();

        if (matches.length === 0) {
          renderResults();
        }

        setActiveIndex(activeIndex + 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        if (matches.length === 0) {
          renderResults();
        }

        setActiveIndex(activeIndex - 1);
        return;
      }

      if (event.key === 'Enter') {
        if (matches.length > 0 && activeIndex >= 0) {
          event.preventDefault();
          selectMatch();
        }

        return;
      }

      if (event.key === 'Escape') {
        closeResults();
      }
    }

    input.addEventListener('input', renderResults);
    input.addEventListener('focus', () => {
      if (getQuery()) {
        renderResults();
      }
    });
    input.addEventListener('keydown', handleSearchKeydown);

    document.addEventListener('pointerdown', (event) => {
      if (!searchRoot.contains(event.target)) {
        closeResults();
      }
    });
  }

  return {
    initSearch,
    setupSearch
  };
}
