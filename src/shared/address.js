import { hasPrivateContainerAccess } from './containers.js';

const HOUSE_NUMBER_SELECTION_PATTERN = /^\d+(?:\s*-\s*\d+)?$/;

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

export function parseHouseNumberSelection(selection) {
  const normalizedSelection = normalizeWhitespace(selection);
  if (!normalizedSelection) {
    return {
      ranges: [],
      error: 'Vul huisnummers in.'
    };
  }

  const parts = normalizedSelection.split(',');
  const ranges = [];

  for (const rawPart of parts) {
    const part = normalizeWhitespace(rawPart);
    if (!part) {
      return {
        ranges: [],
        error: 'Gebruik geen lege delen in huisnummers.'
      };
    }

    if (!HOUSE_NUMBER_SELECTION_PATTERN.test(part)) {
      return {
        ranges: [],
        error: `Ongeldige huisnummerselectie: ${part}.`
      };
    }

    const [rawMin, rawMax] = part.split('-').map((value) => normalizeWhitespace(value));
    const min = Number.parseInt(rawMin, 10);
    const max = rawMax ? Number.parseInt(rawMax, 10) : min;

    if (min > max) {
      return {
        ranges: [],
        error: `Huisnummerbereik ${part} loopt terug.`
      };
    }

    ranges.push({ min, max });
  }

  return {
    ranges,
    error: ''
  };
}

export function normalizeAllowedAddressRule(rule) {
  return {
    street: normalizeWhitespace(rule?.street),
    houseNumbers: normalizeWhitespace(rule?.houseNumbers)
  };
}

export function normalizeAllowedAddressRules(rules) {
  return Array.isArray(rules)
    ? rules.map(normalizeAllowedAddressRule)
    : [];
}

export function validateAllowedAddressRules(rules) {
  const normalizedRules = normalizeAllowedAddressRules(rules);
  if (normalizedRules.length === 0) {
    return 'Voeg minimaal één adresregel toe voor een privé container.';
  }

  const seenRules = new Set();
  for (const rule of normalizedRules) {
    if (!rule.street) {
      return 'Vul voor elke adresregel een straat in.';
    }

    const parsedSelection = parseHouseNumberSelection(rule.houseNumbers);
    if (parsedSelection.error) {
      return parsedSelection.error;
    }

    const ruleKey = `${rule.street.toLowerCase()}|${rule.houseNumbers.replace(/\s+/g, '')}`;
    if (seenRules.has(ruleKey)) {
      return 'Gebruik elke adresregel maximaal één keer.';
    }
    seenRules.add(ruleKey);
  }

  return '';
}

export function isHouseNumberInSelection(houseNumber, selection) {
  if (!Number.isInteger(houseNumber)) {
    return false;
  }

  const parsedSelection = parseHouseNumberSelection(selection);
  if (parsedSelection.error) {
    return false;
  }

  return parsedSelection.ranges.some((range) => (
    houseNumber >= range.min && houseNumber <= range.max
  ));
}

export function isAddressAllowedByRule(address, rule) {
  const normalizedRule = normalizeAllowedAddressRule(rule);
  const houseNumber = getAddressBaseHouseNumber(address, normalizedRule.street);
  return isHouseNumberInSelection(houseNumber, normalizedRule.houseNumbers);
}

export function isAddressAllowedByRules(address, rules) {
  return normalizeAllowedAddressRules(rules).some((rule) => isAddressAllowedByRule(address, rule));
}

export function isContainerAllowedForHouse(house, container) {
  if (!hasPrivateContainerAccess(container)) {
    return true;
  }

  return isAddressAllowedByRules(house?.address, container.access.allowedAddresses);
}
