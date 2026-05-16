const MAP_HASH = '#kaart';
const STORY_HASH = '#visuele-uitleg';
const FIRST_STORY_PANEL_ID = 'story-ophalen';
const STORY_PANEL_HASH_PREFIX = '#story-';
const STORY_REVEAL_SELECTOR = '.visual-story-reveal';

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getHashTargetId(hash) {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

function setInert(element, isInert) {
  if (element && 'inert' in element) {
    element.inert = isInert;
  }
}

function replaceHash(hash) {
  if (window.location.hash !== hash) {
    window.history.replaceState({}, '', hash);
  }
}

function hasContainerDeepLink() {
  return new URLSearchParams(window.location.search).has('container');
}

export function bindStoryIntroEvents(api = {}) {
  const story = document.getElementById('visuele-uitleg');
  const mapTarget = document.getElementById('kaart');
  const searchInput = document.getElementById('house-search');
  const revealTarget = story?.querySelector(STORY_REVEAL_SELECTOR);

  if (!story || !mapTarget) {
    return {
      completeStoryIntro() {},
      openStoryIntro() {},
      isStoryIntroActive() {
        return false;
      }
    };
  }

  let isStoryActive = false;
  let scrollFrame = null;

  function getStoryTargetIdFromHash() {
    const { hash } = window.location;

    if (hash === STORY_HASH) {
      return FIRST_STORY_PANEL_ID;
    }

    if (!hash.startsWith(STORY_PANEL_HASH_PREFIX)) {
      return null;
    }

    const targetId = getHashTargetId(hash);
    const target = document.getElementById(targetId);
    return target && story.contains(target) ? targetId : null;
  }

  function setStoryState(nextIsActive) {
    isStoryActive = nextIsActive;
    document.body.classList.toggle('story-intro-active', nextIsActive);
    document.body.classList.toggle('map-view-active', !nextIsActive);

    if (nextIsActive) {
      story.hidden = false;
    }

    setInert(story, !nextIsActive);
    setInert(mapTarget, nextIsActive);

    if (!nextIsActive) {
      story.hidden = true;
    }
  }

  function blurActiveMapElement() {
    const activeElement = document.activeElement;

    if (activeElement && activeElement !== document.body && mapTarget.contains(activeElement)) {
      activeElement.blur();
    }
  }

  function scrollStoryToTarget(targetId = FIRST_STORY_PANEL_ID, { behavior = 'auto' } = {}) {
    const target = document.getElementById(targetId);
    const top = target && story.contains(target) ? target.offsetTop : 0;

    if (behavior === 'auto') {
      story.scrollTop = top;
      return;
    }

    story.scrollTo({
      top,
      behavior
    });
  }

  function completeStoryIntro({ focusSearch = false, updateHash = true } = {}) {
    setStoryState(false);

    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }

    if (updateHash) {
      replaceHash(MAP_HASH);
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });

    const mapRequest = api.onMapRequested?.({ focusSearch });

    if (focusSearch && !mapRequest) {
      window.requestAnimationFrame(() => {
        searchInput?.focus({ preventScroll: true });
      });
    }
  }

  function openStoryIntro({
    targetId = FIRST_STORY_PANEL_ID,
    updateHash = true,
    focusStory = false,
    behavior = 'auto'
  } = {}) {
    blurActiveMapElement();
    setStoryState(true);
    scrollStoryToTarget(targetId, { behavior });

    if (updateHash) {
      replaceHash(targetId === FIRST_STORY_PANEL_ID ? STORY_HASH : `#${targetId}`);
    }

    if (focusStory) {
      window.requestAnimationFrame(() => {
        story.focus({ preventScroll: true });
      });
    }
  }

  function shouldCompleteFromScroll() {
    if (!isStoryActive) {
      return false;
    }

    const revealTop = revealTarget?.offsetTop ?? story.scrollHeight - story.clientHeight;
    return story.scrollTop >= revealTop - 1;
  }

  function checkStoryScrollPosition() {
    scrollFrame = null;

    if (shouldCompleteFromScroll()) {
      completeStoryIntro({ focusSearch: false });
    }
  }

  function scheduleStoryScrollCheck() {
    if (scrollFrame !== null) {
      return;
    }

    scrollFrame = window.requestAnimationFrame(checkStoryScrollPosition);
  }

  document.querySelectorAll('[data-focus-search]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      completeStoryIntro({ focusSearch: true });
    });
  });

  story.querySelectorAll(`a[href^="${STORY_PANEL_HASH_PREFIX}"]`).forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      const targetId = hash ? getHashTargetId(hash) : '';
      const target = document.getElementById(targetId);

      if (!target || !story.contains(target)) {
        return;
      }

      event.preventDefault();
      scrollStoryToTarget(targetId, {
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
      window.history.pushState({}, '', hash);
    });
  });

  document.querySelectorAll(`a[href="${STORY_HASH}"]`).forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openStoryIntro({ focusStory: true });
    });
  });

  function syncStoryStateFromLocation() {
    const storyTargetId = getStoryTargetIdFromHash();

    if (window.location.hash === MAP_HASH) {
      completeStoryIntro({ updateHash: false });
      return;
    }

    if (storyTargetId) {
      openStoryIntro({
        targetId: storyTargetId,
        updateHash: false,
        behavior: 'auto'
      });
    }
  }

  window.addEventListener('hashchange', syncStoryStateFromLocation);
  window.addEventListener('popstate', syncStoryStateFromLocation);
  story.addEventListener('scroll', scheduleStoryScrollCheck, { passive: true });

  const initialStoryTargetId = getStoryTargetIdFromHash();

  if (window.location.hash === MAP_HASH || hasContainerDeepLink()) {
    completeStoryIntro({ updateHash: false });
  } else {
    openStoryIntro({
      targetId: initialStoryTargetId || FIRST_STORY_PANEL_ID,
      updateHash: false
    });
  }

  const controls = {
    completeStoryIntro,
    openStoryIntro,
    isStoryIntroActive() {
      return isStoryActive;
    }
  };

  Object.assign(api, controls);
  return controls;
}
