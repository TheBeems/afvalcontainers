import { hasPrivateContainerAccess } from './containers.js';

export function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function getAddressBaseHouseNumber(address, street) {
  const normalizedStreet = normalizeWhitespace(street);
  const normalizedAddress = normalizeWhitespace(address);
  const prefix = `${normalizedStreet} `;

  if (!normalizedStreet || !normalizedAddress.startsWith(prefix)) {
    return null;
  }

  const houseNumberMatch = normalizedAddress.slice(prefix.length).match(/^(\d+)/);
  if (!houseNumberMatch) {
    return null;
  }

  return Number.parseInt(houseNumberMatch[1], 10);
}

export function isAddressInAllowedRange(address, range) {
  if (!range) {
    return false;
  }

  const houseNumber = getAddressBaseHouseNumber(address, range.street);
  return Number.isInteger(houseNumber)
    && houseNumber >= range.minHouseNumber
    && houseNumber <= range.maxHouseNumber;
}

export function isContainerAllowedForHouse(house, container) {
  if (!hasPrivateContainerAccess(container)) {
    return true;
  }

  return isAddressInAllowedRange(house?.address, container.access.allowedAddressRange);
}
