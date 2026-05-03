import { MOBILE_MAP_SCROLL_QUERY } from '../config.js';

const MOBILE_SIDEBAR_OPEN_CLASS = 'mobile-sidebar-open';

export function createMobileSidebar(context) {
  const { elements } = context;
  let isOpen = false;
  let mobileQuery = null;

  function isMobileSidebarViewport() {
    if (!mobileQuery && typeof window.matchMedia === 'function') {
      mobileQuery = window.matchMedia(MOBILE_MAP_SCROLL_QUERY);
    }

    return mobileQuery?.matches || false;
  }

  function syncMobileSidebarState() {
    const isMobile = isMobileSidebarViewport();
    if (!isMobile) {
      isOpen = false;
    }

    const shouldOpen = isMobile && isOpen;

    document.body.classList.toggle(MOBILE_SIDEBAR_OPEN_CLASS, shouldOpen);

    if (elements.mobileSidebarToggle) {
      elements.mobileSidebarToggle.setAttribute('aria-expanded', String(shouldOpen));
      elements.mobileSidebarToggle.setAttribute('aria-label', shouldOpen ? 'Menu sluiten' : 'Menu openen');
    }

    if (elements.mobileSidebarOverlay) {
      elements.mobileSidebarOverlay.setAttribute('aria-hidden', String(!shouldOpen));
    }

    if (elements.sidebar) {
      if (isMobile && !shouldOpen) {
        elements.sidebar.setAttribute('aria-hidden', 'true');
      } else {
        elements.sidebar.removeAttribute('aria-hidden');
      }

      if ('inert' in elements.sidebar) {
        elements.sidebar.inert = isMobile && !shouldOpen;
      }
    }

    if (elements.mapShell && 'inert' in elements.mapShell) {
      elements.mapShell.inert = shouldOpen;
    }
  }

  function openMobileSidebar() {
    if (!isMobileSidebarViewport()) {
      return;
    }

    isOpen = true;
    syncMobileSidebarState();
  }

  function closeMobileSidebar({ restoreFocus = false } = {}) {
    isOpen = false;
    syncMobileSidebarState();

    if (restoreFocus) {
      elements.mobileSidebarToggle?.focus();
    }
  }

  function toggleMobileSidebar() {
    if (!isMobileSidebarViewport()) {
      return;
    }

    isOpen = !isOpen;
    syncMobileSidebarState();
  }

  function closeMobileSidebarIfMobile() {
    if (isMobileSidebarViewport()) {
      closeMobileSidebar();
    }
  }

  function handleMobileSidebarKeydown(event) {
    if (event.key === 'Escape' && isOpen) {
      closeMobileSidebar({ restoreFocus: true });
    }
  }

  function bindMobileSidebarEvents() {
    elements.mobileSidebarToggle?.addEventListener('click', toggleMobileSidebar);
    elements.mobileSidebarOverlay?.addEventListener('click', () => closeMobileSidebar({ restoreFocus: true }));
    document.addEventListener('keydown', handleMobileSidebarKeydown);

    if (typeof window.matchMedia === 'function') {
      const query = mobileQuery || window.matchMedia(MOBILE_MAP_SCROLL_QUERY);
      mobileQuery = query;

      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', syncMobileSidebarState);
      } else if (typeof query.addListener === 'function') {
        query.addListener(syncMobileSidebarState);
      }
    }

    syncMobileSidebarState();
  }

  return {
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
    closeMobileSidebarIfMobile,
    bindMobileSidebarEvents
  };
}
