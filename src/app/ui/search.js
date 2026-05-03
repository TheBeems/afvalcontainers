import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_RESULT_LIMIT
} from '../config.js';
import { escapeHtml } from '../../shared/html.js';

export function createSearch(context, api) {
  const { state } = context;

  async function initSearch() {
    setupSearch();
  }

  function setupSearch() {
    const input = document.getElementById('house-search');
    const resultsDiv = document.getElementById('search-results');

    if (!input || !resultsDiv) {
      return;
    }

    const searchRoot = input.closest('.search-panel') || input;

    let matches = [];
    let activeIndex = -1;
    let fuse = null;
    let fusePlaceId = null;
    let fuseConstructorPromise = null;
    let searchRequestId = 0;

    async function getFuseConstructor() {
      if (!fuseConstructorPromise) {
        fuseConstructorPromise = import('fuse.js').then((module) => module.default || module);
      }
      return fuseConstructorPromise;
    }

    async function ensureActiveFuse() {
      const placeId = state.activePlace?.id;
      if (!placeId) {
        return false;
      }

      if (fuse && fusePlaceId === placeId) {
        return true;
      }

      const [FuseConstructor, addressIndex] = await Promise.all([
        getFuseConstructor(),
        api.loadActiveAddressIndex()
      ]);

      if (state.activePlace?.id !== placeId) {
        return false;
      }

      fuse = new FuseConstructor(addressIndex, {
        keys: ['address', 'postcode'],
        includeScore: true,
        threshold: 0.3
      });
      fusePlaceId = placeId;
      return true;
    }

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

    async function selectMatch(index = activeIndex) {
      const match = matches[index];

      if (!match) {
        return;
      }

      const house = match.item;

      input.value = house.address;
      closeResults();
      api.closeMobileSidebarIfMobile?.();
      await api.selectPlace(house.placeId, {
        selectedHouseId: house.id,
        focusMap: true
      });
    }

    function renderStatusResult(message) {
      resultsDiv.innerHTML = `<div class="search-empty" role="status">${escapeHtml(message)}</div>`;
      clearActiveResult();
      setExpanded(true);
    }

    function createResultButton(result, index) {
      const house = result.item;
      const postcode = house.postcode ? `${house.postcode} ` : '';
      const city = house.city || api.getPlaceById(house.placeId)?.name || api.getActivePlaceCity();

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
      button.addEventListener('click', () => {
        void selectMatch(index);
      });

      return button;
    }

    async function renderResults() {
      const requestId = searchRequestId + 1;
      searchRequestId = requestId;
      const query = getQuery();

      resultsDiv.innerHTML = '';
      matches = [];
      clearActiveResult();

      if (query.length < SEARCH_MIN_QUERY_LENGTH) {
        setExpanded(false);
        return;
      }

      renderStatusResult('Adresindex wordt geladen...');

      try {
        const isReady = await ensureActiveFuse();
        if (!isReady || requestId !== searchRequestId || query !== getQuery()) {
          return;
        }
      } catch (error) {
        if (requestId === searchRequestId) {
          renderStatusResult('Adresindex kon niet worden geladen.');
        }
        return;
      }

      resultsDiv.innerHTML = '';
      matches = fuse.search(query).slice(0, SEARCH_RESULT_LIMIT);

      if (matches.length === 0) {
        renderStatusResult('Geen adres gevonden.');
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
          void renderResults();
        }

        setActiveIndex(activeIndex + 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        if (matches.length === 0) {
          void renderResults();
        }

        setActiveIndex(activeIndex - 1);
        return;
      }

      if (event.key === 'Enter') {
        if (matches.length > 0 && activeIndex >= 0) {
          event.preventDefault();
          void selectMatch();
        }

        return;
      }

      if (event.key === 'Escape') {
        closeResults();
      }
    }

    input.addEventListener('input', () => {
      void renderResults();
    });
    input.addEventListener('focus', () => {
      if (getQuery()) {
        void renderResults();
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
