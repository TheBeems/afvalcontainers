#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');

const DEFAULT_INPUT = resolve(scriptDirectory, 'fixed-existing-household-coverage-225.json');
const DEFAULT_SVG_OUTPUT = resolve(scriptDirectory, 'fixed-existing-household-coverage-map.svg');
const DEFAULT_HTML_OUTPUT = resolve(scriptDirectory, 'fixed-existing-household-coverage-map.html');
const HOUSE_COVERAGE_PATH = resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json');
const CONTAINER_PATH = resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json');
const WALKING_MATRIX_PATH = resolve(scriptDirectory, 'walking-matrix.json');
const ROAD_PATH = resolve(scriptDirectory, 'osm-highways.json');
const SCREENED_LOCATIONS_PATH = resolve(scriptDirectory, 'recommended-locations.json');
const AERIAL_NORTH_PATH = resolve(scriptDirectory, 'aerial-assessment-sites-01-22.json');
const AERIAL_SOUTH_PATH = resolve(scriptDirectory, 'aerial-assessment-sites-23-43.json');

const WIDTH = 1400;
const HEIGHT = 1700;
const MAP = { x: 48, y: 252, width: 1304, height: 1250 };
const METERS_PER_LATITUDE_DEGREE = 111_320;

const DISTANCE_BANDS = [
  { key: 'within_100', label: '0–100 m', color: '#15803d', matches: (distance) => distance <= 100 },
  { key: 'between_100_125', label: '100–125 m', color: '#eab308', matches: (distance) => distance <= 125 },
  { key: 'between_125_150', label: '125–150 m', color: '#f97316', matches: (distance) => distance <= 150 },
  { key: 'between_150_275', label: '150–275 m', color: '#dc2626', matches: (distance) => distance <= 275 },
  { key: 'over_275', label: 'Meer dan 275 m', color: '#7f1d1d', matches: () => true },
  { key: 'unreachable', label: 'Geen route', color: '#64748b', matches: () => true }
];

function parseArguments(argv) {
  const options = {
    input: DEFAULT_INPUT,
    svgOutput: DEFAULT_SVG_OUTPUT,
    htmlOutput: DEFAULT_HTML_OUTPUT
  };

  for (const argument of argv) {
    if (argument === '--help') {
      console.log(`Usage: node ${basename(fileURLToPath(import.meta.url))} [options]

Options:
  --input=PATH       Optimizer result (default: fixed-existing-household-coverage-225.json)
  --svg-output=PATH  Standalone SVG output
  --html-output=PATH Standalone interactive HTML output
  --help             Show this help text`);
      process.exit(0);
    }

    const [name, ...valueParts] = argument.split('=');
    const value = valueParts.join('=');
    if (!value || !name.startsWith('--')) {
      throw new Error(`Unknown argument: ${argument}`);
    }

    if (name === '--input') options.input = resolve(process.cwd(), value);
    else if (name === '--svg-output') options.svgOutput = resolve(process.cwd(), value);
    else if (name === '--html-output') options.htmlOutput = resolve(process.cwd(), value);
    else throw new Error(`Unknown argument: ${name}`);
  }

  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function valueAt(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path.split('.')) value = value?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstArray(object, paths) {
  const value = valueAt(object, paths);
  return Array.isArray(value) ? value : [];
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return normalizeId(value.id ?? value.containerId ?? value.candidateId ?? value.siteId);
  }
  return String(value);
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value) {
  return escapeXml(value);
}

function classifyDistance(distance) {
  if (!Number.isFinite(distance)) return DISTANCE_BANDS.at(-1);
  return DISTANCE_BANDS.slice(0, -1).find((band) => band.matches(distance));
}

function extractMandatoryExistingIds(scenario) {
  const arrays = [
    'mandatoryExistingIds',
    'mandatoryExistingContainerIds',
    'fixedExistingIds',
    'constraints.mandatoryExistingIds',
    'solution.mandatoryExistingIds',
    'selectedExistingIds',
    'solution.selectedExistingIds'
  ].flatMap((path) => firstArray(scenario, [path]));
  return new Set(arrays.map(normalizeId).filter(Boolean));
}

function getCapacitySensitivity(scenario, capacityPerContainer) {
  return firstArray(scenario, ['capacitySensitivity', 'solution.capacitySensitivity']).find((entry) => (
    Number(entry.capacityPerContainerAddressEquivalents) === capacityPerContainer
  ));
}

function getLocationUnitsForCapacity(scenario, locationId, capacityPerContainer) {
  const sensitivity = getCapacitySensitivity(scenario, capacityPerContainer);
  if (!sensitivity?.feasible) return null;
  return 1 + Number(sensitivity.extraContainersByLocation?.[locationId] ?? 0);
}

