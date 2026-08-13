export const RESIDENTIAL_USE_PURPOSE = 'woonfunctie';

export function getBagUsePurposes(value) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((entry) => String(entry || '').split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function hasResidentialUsePurpose(value) {
  return getBagUsePurposes(value).includes(RESIDENTIAL_USE_PURPOSE);
}
