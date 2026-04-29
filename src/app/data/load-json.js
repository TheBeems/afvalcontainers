export async function loadJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} mislukt (${response.status}).`);
  }
  return response.json();
}