function normalizeSiteRole(site, mandatoryExistingIds, sourceContainer) {
  const explicit = String(
    site.role
    ?? site.kind
    ?? site.locationType
    ?? site.sourceType
    ?? site.status
    ?? ''
  ).toLowerCase();
  const id = normalizeId(site.id ?? site.containerId ?? site.candidateId ?? site.siteId);

  if (
    explicit.includes('existing')
    || explicit.includes('bestaand')
    || explicit.includes('hvc')
    || mandatoryExistingIds.has(id)
    || sourceContainer?.sourceType === 'hvc-existing'
    || sourceContainer?.streams?.some((stream) => stream.status === 'existing')
  ) {
    const accessScope = site.accessScope
      ?? sourceContainer?.accessScope
      ?? (sourceContainer?.access?.allowedAddresses ? 'private' : 'public');
    return accessScope === 'private' ? 'existing-private' : 'existing-public';
  }
  return 'additional';
}

function extractSites(scenario, walkingMatrix, sourceContainers, screenedLocations, aerialAssessments) {
  const mandatoryExistingIds = extractMandatoryExistingIds(scenario);
  const candidateById = new Map(walkingMatrix.candidates.map((candidate) => [String(candidate.id), candidate]));
  const sourceById = new Map(sourceContainers.map((container) => [String(container.id), container]));
  const screenedByNode = new Map(screenedLocations.sites.map((site) => [site.node, site]));
  const aerialBySite = new Map(aerialAssessments.map((site) => [site.site, site]));
  let rawSites = firstArray(scenario, [
    'selectedSites',
    'selectedLocations',
    'selectedContainers',
    'locations',
    'sites',
    'solution.selectedSites',
    'solution.selectedLocations',
    'solution.selectedContainers',
    'solution.locations',
    'solution.sites'
  ]);

  if (rawSites.length === 0) {
    const selectedIds = [
      ...firstArray(scenario, ['selectedCandidateIds', 'solution.selectedCandidateIds']),
      ...firstArray(scenario, ['additionalSelectedCandidateIds', 'solution.additionalSelectedCandidateIds']),
      ...mandatoryExistingIds
    ];
    rawSites = selectedIds.map((id) => ({ id: normalizeId(id) }));
  }

  const grouped = new Map();
  for (const rawSite of rawSites) {
    const objectSite = typeof rawSite === 'object' ? rawSite : { id: rawSite };
    const id = normalizeId(objectSite.id ?? objectSite.containerId ?? objectSite.candidateId ?? objectSite.siteId);
    if (!id) throw new Error('Every selected location needs an id, containerId, candidateId, or siteId.');
    const candidate = candidateById.get(id);
    const source = sourceById.get(id) ?? candidate;
    const graphNode = finiteNumber(objectSite.graphNode, candidate?.node, candidate?.graphNode);
    const oldScreen = screenedByNode.get(graphNode);
    const aerial = oldScreen ? aerialBySite.get(oldScreen.site) : null;
    const lat = finiteNumber(objectSite.lat, objectSite.latitude, candidate?.lat, candidate?.latitude, source?.lat);
    const lon = finiteNumber(objectSite.lon, objectSite.longitude, candidate?.lon, candidate?.longitude, source?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`Selected location ${id} has no usable coordinates.`);
    }

    const units = finiteNumber(
      objectSite.capacityUnits,
      objectSite.containerUnits,
      objectSite.unitCount,
      objectSite.containers,
      objectSite.binCount
    );
    const role = normalizeSiteRole(objectSite, mandatoryExistingIds, source);
    const key = `${role}:${id}`;
    const previous = grouped.get(key);
    if (previous) {
      previous.units = Number.isFinite(previous.units) && Number.isFinite(units)
        ? previous.units + units
        : null;
      continue;
    }

    grouped.set(key, {
      id,
      role,
      lat,
      lon,
      units,
      site: finiteNumber(objectSite.site, objectSite.siteNumber, candidate?.site),
      graphNode,
      oldSite: oldScreen?.site ?? null,
      oldReferenceAddress: oldScreen?.referenceAddress ?? null,
      street: oldScreen?.street ?? null,
      aerialRating: aerial?.status ?? aerial?.rating ?? null,
      capacityUnitsAt100: getLocationUnitsForCapacity(scenario, id, 100),
      capacityUnitsAt75: getLocationUnitsForCapacity(scenario, id, 75),
      address: objectSite.address
        ?? objectSite.referenceAddress
        ?? candidate?.address
        ?? source?.address
        ?? oldScreen?.referenceAddress
        ?? '',
      sourceType: objectSite.sourceType ?? candidate?.sourceType ?? null,
      accessScope: objectSite.accessScope ?? source?.accessScope ?? (role === 'existing-private' ? 'private' : 'public')
    });
  }

  const sites = [...grouped.values()];
  const existing = sites.filter((site) => site.role.startsWith('existing-'));
  const additional = sites.filter((site) => site.role === 'additional');
  existing.forEach((site) => { site.displayId = site.id; });
  additional.forEach((site, index) => {
    site.displayId = site.site ? `A${site.site}` : `A${index + 1}`;
  });
  return sites;
}

