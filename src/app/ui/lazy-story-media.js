const STORY_SELECTOR = '#visuele-uitleg';
const LAZY_MEDIA_SELECTOR = '[data-story-lazy-media]';
const LAZY_SOURCE_SELECTOR = 'source[data-srcset]';
const LAZY_IMAGE_SELECTOR = 'img[data-src]';
const LOADED_CLASS = 'visual-story-media-loaded';
const storyAssetUrls = import.meta.glob('../../assets/story/generated/*.{avif,png,webp}', {
  eager: true,
  import: 'default',
  query: '?url'
});

function getStoryAssetUrl(url) {
  const fileName = String(url).split('/').pop();
  const assetKey = Object.keys(storyAssetUrls).find((key) => key.endsWith(`/${fileName}`));
  return assetKey ? storyAssetUrls[assetKey] : url;
}

function resolveStorySrcset(srcset) {
  return String(srcset).split(',').map((candidate) => {
    const parts = candidate.trim().split(/\s+/);
    const url = parts.shift();
    return [getStoryAssetUrl(url), ...parts].join(' ');
  }).join(', ');
}

function hydrateStoryMedia(media) {
  media.querySelectorAll(LAZY_SOURCE_SELECTOR).forEach((source) => {
    source.srcset = resolveStorySrcset(source.dataset.srcset || '');
    source.removeAttribute('data-srcset');
  });

  media.querySelectorAll(LAZY_IMAGE_SELECTOR).forEach((image) => {
    image.src = getStoryAssetUrl(image.dataset.src || '');
    image.removeAttribute('data-src');
  });

  media.classList.add(LOADED_CLASS);
  media.removeAttribute('data-story-lazy-media');
}

export function initLazyStoryMedia() {
  const story = document.querySelector(STORY_SELECTOR);
  const lazyMedia = Array.from(document.querySelectorAll(LAZY_MEDIA_SELECTOR));

  if (lazyMedia.length === 0) {
    return;
  }

  if (!('IntersectionObserver' in window)) {
    lazyMedia.forEach(hydrateStoryMedia);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      hydrateStoryMedia(entry.target);
      observer.unobserve(entry.target);
    });
  }, {
    root: story || null,
    rootMargin: '0px 0px -1px 0px'
  });

  lazyMedia.forEach((media) => {
    observer.observe(media);
  });
}
