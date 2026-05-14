let runtimeBaseUrl = null;

function isExternalUrl(url) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
}

function getRuntimeBaseUrl() {
  if (runtimeBaseUrl) {
    return runtimeBaseUrl;
  }

  const basePath = document.querySelector('meta[name="app-base-path"]')?.getAttribute('content') || './';
  runtimeBaseUrl = new URL(basePath, document.baseURI);
  return runtimeBaseUrl;
}

function resolveRuntimeUrl(url) {
  const value = String(url);
  return isExternalUrl(value)
    ? value
    : new URL(value, getRuntimeBaseUrl()).toString();
}

export async function loadJson(url, label) {
  const response = await fetch(resolveRuntimeUrl(url));
  if (!response.ok) {
    throw new Error(`${label} mislukt (${response.status}).`);
  }
  return response.json();
}