function extractHouseholdRows(scenario, houses) {
  const rawRows = firstArray(scenario, [
    'households',
    'householdCoverage',
    'houses',
    'assignments',
    'solution.households',
    'solution.householdCoverage',
    'solution.houses',
    'solution.assignments'
  ]);
  const explicitHouseIds = firstArray(scenario, ['houseIds', 'solution.houseIds']);
  const explicitDistances = firstArray(scenario, [
    'walkingDistancesM',
    'nearestDistancesM',
    'distances',
    'solution.walkingDistancesM',
    'solution.nearestDistancesM',
    'solution.distances'
  ]);
  const explicitAssignments = firstArray(scenario, [
    'assignedContainerIds',
    'nearestContainerIds',
    'solution.assignedContainerIds',
    'solution.nearestContainerIds'
  ]);

  if (rawRows.length > 0) return rawRows;
  if (explicitDistances.length === houses.length) {
    return houses.map((house, index) => ({
      houseId: explicitHouseIds[index] ?? house.id,
      walkingDistanceM: explicitDistances[index],
      assignedContainerId: explicitAssignments[index]
    }));
  }
  throw new Error(
    'Optimizer result needs household rows or a distances array aligned with all houses. '
    + 'See fixed-existing-household-coverage-input-contract.md.'
  );
}

function normalizeHouseholds(scenario, houses) {
  const rows = extractHouseholdRows(scenario, houses);
  const houseById = new Map(houses.map((house) => [String(house.id), house]));
  const normalized = rows.map((row, index) => {
    const objectRow = typeof row === 'object' ? row : { walkingDistanceM: row };
    const houseId = normalizeId(objectRow.houseId ?? objectRow.id ?? objectRow.addressId);
    const houseIndex = finiteNumber(objectRow.houseIndex, objectRow.index);
    const sourceHouse = houseById.get(houseId) ?? (Number.isInteger(houseIndex) ? houses[houseIndex] : houses[index]);
    if (!sourceHouse) throw new Error(`Household row ${index} cannot be matched to a BAG address.`);
    const distance = finiteNumber(
      objectRow.walkingDistanceM,
      objectRow.distanceM,
      objectRow.distance,
      objectRow.nearestDistanceM,
      objectRow.cost
    );
    const unreachable = objectRow.unreachable === true || objectRow.reachable === false;
    return {
      id: sourceHouse.id,
      address: sourceHouse.address,
      lat: finiteNumber(objectRow.lat, objectRow.latitude, sourceHouse.lat),
      lon: finiteNumber(objectRow.lon, objectRow.longitude, sourceHouse.lon),
      distance: unreachable ? null : distance,
      coverageStatus: objectRow.coverageStatus,
      containerId: normalizeId(
        objectRow.assignedContainerId
        ?? objectRow.nearestContainerId
        ?? objectRow.nearestLocationId
        ?? objectRow.containerId
        ?? objectRow.siteId
      )
    };
  });

  if (normalized.length !== houses.length) {
    throw new Error(`Expected ${houses.length} household rows, received ${normalized.length}.`);
  }
  if (new Set(normalized.map((house) => house.id)).size !== houses.length) {
    throw new Error('Household rows do not map one-to-one to the BAG household dataset.');
  }
  return normalized;
}

function buildProjection(households, sites) {
  const coordinates = [
    ...households.map(({ lat, lon }) => ({ lat, lon })),
    ...sites.map(({ lat, lon }) => ({ lat, lon }))
  ];
  const minLat = Math.min(...coordinates.map(({ lat }) => lat));
  const maxLat = Math.max(...coordinates.map(({ lat }) => lat));
  const minLon = Math.min(...coordinates.map(({ lon }) => lon));
  const maxLon = Math.max(...coordinates.map(({ lon }) => lon));
  const meanLat = (minLat + maxLat) / 2;
  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE * Math.cos(meanLat * Math.PI / 180);
  const rangeX = (maxLon - minLon) * metersPerLongitudeDegree;
  const rangeY = (maxLat - minLat) * METERS_PER_LATITUDE_DEGREE;
  const padding = 32;
  const scale = Math.min((MAP.width - 2 * padding) / rangeX, (MAP.height - 2 * padding) / rangeY);
  const contentWidth = rangeX * scale;
  const contentHeight = rangeY * scale;
  const offsetX = MAP.x + (MAP.width - contentWidth) / 2;
  const offsetY = MAP.y + (MAP.height - contentHeight) / 2;
  return {
    minLat,
    maxLat,
    minLon,
    maxLon,
    project(lat, lon) {
      return {
        x: offsetX + (lon - minLon) * metersPerLongitudeDegree * scale,
        y: offsetY + (maxLat - lat) * METERS_PER_LATITUDE_DEGREE * scale
      };
    }
  };
}

