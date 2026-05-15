import {
  MOBILE_MAP_SCROLL_QUERY,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_RESULT_LIMIT
} from '../config.js';
import { escapeHtml } from '../../shared/html.js';

const MOBILE_SEARCH_ACTIVE_CLASS = 'mobile-search-active';

function formatCssPixel(value) {
  return `${Number.isFinite(value) ? value.toFixed(2) : '0'}px`;
}

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

    let mobileQuery = null;
    let matches = [];
    let activeIndex = -1;
    let fuse = null;
    let fusePlaceId = null;
    let fuseConstructorPromise = null;
    let searchRequestId = 0;
    let isMobileSearchActive = false;
    let searchViewportFrame = null;

    function isMobileSearchViewport() {
      if (!mobileQuery && typeof window.matchMedia === 'function') {
        mobileQuery = window.matchMedia(MOBILE_MAP_SCROLL_QUERY);
      }

      return mobileQuery?.matches || false;
    }

    function clearSearchViewportVariables() {
      searchRoot.style.removeProperty('--search-viewport-top');
      searchRoot.style.removeProperty('--search-viewport-left');
      searchRoot.style.removeProperty('--search-viewport-width');
      searchRoot.style.removeProperty('--search-viewport-height');
    }

    function syncSearchViewport() {
      searchViewportFrame = null;

      if (!isMobileSearchActive || !window.visualViewport) {
        return;
      }

      const { offsetTop, offsetLeft, width, height } = window.visualViewport;

      searchRoot.style.setProperty('--search-viewport-top', formatCssPixel(offsetTop));
      searchRoot.style.setProperty('--search-viewport-left', formatCssPixel(offsetLeft));
      searchRoot.style.setProperty('--search-viewport-width', formatCssPixel(width));
      searchRoot.style.setProperty('--search-viewport-height', formatCssPixel(height));
    }

    function scheduleSearchViewportSync() {
      if (!isMobileSearchActive || searchViewportFrame !== null) {
        return;
      }

      searchViewportFrame = window.requestAnimationFrame(syncSearchViewport);
    }

    function deactivateMobileSearchMode({ blurInput = false } = {}) {
      if (!isMobileSearchActive && !document.body.classList.contains(MOBILE_SEARCH_ACTIVE_CLASS)) {
        return;
      }

      isMobileSearchActive = false;
      document.body.classList.remove(MOBILE_SEARCH_ACTIVE_CLASS);
      clearSearchViewportVariables();

      if (searchViewportFrame !== null) {
        window.cancelAnimationFrame(searchViewportFrame);
        searchViewportFrame = null;
      }

      if (blurInput && document.activeElement === input) {
        input.blur();
      }
    }

    function activateMobileSearchMode() {
      if (!window.visualViewport || !isMobileSearchViewport()) {
        return;
      }

      isMobileSearchActive = true;
      document.body.classList.add(MOBILE_SEARCH_ACTIVE_CLASS);
      syncSearchViewport();
    }

    function handleSearchViewportChange() {
      if (!isMobileSearchActive) {
        return;
      }

      if (!isMobileSearchViewport()) {
        deactivateMobileSearchMode();
        return;
      }

      scheduleSearchViewportSync();
    }

    function handleSearchFocusOut() {
      window.requestAnimationFrame(() => {
        if (!searchRoot.contains(document.activeElement)) {
          deactivateMobileSearchMode();
        }
      });
    }

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
      deactivateMobileSearchMode({ blurInput: true });
      api.closeMobileSidebarIfMobile?.();
      api.scrollMapIntoView?.();
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
        deactivateMobileSearchMode({ blurInput: true });
      }
    }

    input.addEventListener('input', () => {
      void renderResults();
    });
    input.addEventListener('focus', () => {
      activateMobileSearchMode();

      if (getQuery()) {
        void renderResults();
      }
    });
    input.addEventListener('keydown', handleSearchKeydown);
    searchRoot.addEventListener('focusin', activateMobileSearchMode);
    searchRoot.addEventListener('focusout', handleSearchFocusOut);

    window.addEventListener('resize', handleSearchViewportChange);
    window.visualViewport?.addEventListener('resize', handleSearchViewportChange);
    window.visualViewport?.addEventListener('scroll', handleSearchViewportChange);
    window.visualViewport?.addEventListener('scrollend', handleSearchViewportChange);

    document.addEventListener('pointerdown', (event) => {
      if (!searchRoot.contains(event.target)) {
        closeResults();
        deactivateMobileSearchMode({ blurInput: true });
      }
    });
  }

  return {
    initSearch,
    setupSearch
  };
}