function roadStyle(highway) {
  if (highway === 'tertiary') return { width: 5, color: '#cbd5e1', dash: '' };
  if (['residential', 'living_street', 'unclassified'].includes(highway)) {
    return { width: 3, color: '#dbe3ea', dash: '' };
  }
  if (highway === 'service') return { width: 2, color: '#e2e8f0', dash: '' };
  if (['cycleway', 'footway', 'path', 'pedestrian'].includes(highway)) {
    return { width: 1.5, color: '#cbd5e1', dash: '4 4' };
  }
  return { width: 1, color: '#e2e8f0', dash: '3 5' };
}

function clipRoadSegment(start, end) {
  const minX = MAP.x;
  const maxX = MAP.x + MAP.width;
  const minY = MAP.y;
  const maxY = MAP.y + MAP.height;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let lower = 0;
  let upper = 1;
  const boundaries = [
    [-deltaX, start.x - minX],
    [deltaX, maxX - start.x],
    [-deltaY, start.y - minY],
    [deltaY, maxY - start.y]
  ];

  for (const [direction, distance] of boundaries) {
    if (direction === 0 && distance < 0) return null;
    if (direction === 0) continue;
    const ratio = distance / direction;
    if (direction < 0) lower = Math.max(lower, ratio);
    else upper = Math.min(upper, ratio);
    if (lower > upper) return null;
  }

  return {
    start: { x: start.x + lower * deltaX, y: start.y + lower * deltaY },
    end: { x: start.x + upper * deltaX, y: start.y + upper * deltaY }
  };
}

function buildRoadLayer(roads, projection) {
  return roads.elements.map((way) => {
    const points = way.geometry?.map(({ lat, lon }) => projection.project(lat, lon)) ?? [];
    if (points.length < 2) return '';
    const style = roadStyle(way.tags?.highway);
    const segments = [];
    for (let index = 1; index < points.length; index += 1) {
      const segment = clipRoadSegment(points[index - 1], points[index]);
      if (!segment) continue;
      segments.push(`<line x1="${segment.start.x.toFixed(1)}" y1="${segment.start.y.toFixed(1)}" x2="${segment.end.x.toFixed(1)}" y2="${segment.end.y.toFixed(1)}"/>`);
    }
    return `<g fill="none" stroke="${style.color}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round">${segments.join('')}</g>`;
  }).join('\n');
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function pointHalfway(points) {
  const target = polylineLength(points) / 2;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    if (length + segment >= target) {
      const ratio = segment === 0 ? 0 : (target - length) / segment;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio
      };
    }
    length += segment;
  }
  return points[0];
}

function buildStreetLabels(roads, projection) {
  const strongestByName = new Map();
  for (const way of roads.elements) {
    const name = way.tags?.name;
    if (!name || !['tertiary', 'residential', 'living_street', 'unclassified'].includes(way.tags?.highway)) continue;
    const points = way.geometry?.map(({ lat, lon }) => projection.project(lat, lon)) ?? [];
    const length = polylineLength(points);
    if (length < 65 || (strongestByName.get(name)?.length ?? 0) >= length) continue;
    strongestByName.set(name, { name, length, point: pointHalfway(points) });
  }

  const occupied = [];
  return [...strongestByName.values()]
    .sort((left, right) => right.length - left.length)
    .filter(({ point }) => point.x >= MAP.x && point.x <= MAP.x + MAP.width && point.y >= MAP.y && point.y <= MAP.y + MAP.height)
    .filter(({ point }) => {
      if (occupied.some((other) => Math.hypot(point.x - other.x, point.y - other.y) < 76)) return false;
      occupied.push(point);
      return occupied.length <= 34;
    })
    .map(({ name, point }) => `<text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" class="street-label">${escapeXml(name)}</text>`)
    .join('\n');
}

function buildHouseLayer(households, projection) {
  return DISTANCE_BANDS.map((band) => {
    const dots = households.filter((house) => (house.coverageStatus || classifyDistance(house.distance).key) === band.key).map((house) => {
      const point = projection.project(house.lat, house.lon);
      const distanceLabel = Number.isFinite(house.distance) ? `${house.distance.toFixed(2)} m` : 'geen route';
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.9" fill="${band.color}" stroke="#ffffff" stroke-width="0.85" fill-opacity="0.92" data-address="${escapeXml(house.address)}" data-distance="${escapeXml(distanceLabel)}" aria-label="${escapeXml(`${house.address}: ${distanceLabel}`)}"/>`;
    }).join('\n');
    return `<g id="house-band-${band.key.replaceAll('_', '-')}" class="house-band">${dots}</g>`;
  }).join('\n');
}

function buildContainerLayer(sites, projection) {
  return sites.map((site, index) => {
    const point = projection.project(site.lat, site.lon);
    const roleLabel = site.role === 'existing-public'
      ? 'bestaande openbare HVC-locatie'
      : site.role === 'existing-private'
        ? 'bestaande private HVC-locatie met adres-allowlist'
        : 'aanvullende onderzoekszone';
    const capacityLabel = Number.isFinite(site.capacityUnitsAt100) && Number.isFinite(site.capacityUnitsAt75)
      ? `${site.capacityUnitsAt100} bak${site.capacityUnitsAt100 === 1 ? '' : 'ken'} bij 100-adresscenario; ${site.capacityUnitsAt75} bij 75-adresscenario`
      : 'geen capaciteitsgevoeligheid beschikbaar';
    const screeningLabel = site.oldSite
      ? ` — oude zoekzone ${site.oldSite}${site.aerialRating ? `, luchtfoto ${site.aerialRating}` : ''}`
      : '';
    const tooltip = `${site.displayId} — ${roleLabel}${site.address ? ` — ${site.address}` : ''}${screeningLabel} — ${capacityLabel}`;
    const labelOffsetX = index % 2 === 0 ? 15 : -15;
    const anchor = labelOffsetX > 0 ? 'start' : 'end';
    const units = Number.isFinite(site.units) && site.units > 1
      ? `<text x="0" y="5" text-anchor="middle" class="container-unit">${site.units}</text>`
      : '';
    const markerColor = site.role === 'existing-public' ? '#0f172a' : site.role === 'existing-private' ? '#2563eb' : '#c026d3';
    const shape = site.role === 'existing-public'
      ? `<rect x="-10" y="-10" width="20" height="20" rx="4" fill="#0f172a" stroke="#ffffff" stroke-width="3"/>${units || '<circle cx="0" cy="0" r="3.5" fill="#ffffff"/>'}`
      : site.role === 'existing-private'
        ? `<path d="M0 -13L13 0L0 13L-13 0Z" fill="#2563eb" stroke="#ffffff" stroke-width="3"/>${units || '<circle cx="0" cy="0" r="3.5" fill="#ffffff"/>'}`
        : `<circle cx="0" cy="0" r="11" fill="#c026d3" stroke="#ffffff" stroke-width="3"/>${units || '<path d="M-5 0H5M0-5V5" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>'}`;
    return `<g class="container-marker ${site.role}-container" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})" data-tooltip="${escapeXml(tooltip)}" aria-label="${escapeXml(tooltip)}">
      <circle cx="0" cy="0" r="17" fill="none" stroke="${markerColor}" stroke-width="1.5" stroke-opacity="0.42"/>
      ${shape}
      <text x="${labelOffsetX}" y="-13" text-anchor="${anchor}" class="container-label">${escapeXml(site.displayId)}</text>
    </g>`;
  }).join('\n');
}

function formatPercentage(count, total) {
  return total === 0 ? '0,0%' : `${(100 * count / total).toFixed(1).replace('.', ',')}%`;
}

function buildStatistics(households, sites, scenario) {
  const counts = Object.fromEntries(DISTANCE_BANDS.map((band) => [band.key, 0]));
  for (const household of households) counts[household.coverageStatus || classifyDistance(household.distance).key] += 1;
  const finiteDistances = households.map((household) => household.distance).filter(Number.isFinite);
  const existingPublic = sites.filter((site) => site.role === 'existing-public');
  const existingPrivate = sites.filter((site) => site.role === 'existing-private');
  const existing = [...existingPublic, ...existingPrivate];
  const additional = sites.filter((site) => site.role === 'additional');
  const maximum = finiteDistances.length ? Math.max(...finiteDistances) : null;
  const unitsModeled = sites.every((site) => Number.isFinite(site.units));
  const modelMaximum = finiteNumber(
    scenario.maximumWalkingDistanceM,
    scenario.designMaximumWalkingDistanceM,
    scenario.scenario?.maximumWalkingDistanceM,
    scenario.scenario?.designMaximumWalkingDistanceM,
    scenario.summary?.maximumWalkingDistanceM,
    scenario.solution?.maximumWalkingDistanceM,
    maximum
  );
  return {
    counts,
    total: households.length,
    existingSites: existing.length,
    existingPublicSites: existingPublic.length,
    existingPrivateSites: existingPrivate.length,
    additionalSites: additional.length,
    unitsModeled,
    existingUnits: unitsModeled ? existing.reduce((sum, site) => sum + site.units, 0) : null,
    additionalUnits: unitsModeled ? additional.reduce((sum, site) => sum + site.units, 0) : null,
    maximum,
    modelMaximum,
    within150: counts.within_100 + counts.between_100_125 + counts.between_125_150,
    within225: finiteDistances.filter((distance) => distance <= 225).length
  };
}

function buildSvg({ households, sites, roads, scenario, inputName }) {
  const projection = buildProjection(households, sites);
  const statistics = buildStatistics(households, sites, scenario);
  const generatedAt = new Date().toISOString();
  const roadLayer = buildRoadLayer(roads, projection);
  const streetLabels = buildStreetLabels(roads, projection);
  const houseLayer = buildHouseLayer(households, projection);
  const containerLayer = buildContainerLayer(sites, projection);
  const legendItems = DISTANCE_BANDS.map((band, index) => {
    const column = index < 3 ? 0 : 1;
    const row = index % 3;
    const x = 1020 + column * 170;
    const y = 92 + row * 34;
    return `<circle cx="${x}" cy="${y}" r="7" fill="${band.color}" stroke="#fff" stroke-width="1"/><text x="${x + 14}" y="${y + 5}" class="legend-text">${band.label} · ${statistics.counts[band.key]}</text>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="map-title map-description">
  <title id="map-title">Gecorrigeerd containerscenario Warmenhuizen met bestaande HVC-locaties verplicht</title>
  <desc id="map-description">Kaart van ${statistics.total} huishoudens, gekleurd naar berekende loopafstand, met ${statistics.existingPublicSites} openbare en ${statistics.existingPrivateSites} private bestaande HVC-locaties en ${statistics.additionalSites} aanvullende onderzoekszones.</desc>
  <defs>
    <clipPath id="map-clip"><rect x="${MAP.x}" y="${MAP.y}" width="${MAP.width}" height="${MAP.height}" rx="18"/></clipPath>
    <style>
      text { font-family: "DejaVu Sans", Arial, sans-serif; fill: #172033; }
      .title { font-size: 36px; font-weight: 750; letter-spacing: -0.7px; }
      .subtitle { font-size: 18px; fill: #475569; }
      .metric-value { font-size: 25px; font-weight: 750; }
      .metric-label { font-size: 14px; fill: #64748b; }
      .legend-title { font-size: 15px; font-weight: 700; }
      .legend-text { font-size: 13px; fill: #334155; }
      .street-label { font-size: 11px; fill: #64748b; opacity: 0.8; text-anchor: middle; paint-order: stroke; stroke: #f8fafc; stroke-width: 3px; stroke-linejoin: round; }
      .container-label { font-size: 12px; font-weight: 800; fill: #111827; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
      .container-unit { font-size: 12px; font-weight: 850; fill: #ffffff; }
      .note { font-size: 14px; fill: #475569; }
      .source { font-size: 12px; fill: #64748b; }
    </style>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f8fafc"/>
  <text x="48" y="58" class="title">Gecorrigeerd scenario Warmenhuizen</text>
  <text x="48" y="91" class="subtitle">Alle ${statistics.existingSites} bestaande HVC-locaties blijven · aanvullingen zijn modelankers, geen bouwpinnen</text>

  <g transform="translate(48 122)">
    <rect width="196" height="90" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
    <text x="18" y="39" class="metric-value">${statistics.modelMaximum?.toFixed(1).replace('.0', '') ?? '–'} m</text>
    <text x="18" y="66" class="metric-label">berekend maximum</text>
  </g>
  <g transform="translate(258 122)">
    <rect width="196" height="90" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
    <text x="18" y="39" class="metric-value">${statistics.existingSites} + ${statistics.additionalSites}</text>
    <text x="18" y="66" class="metric-label">bestaand + onderzoekszones</text>
  </g>
  <g transform="translate(468 122)">
    <rect width="196" height="90" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
    <text x="18" y="39" class="metric-value">${formatPercentage(statistics.within150, statistics.total)}</text>
    <text x="18" y="66" class="metric-label">huishoudens ≤ 150 m</text>
  </g>
  <g transform="translate(678 122)">
    <rect width="196" height="90" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
    <text x="18" y="39" class="metric-value">${formatPercentage(statistics.within225, statistics.total)}</text>
    <text x="18" y="66" class="metric-label">huishoudens ≤ 225 m</text>
  </g>
  <text x="930" y="66" class="legend-title">Loopafstand per huishouden</text>
  ${legendItems}

  <rect x="${MAP.x}" y="${MAP.y}" width="${MAP.width}" height="${MAP.height}" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
  <g aria-label="Kaartvlak">
    <rect x="${MAP.x}" y="${MAP.y}" width="${MAP.width}" height="${MAP.height}" fill="#f8fafc"/>
    <g aria-label="OpenStreetMap-wegennet">${roadLayer}</g>
    <g aria-label="Straatlabels">${streetLabels}</g>
    <g aria-label="Huishoudens">${houseLayer}</g>
    <g aria-label="Containerlocaties">${containerLayer}</g>
  </g>

  <g transform="translate(72 1530)">
    <rect width="1256" height="98" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="20" y="20" width="20" height="20" rx="4" fill="#0f172a"/><text x="50" y="36" class="legend-text">Openbare HVC: ${statistics.existingPublicSites}</text>
    <path d="M339 17L352 30L339 43L326 30Z" fill="#2563eb"/><text x="362" y="36" class="legend-text">Private HVC: ${statistics.existingPrivateSites} (alleen allowlist)</text>
    <circle cx="677" cy="30" r="11" fill="#c026d3"/><path d="M672 30H682M677 25V35" stroke="#fff" stroke-width="2.5"/><text x="698" y="36" class="legend-text">Aanvullende modelankers: ${statistics.additionalSites}</text>
    <text x="20" y="72" class="note">Bakscenario&apos;s in de tabel gebruiken 100 of 75 adresequivalenten per bak; dit is gevoeligheidsanalyse, geen gemeten vulgraad. Rood betekent 150–275 m.</text>
  </g>
  <text x="48" y="1654" class="source">Modelinput: ${escapeXml(inputName)} · BAG-woonfunctieadressen: ${statistics.total} · Wegennet: OpenStreetMap, ODbL</text>
  <text x="48" y="1675" class="source">Gegenereerd ${escapeXml(generatedAt)}</text>
  <text x="1352" y="1654" text-anchor="end" class="source">Analytisch scenario; aanvullende zoeklocaties zijn geen uitvoeringsgerede bouwpinnen.</text>
</svg>`;
}

function buildLocationRows(sites) {
  return [...sites]
    .sort((left, right) => left.role.localeCompare(right.role) || left.displayId.localeCompare(right.displayId, 'nl', { numeric: true }))
    .map((site) => `<tr data-role="${site.role}">
      <td><strong>${escapeHtml(site.displayId)}</strong></td>
      <td>${site.role === 'existing-public' ? 'Bestaande openbare HVC-locatie' : site.role === 'existing-private' ? 'Bestaande private HVC-locatie' : 'Aanvullende onderzoekszone'}</td>
      <td>${escapeHtml(site.address || 'Adresreferentie niet opgegeven')}</td>
      <td>${site.oldSite ? `Site ${site.oldSite}${site.aerialRating ? ` · ${escapeHtml(site.aerialRating)}` : ''}` : '—'}</td>
      <td>${Number.isFinite(site.capacityUnitsAt100) && Number.isFinite(site.capacityUnitsAt75) ? `${site.capacityUnitsAt100} bij 100 · ${site.capacityUnitsAt75} bij 75` : 'Niet beschikbaar'}</td>
      <td><code>${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}</code></td>
    </tr>`).join('\n');
}

function buildHtml(svg, sites, inputName) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gecorrigeerd containerscenario Warmenhuizen</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #eef2f6; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1500px, 100%); margin: 0 auto; padding: clamp(12px, 2vw, 28px); }
    .toolbar, .panel { background: #fff; border: 1px solid #dbe2ea; border-radius: 14px; box-shadow: 0 10px 28px rgb(15 23 42 / 7%); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; padding: 14px 18px; margin-bottom: 14px; }
    .toolbar strong { margin-right: 6px; }
    label { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; cursor: pointer; }
    input { width: 18px; height: 18px; }
    button { min-height: 38px; border: 1px solid #94a3b8; border-radius: 8px; padding: 0 13px; background: #f8fafc; color: #172033; font: inherit; font-weight: 650; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
    .map-scroll { overflow: auto; border-radius: 14px; background: #f8fafc; }
    svg { display: block; width: 100%; height: auto; min-width: 720px; }
    .is-hidden { display: none; }
    .panel { margin-top: 18px; padding: clamp(14px, 2vw, 24px); }
    h2 { margin: 0 0 12px; font-size: 1.35rem; }
    p { line-height: 1.55; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.94rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { color: #475569; background: #f8fafc; position: sticky; top: 0; }
    code { white-space: nowrap; }
    .small { color: #64748b; font-size: 0.88rem; }
    @media (max-width: 700px) {
      main { padding: 8px; }
      .toolbar { border-radius: 10px; padding: 10px 12px; gap: 4px 14px; }
      .toolbar strong { flex-basis: 100%; }
      .map-scroll { border-radius: 10px; }
      .panel { border-radius: 10px; }
    }
    @media print {
      body { background: #fff; }
      main { padding: 0; }
      .toolbar { display: none; }
      .panel { box-shadow: none; break-before: page; }
      svg { min-width: 0; }
    }
  </style>
</head>
<body>
  <main>
    <div class="toolbar" aria-label="Kaartlagen">
      <strong>Toon op kaart:</strong>
      ${DISTANCE_BANDS.map((band) => `<label><input type="checkbox" data-layer="house-band-${band.key.replaceAll('_', '-')}" checked> ${band.label}</label>`).join('\n      ')}
      <label><input type="checkbox" data-class="existing-public-container" checked> HVC openbaar</label>
      <label><input type="checkbox" data-class="existing-private-container" checked> HVC privé</label>
      <label><input type="checkbox" data-class="additional-container" checked> Modelankers</label>
      <button type="button" id="show-all">Toon alles</button>
    </div>
    <div class="map-scroll" tabindex="0" aria-label="Kaart; op een smal scherm horizontaal te verschuiven">
      ${svg.replace('<?xml version="1.0" encoding="UTF-8"?>\n', '')}
    </div>
    <section class="panel">
      <h2>Locaties in dit scenario</h2>
      <p>Alle elf bestaande HVC-locaties zijn vaste randvoorwaarden. WH23 en WH24 zijn privé en tellen alleen mee voor hun expliciete adres-allowlist. De aanvullende punten zijn analytische onderzoekszones en moeten nog door gemeente en HVC als bouwpin worden ingemeten en goedgekeurd.</p>
      <p><strong>Bakken (modelgevoeligheid)</strong> toont het benodigde aantal bij maximaal 100 of 75 BAG-adresequivalenten per bak. Dit is geen bestand van actieve afvalpassen en geen meting van afvalvolume, aanbiedfrequentie of vulgraad; de capaciteitsverdeling bewijst haalbaarheid binnen het model en minimaliseert niet opnieuw de loopafstand.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Kaart-ID</th><th>Rol</th><th>Adresreferentie</th><th>Oude screen</th><th>Bakken (modelgevoeligheid)</th><th>Coördinaten</th></tr></thead>
          <tbody>${buildLocationRows(sites)}</tbody>
        </table>
      </div>
      <p class="small">Bronbestand: <code>${escapeHtml(inputName)}</code>. Deze dossierkaart gebruikt geen externe scripts, fonts of kaarttegels.</p>
    </section>
  </main>
  <script>
    const setLayerVisibility = (selector, visible) => {
      document.querySelectorAll(selector).forEach((element) => element.classList.toggle('is-hidden', !visible));
    };
    document.querySelectorAll('[data-layer]').forEach((input) => {
      input.addEventListener('change', () => setLayerVisibility('#' + input.dataset.layer, input.checked));
    });
    document.querySelectorAll('[data-class]').forEach((input) => {
      input.addEventListener('change', () => setLayerVisibility('.' + input.dataset.class, input.checked));
    });
    document.getElementById('show-all').addEventListener('click', () => {
      document.querySelectorAll('.toolbar input').forEach((input) => {
        input.checked = true;
        input.dispatchEvent(new Event('change'));
      });
    });
  </script>
</body>
</html>`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [
    scenario,
    coverage,
    sourceContainers,
    walkingMatrix,
    roads,
    screenedLocations,
    aerialNorth,
    aerialSouth
  ] = await Promise.all([
    readJson(options.input),
    readJson(HOUSE_COVERAGE_PATH),
    readJson(CONTAINER_PATH),
    readJson(WALKING_MATRIX_PATH),
    readJson(ROAD_PATH),
    readJson(SCREENED_LOCATIONS_PATH),
    readJson(AERIAL_NORTH_PATH),
    readJson(AERIAL_SOUTH_PATH)
  ]);
  const sites = extractSites(
    scenario,
    walkingMatrix,
    sourceContainers,
    screenedLocations,
    [...aerialNorth.sites, ...aerialSouth.sites]
  );
  if (sites.length === 0) throw new Error('Optimizer result contains no selected locations.');
  const households = normalizeHouseholds(scenario, coverage.houses);
  const svg = buildSvg({ households, sites, roads, scenario, inputName: basename(options.input) });
  const html = buildHtml(svg, sites, basename(options.input));
  await Promise.all([
    writeFile(options.svgOutput, `${svg}\n`, 'utf8'),
    writeFile(options.htmlOutput, `${html}\n`, 'utf8')
  ]);
  const statistics = buildStatistics(households, sites, scenario);
  console.log(JSON.stringify({
    input: options.input,
    svgOutput: options.svgOutput,
    htmlOutput: options.htmlOutput,
    households: households.length,
    selectedSites: sites.length,
    existingSites: statistics.existingSites,
    additionalSites: statistics.additionalSites,
    maximumWalkingDistanceM: statistics.maximum,
    counts: statistics.counts
  }, null, 2));
}

await main();
