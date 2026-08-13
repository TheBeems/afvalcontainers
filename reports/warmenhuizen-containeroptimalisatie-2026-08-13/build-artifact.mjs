#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const repositoryDirectory = new URL('../../', reportDirectory);
const generatedAt = new Date().toISOString();
const title = 'Warmenhuizen: verdeling van elf ondergrondse restcontainer-assets';

function readJson(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function inlineSqlSource(id, label, rows, fields, description) {
  const columns = fields.map((field) => `"${field}"`).join(', ');
  const values = rows.map((row) => (
    `(${fields.map((field) => sqlLiteral(row[field])).join(', ')})`
  )).join(',\n  ');
  return {
    id,
    label,
    query: {
      description,
      sql: `WITH source(${columns}) AS (\n  VALUES\n  ${values}\n)\nSELECT * FROM source;`,
      executed_at: generatedAt
    }
  };
}

function sourceTypeLabel(location) {
  if (location.id === 'WH06') return 'bestaande HVC-locatie';
  if (location.sourceType === 'municipal-proposal') return 'gemeentelijk voorstel';
  if (location.sourceType === 'model-medoid') return 'modelmedoïde';
  if (location.sourceType === 'blind-spot-anchor') return 'blinde-vlekanker';
  if (location.sourceType === 'corridor-anchor') return 'corridoranker';
  return location.sourceType ?? 'analytisch anker';
}

const currentCoverage = readJson(new URL('data/places/warmenhuizen/house-coverage.json', repositoryDirectory));
const coverageSummary = readJson(new URL('data/places/warmenhuizen/coverage-summary.json', repositoryDirectory));
const optimization = readJson(new URL('fixed-existing-route-optimization.json', reportDirectory));
const existingEleven = readJson(new URL('existing-11-household-coverage.json', reportDirectory));
const exactEleven = readJson(new URL('exact-11-reallocation.json', reportDirectory));
const service275 = readJson(new URL('fixed-existing-household-coverage-275.json', reportDirectory));
const ownership275 = readJson(new URL('ownership-screen-275.json', reportDirectory));
const feasibility275 = readJson(new URL('feasibility-screen-275.json', reportDirectory));
const hvcAudit = readJson(new URL('hvc-existing-audit-2026-08-14.json', reportDirectory));

const currentDistances = currentCoverage.houses.map(({ walkingDistance }) => walkingDistance).filter(Number.isFinite);
const currentP95 = round(quantile(currentDistances, 0.95));
const currentWithin275 = currentDistances.filter((distance) => distance <= 275).length;
const totalAddresses = coverageSummary.summary.includedAddressCount;
const scenario275 = service275.scenario;
const exactScenario = exactEleven.scenario;
const baselineScenario = existingEleven.scenario;
const exactCapacity100 = exactScenario.capacitySensitivity.find(({ capacityPerContainerAddressEquivalents }) => (
  capacityPerContainerAddressEquivalents === 100
));
const exactCapacity75 = exactScenario.capacitySensitivity.find(({ capacityPerContainerAddressEquivalents }) => (
  capacityPerContainerAddressEquivalents === 75
));
const hvcById = new Map(hvcAudit.results.map((result) => [result.id, result]));
const ownershipById = new Map(ownership275.sites.map((site) => [site.id, site]));
const feasibilityById = new Map(feasibility275.sites.map((site) => [site.id, site]));

const scenarioRows = [
  {
    scenario: 'Huidige 11 locaties',
    grafiek_label: 'Huidige 11',
    locaties: 11,
    aanvullingen: 0,
    gemiddeld_m: baselineScenario.averageModeledWalkingDistanceM,
    p95_m: baselineScenario.p95ModeledWalkingDistanceM,
    maximum_m: baselineScenario.maximumModeledWalkingDistanceM,
    binnen_275: totalAddresses - baselineScenario.distanceBands.over_275,
    boven_275: baselineScenario.distanceBands.over_275,
    binnen_275_pct: round(100 * (totalAddresses - baselineScenario.distanceBands.over_275) / totalAddresses),
    routebasis: 'historische OSRM-segmentgraaf',
    status: 'nulmeting'
  },
  {
    scenario: 'Precies 11 vrij herverdeeld',
    grafiek_label: '11 herverdeeld',
    locaties: 11,
    aanvullingen: 0,
    gemiddeld_m: exactScenario.averageModeledWalkingDistanceM,
    p95_m: exactScenario.p95ModeledWalkingDistanceM,
    maximum_m: exactScenario.maximumModeledWalkingDistanceM,
    binnen_275: exactScenario.householdsWithin275M,
    boven_275: exactScenario.distanceBands.over_275,
    binnen_275_pct: round(100 * exactScenario.householdsWithin275M / totalAddresses),
    routebasis: 'lokale OSM-voetgangersgraaf',
    status: 'lokaal zoekoptimum; niet bouwrijp'
  },
  {
    scenario: '11 behouden + 23 zoekzones',
    grafiek_label: '11 + 23 zones',
    locaties: scenario275.totalPhysicalLocationCount,
    aanvullingen: scenario275.additionalSiteCount,
    gemiddeld_m: scenario275.averageModeledWalkingDistanceM,
    p95_m: scenario275.p95ModeledWalkingDistanceM,
    maximum_m: scenario275.maximumModeledWalkingDistanceM,
    binnen_275: totalAddresses - scenario275.distanceBands.over_275,
    boven_275: scenario275.distanceBands.over_275,
    binnen_275_pct: 100,
    routebasis: 'historische OSRM-segmentgraaf',
    status: 'ruimtelijke behoefte; 14 ankers rood'
  },
  {
    scenario: '33-locatie plan-/reporeferentie',
    grafiek_label: '33-puntenplan',
    locaties: currentCoverage.summary.containerCount,
    aanvullingen: currentCoverage.summary.containerCount - 11,
    gemiddeld_m: currentCoverage.summary.averageWalkingDistance,
    p95_m: currentP95,
    maximum_m: currentCoverage.summary.maxWalkingDistance,
    binnen_275: currentWithin275,
    boven_275: currentCoverage.summary.counts.over_275,
    binnen_275_pct: round(100 * currentWithin275 / totalAddresses),
    routebasis: 'opgeslagen OSRM-deur-tot-puntroutes',
    status: 'actuele voorlopige plan-/reporeferentie'
  }
];

const frontierRows = optimization.scenarios.map((scenario) => ({
  afstandsplafond: `${scenario.maximumWalkingDistanceTargetM} m`,
  ondergrens_totaal: scenario.fixedExistingLocationCount + scenario.additionalSitePackingLowerBound,
  gevonden_totaal: scenario.totalPhysicalLocationCount,
  aanvullingen: scenario.additionalSiteCount,
  p95_m: scenario.p95ModeledWalkingDistanceM,
  maximum_m: scenario.maximumModeledWalkingDistanceM
}));

const criteriaRows = [
  {
    criterium_artikel: 'Volumegewogen loopafstand',
    warmenhuizen_in_dit_dossier: 'Netwerkafstand; één gelijk gewicht per BAG-woonadres',
    ontbreekt_voor_volledige_toepassing: 'Bewoners/huishoudgrootte, afvalvolume en werkelijk gebruik per privacyveilige vraagzone',
    oordeel: 'gedeeltelijk toegepast'
  },
  {
    criterium_artikel: 'Aantal inzamelpunten',
    warmenhuizen_in_dit_dossier: 'Exact 11 en behoud-plus-uitbreiding; gevonden boven- en packing-ondergrenzen',
    ontbreekt_voor_volledige_toepassing: 'Een globale MILP-optimaliteitsverklaring over vooraf goedgekeurde bouwpinnen',
    oordeel: 'heuristisch toegepast'
  },
  {
    criterium_artikel: 'Servicetijd inzamelvoertuig',
    warmenhuizen_in_dit_dossier: 'OSM-wegindicatie, BGT en luchtfotobureauscreen',
    ontbreekt_voor_volledige_toepassing: 'HVC-route, stop- en hijstijd, voertuigmal, verkeersvensters en routevolgorde',
    oordeel: 'niet geoptimaliseerd'
  },
  {
    criterium_artikel: 'Aanschafkosten containers',
    warmenhuizen_in_dit_dossier: 'Geen betrouwbare lokale kostendata',
    ontbreekt_voor_volledige_toepassing: 'Bak-, plaatsings-, civiele, verplaatsings-, beheer- en ledigingskosten',
    oordeel: 'niet geoptimaliseerd'
  },
  {
    criterium_artikel: 'Capaciteit en vulgraad',
    warmenhuizen_in_dit_dossier: 'Alleen adresbelasting per dichtstbijzijnde locatie',
    ontbreekt_voor_volledige_toepassing: 'Bakvolume, kilogrammen, ledigingsfrequentie, minimale/gemiddelde vulgraad en piekbelasting',
    oordeel: 'niet aantoonbaar'
  }
];

const exactElevenRows = exactEleven.locations.map((location) => ({
  id: location.id,
  rol: sourceTypeLabel(location),
  adresreferentie: location.address,
  latitude: Number(location.lat).toFixed(6),
  longitude: Number(location.lon).toFixed(6),
  toegewezen_adresproxies: exactScenario.assignedHouseholdsByLocation[location.id],
  voertuig_snap_m: location.vehicleSnapDistance ?? location.footNetworkSnapDistance ?? null,
  gereedheid: location.id === 'WH06'
    ? 'bestaand; behoud/status bevestigen'
    : location.sourceType === 'municipal-proposal'
      ? 'voorlopig voorstel; integraal toetsen'
      : 'analytisch anker; nieuwe bouwpin zoeken'
}));

const existingRisks = {
  WH03: ['gemeente-indicatie WMH00G2037', 'Smalle hof/bocht; parkeren en heggen dicht bij stop-/hijszone.', 'Stoppositie, draaibeweging en parkeervrij hijsen vastleggen.'],
  WH05: ['gemeente-indicatie WMH00I1012', 'Groen/heesters en boom; publieke HVC-adresrespons leverde geen restlocatie op.', 'Actieve status, pasregels en exacte inrichting handmatig bevestigen.'],
  WH06: ['gemeente-indicatie WMH00I1012', 'Water circa 5,3 m, fietspad en meerdere kasten nabij.', 'KLIC, waterkant, fietspad en hijslijn met hoge prioriteit toetsen.'],
  WH08: ['niet-gemeentelijke indicatie WMH00G2606', 'Parkeren, voetpad en boom nabij; HVC-adresrespons leverde geen restlocatie op.', 'Recht/toestemming en actuele toegang schriftelijk vastleggen.'],
  WH14: ['gemeente-indicatie WMH00G2658', 'Transformator-/kastobjecten circa 2,4–3,0 m van pin.', 'KLIC en netbeheerderstoets uitvoeren.'],
  WH23: ['particuliere Angelaparklocatie WMH00G1926', 'Gevel circa 4,5 m; interne route niet in OSM; geen HVC-restlocatie in adresrespons.', 'Niet als algemeen openbaar punt tellen; rechten en HVC-route bevestigen.'],
  WH24: ['particuliere Angelaparklocatie WMH00G1928', 'Gevel circa 3,8 m en water nabij; alleen geconfigureerde allowlist.', 'Niet algemeen openstellen zonder schriftelijke HVC-/rechthebbendenbevestiging.'],
  WH26: ['gemeente-indicatie WMH00G2723', 'Gevel, boom en parkeren in krappe bochtomgeving.', 'Kraanopstelling en parkeervrij venster inmeten.'],
  WH27: ['gemeente-indicatie WMH00G2723', 'Lichtmast en parkeerplaatsen nabij; officiële pagina noemt Verzetslaan 40, repo Zigt 97.', 'Adres-/ID-conflict met gemeente reconciliëren en hijslijn toetsen.'],
  WH33: ['gemeente-indicatie WMH00I1067', 'Pin ligt zeer dicht bij de rijbaan in recente nieuwbouw.', 'As-built inmeting en HVC-coördinaat bevestigen.'],
  WH34: ['gemeente-indicatie WMH00I1067', 'Mogelijk fietspad tussen stopzijde en bak.', 'Exacte stopzijde en hijslijn controleren.']
};

const existingRows = service275.locations.filter(({ kind }) => kind === 'existing').map((location) => {
  const live = hvcById.get(location.id);
  const [ground, risk, followUp] = existingRisks[location.id];
  return {
    id: location.id,
    adres: location.address,
    toegang: location.accessScope === 'private' ? 'privé/allowlist' : 'algemeen gemodelleerd',
    latitude: location.lat.toFixed(6),
    longitude: location.lon.toFixed(6),
    hvc_id_repo: String(location.hvcContainerId ?? '-'),
    live_hvc_adrescheck: live?.status === 'unchanged' ? 'exact bevestigd' : 'handmatige controle nodig',
    grondscreen: ground,
    hoofdrisico: risk,
    vervolg: followUp
  };
});

const serviceLocationRows = service275.locations.map((location) => {
  const assigned = scenario275.assignedHouseholdsByLocation[location.id] ?? 0;
  if (location.kind === 'existing') {
    const existing = existingRows.find(({ id }) => id === location.id);
    return {
      id: location.id,
      rol: location.accessScope === 'private' ? 'bestaand privé' : 'bestaand openbaar',
      adres_of_zone: location.address,
      latitude: location.lat.toFixed(6),
      longitude: location.lon.toFixed(6),
      toegewezen_adresproxies: assigned,
      status: `bestaande ${location.accessScope === 'private' ? 'privélocatie' : 'openbare locatie'}; status en capaciteit bevestigen`,
      luchtfoto_bgt: 'bestaande asset; risico-audit in aparte tabel',
      grondscreen: existing.grondscreen,
      vervolg: existing.vervolg
    };
  }
  const screen = feasibilityById.get(location.id);
  const parcel = ownershipById.get(location.id);
  const ground = parcel.exactMunicipal
    ? `exacte gemeente-indicatie ${parcel.exactMunicipalParcels.join(', ')}`
    : parcel.municipalParcelWithin25M
      ? 'geen exacte hit; gemeente-indicatie binnen 25 m'
      : 'geen gemeente-indicatie binnen 25 m';
  return {
    id: location.id,
    rol: 'aanvullende zoekzone',
    adres_of_zone: screen.referenceAddress,
    latitude: location.lat.toFixed(6),
    longitude: location.lon.toFixed(6),
    toegewezen_adresproxies: assigned,
    status: `${screen.rating}; ${screen.finding}`,
    luchtfoto_bgt: `${screen.rating}: ${screen.finding}`,
    grondscreen: ground,
    vervolg: screen.followUp
  };
});

const feasibilityRows = feasibility275.sites.map((site) => ({
  id: site.id,
  adresreferentie: site.referenceAddress,
  oordeel: site.rating,
  exacte_gemeente_indicatie: site.exactMunicipal ? 'ja' : 'nee',
  bevinding: site.finding,
  vervolg: site.followUp,
  luchtfoto: site.aerialImage
}));

const sources = [
  {
    id: 'paper',
    label: 'Nevrlý et al. (2021), Location of municipal waste containers: Trade-off between criteria',
    href: 'https://www.sciencedirect.com/science/article/pii/S0959652620334909'
  },
  {
    id: 'paper_metadata',
    label: 'OpenAIRE metadata en abstract, DOI 10.1016/j.jclepro.2020.123445',
    href: 'https://oamonitor.ireland.openaire.eu/national/search/publication?pid=10.1016%2Fj.jclepro.2020.123445'
  },
  {
    id: 'paper_open_context',
    label: 'Open voorloper: Municipal Solid Waste Container Location Based on Walking Distance and Distribution of Population',
    href: 'https://www.cetjournal.it/index.php/cet/article/view/CET1976093'
  },
  {
    id: 'habilitation',
    label: 'Openbare habilitatiescriptie V. Nevrlý, methodische context pp. 40–42',
    href: 'https://www.vut.cz/en/board/habilitation?action=priloha&priloha=241034'
  },
  {
    id: 'schagen',
    label: 'Gemeente Schagen: plaatsing ondergrondse restafvalcontainers Warmenhuizen, bijgewerkt 4 augustus 2026',
    href: 'https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen'
  },
  {
    id: 'bag_osrm',
    label: 'Repositorydekking: BAG-woonfunctieadressen en opgeslagen OSRM-voetgangersroutes',
    path: 'data/places/warmenhuizen/house-coverage.json'
  },
  {
    id: 'fixed_model',
    label: 'Vaste-bestaande routegraafoptimalisatie en afstandsdrempelgevoeligheid',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-route-optimization.json'
  },
  {
    id: 'exact11',
    label: 'Reproduceerbare lokale zoekuitkomst voor precies elf vrij te plaatsen assets',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/exact-11-reallocation.json'
  },
  {
    id: 'walking_matrix',
    label: 'Vastgelegde OSM-loopafstandsmatrix: 2.579 adressen bij 207 kandidaatrecords',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/walking-matrix.json'
  },
  {
    id: 'service275',
    label: 'Huishoudtoewijzing: elf behouden plus 23 zoekzones bij circa 275 meter',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-household-coverage-275.json'
  },
  {
    id: 'map_existing',
    label: 'Interactieve kaart huidige elf locaties',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/existing-11-household-coverage-map.html'
  },
  {
    id: 'map_exact11',
    label: 'Interactieve kaart theoretische herverdeling van elf assets',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/exact-11-reallocation-map.html'
  },
  {
    id: 'map_275',
    label: 'Interactieve overzichtskaart 11 behouden plus 23 zoekzones',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/recommended-275-household-coverage-map.html'
  },
  {
    id: 'pdok_bgt',
    label: 'PDOK Basisregistratie Grootschalige Topografie OGC API',
    href: 'https://api.pdok.nl/lv/bgt/ogc/v1',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/aerial-bgt-screen-275.json'
  },
  {
    id: 'pdok_aerial',
    label: 'PDOK Luchtfoto RGB WMS, 2026_orthoHR',
    href: 'https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-'
  },
  {
    id: 'ownership',
    label: 'Provincie Noord-Holland openbare BRK-grootgrondgebruiksscreen',
    href: 'https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1/query',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/ownership-screen-275.json'
  },
  {
    id: 'feasibility',
    label: 'Locatiespecifieke luchtfoto-, BGT- en perceelbureauscreen van de 23 zoekzones',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/feasibility-screen-275.json'
  },
  {
    id: 'hvc_audit',
    label: 'Live publieke HVC-adresresponsaudit van de elf bestaande locaties, dry-run 14 augustus 2026',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/hvc-existing-audit-2026-08-14.json'
  },
  {
    id: 'osm',
    label: 'OpenStreetMap-wegennet, ODbL',
    href: 'https://www.openstreetmap.org/copyright',
    path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/osm-highways.json'
  },
  {
    id: 'klic',
    label: 'Kadaster KLIC-orientatieverzoek',
    href: 'https://www.kadaster.nl/zakelijk/producten/graafwerk/orientatieverzoek'
  }
];

const charts = [
  {
    id: 'coverage_275',
    title: 'Elf locaties halen de circa-275-meterreferentie niet',
    subtitle: 'Aandeel van 2.579 BAG-woonadresproxies binnen 275 meter; routebasis verschilt per scenario.',
    type: 'bar',
    dataset: 'scenarios',
    source: inlineSqlSource(
      'coverage_275_sql',
      'Scenariodekking binnen 275 meter',
      scenarioRows,
      ['grafiek_label', 'binnen_275_pct', 'binnen_275', 'boven_275', 'locaties'],
      'Afgeleid uit de vier scenario-outputbestanden; percentages zijn niet zonder meer causale of exacte onderlinge prestatievergelijkingen doordat de routebasis verschilt.'
    ),
    encodings: {
      x: { field: 'grafiek_label', type: 'nominal', label: 'Scenario' },
      y: { field: 'binnen_275_pct', type: 'quantitative', label: 'Binnen 275 m (%)' },
      tooltip: [
        { field: 'binnen_275', type: 'quantitative', label: 'Binnen 275 m' },
        { field: 'boven_275', type: 'quantitative', label: 'Boven 275 m' },
        { field: 'locaties', type: 'quantitative', label: 'Locaties' }
      ]
    }
  },
  {
    id: 'tail_distances',
    title: 'Staartafstanden per scenario',
    subtitle: 'P95 en maximum in meter; lees samen met de routebasis in de scenariotabel.',
    type: 'bar',
    dataset: 'scenarios',
    source: inlineSqlSource(
      'tail_distances_sql',
      'P95 en maximum per scenario',
      scenarioRows,
      ['grafiek_label', 'p95_m', 'maximum_m'],
      'Afgeleid uit de scenario-output; exacte absolute waarden zijn routesnapshotafhankelijk.'
    ),
    encodings: {
      x: { field: 'grafiek_label', type: 'nominal', label: 'Scenario' },
      y: { fields: ['p95_m', 'maximum_m'], type: 'quantitative', label: 'Loopafstand (m)' },
      tooltip: [
        { field: 'p95_m', type: 'quantitative', label: 'P95 (m)' },
        { field: 'maximum_m', type: 'quantitative', label: 'Maximum (m)' }
      ]
    }
  },
  {
    id: 'distance_sensitivity',
    title: 'Afstandsdrempelgevoeligheid bij behoud van de elf locaties',
    subtitle: 'Geldige packing-ondergrens en door de heuristiek gevonden bovengrens; geen Pareto- of optimaliteitsbewijs.',
    type: 'bar',
    dataset: 'frontier',
    source: inlineSqlSource(
      'distance_sensitivity_sql',
      'Onder- en bovengrens per afstandsplafond',
      frontierRows,
      ['afstandsplafond', 'ondergrens_totaal', 'gevonden_totaal', 'aanvullingen', 'p95_m', 'maximum_m'],
      'Afgeleid uit fixed-existing-route-optimization.json.'
    ),
    encodings: {
      x: { field: 'afstandsplafond', type: 'nominal', label: 'Modelplafond' },
      y: { fields: ['ondergrens_totaal', 'gevonden_totaal'], type: 'quantitative', label: 'Locaties' },
      tooltip: [
        { field: 'aanvullingen', type: 'quantitative', label: 'Gevonden aanvullingen' },
        { field: 'p95_m', type: 'quantitative', label: 'P95 (m)' }
      ]
    }
  }
];

const tables = [
  {
    id: 'scenario_table',
    title: 'Vier relevante scenario’s',
    subtitle: 'Kernmaatstaven; lees de routebasis en status in de omliggende toelichting. De 33- en 34-locatievarianten zijn niet dezelfde locatieset.',
    dataset: 'scenarios',
    density: 'dense',
    source: inlineSqlSource('scenario_table_sql', 'Scenariomaatstaven', scenarioRows, Object.keys(scenarioRows[0]), 'Samenvatting van de vier doorgerekende scenario’s.'),
    columns: [
      { field: 'scenario', label: 'Scenario', type: 'text', sizing: 'content' },
      { field: 'locaties', label: 'Locaties', type: 'number', sizing: 'content' },
      { field: 'p95_m', label: 'P95 m', type: 'number', sizing: 'content' },
      { field: 'maximum_m', label: 'Max m', type: 'number', sizing: 'content' },
      { field: 'binnen_275', label: '≤275 m', type: 'number', sizing: 'content' }
    ]
  },
  {
    id: 'criteria_table',
    title: 'Vertaling van Nevrlý et al. naar Warmenhuizen',
    subtitle: 'Waarom dit dossier een scenariostudie is en nog geen volledige viercriteria-MILP.',
    dataset: 'criteria',
    density: 'dense',
    source: inlineSqlSource('criteria_sql', 'Onderzoekscriteria en lokale datadekking', criteriaRows, Object.keys(criteriaRows[0]), 'Methodische vergelijking met het opgegeven artikel.'),
    columns: [
      { field: 'criterium_artikel', label: 'Criterium artikel', type: 'text', sizing: 'content' },
      { field: 'warmenhuizen_in_dit_dossier', label: 'Wat nu is gemodelleerd', type: 'text', sizing: 'content' },
      { field: 'ontbreekt_voor_volledige_toepassing', label: 'Wat nog ontbreekt', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'exact11_table',
    title: 'Theoretische verdeling van precies elf vrij verplaatsbare assets',
    subtitle: 'Eén bestaande HVC-locatie, vijf gemeentelijke voorstelpunten en vijf analytische ankers; lokale zoekuitkomst.',
    dataset: 'exact11_locations',
    density: 'dense',
    source: inlineSqlSource('exact11_sql', 'Exact-11 geselecteerde locaties en belasting', exactElevenRows, Object.keys(exactElevenRows[0]), 'Afgeleid uit exact-11-reallocation.json.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adresreferentie', label: 'Adresreferentie', type: 'text', sizing: 'content' },
      { field: 'toegewezen_adresproxies', label: 'Adresproxies', type: 'number', sizing: 'content' },
      { field: 'gereedheid', label: 'Gereedheid', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'service_locations_table',
    title: 'Ruimtelijke behoefteverdeling: elf behouden plus 23 zoekzones',
    subtitle: 'Exacte rekenankers, adresbelasting, bureauscreen en noodzakelijk vervolg; géén uitvoeringspinnen.',
    dataset: 'service_locations',
    density: 'dense',
    source: inlineSqlSource('service_locations_sql', 'Locaties en zoekzones in het 275-meterscenario', serviceLocationRows, Object.keys(serviceLocationRows[0]), 'Gecombineerd uit scenario-, luchtfoto/BGT-, eigendoms- en HVC-auditbestanden.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adres_of_zone', label: 'Adres/zoekzone', type: 'text', sizing: 'content' },
      { field: 'toegewezen_adresproxies', label: 'Dichtstbij', type: 'number', sizing: 'content' },
      { field: 'status', label: 'Bureaustatus', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'existing_table',
    title: 'Audit van de elf bestaande repositorylocaties',
    subtitle: 'Acht exacte HVC-adresmatches; WH05, WH08 en WH23 vereisen handmatige bevestiging.',
    dataset: 'existing_locations',
    density: 'dense',
    source: inlineSqlSource('existing_sql', 'Bestaande HVC-locaties en desk-screen', existingRows, Object.keys(existingRows[0]), 'Gecombineerd uit HVC-dry-run, luchtfoto/BGT/BRK en route-audit.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adres', label: 'Adres', type: 'text', sizing: 'content' },
      { field: 'hoofdrisico', label: 'Hoofdrisico', type: 'text', sizing: 'content' },
      { field: 'vervolg', label: 'Vervolg', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'feasibility_table',
    title: 'Bureauscreen van de 23 aanvullende ankers',
    subtitle: `${feasibility275.counts.groen} groen, ${feasibility275.counts.oranje} oranje en ${feasibility275.counts.rood} rood; groen is nog steeds geen bouwgoedkeuring.`,
    dataset: 'feasibility',
    density: 'dense',
    source: inlineSqlSource('feasibility_sql', 'Visuele en objectgerichte desk-screen', feasibilityRows, Object.keys(feasibilityRows[0]), 'Beoordeling op PDOK-luchtfoto 2026, BGT en openbare grootgrondeigenaarindicatie.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adresreferentie', label: 'Adresreferentie', type: 'text', sizing: 'content' },
      { field: 'oordeel', label: 'Oordeel', type: 'text', sizing: 'content' },
      { field: 'bevinding', label: 'Bevinding', type: 'text', sizing: 'content' }
    ]
  }
];

const blocks = [
  { id: 'title', type: 'markdown', body: `# ${title}` },
  {
    id: 'executive_summary',
    type: 'markdown',
    body: `## Besluit in één minuut

**Met precies elf ondergrondse assets is een dorpsbreed serviceniveau van circa 275 meter niet haalbaar in deze data.** De huidige elf laten op de historische routegraaf ${baselineScenario.distanceBands.over_275.toLocaleString('nl-NL')} van ${totalAddresses.toLocaleString('nl-NL')} woonadresproxies boven 275 meter. In een afzonderlijke lokale OSM-berekening laat de hier gevonden vrije herverdeling van precies elf nog ${exactScenario.distanceBands.over_275.toLocaleString('nl-NL')} adressen (${round(100 * exactScenario.distanceBands.over_275 / totalAddresses)}%) erboven; P95 is ${exactScenario.p95ModeledWalkingDistanceM} m en het maximum ${exactScenario.maximumModeledWalkingDistanceM} m. De twee aantallen zijn door de andere routebasis geen gemeten voor-na-verbetering.

Als “elf containers” letterlijk elf fysieke bakken betekent, is ook de capaciteit onbewezen en waarschijnlijk de eerste beperking: bij de uitsluitend illustratieve grenzen van 100 of 75 adresproxies per bak zijn nominaal minimaal ${exactCapacity100.nominalMinimumPhysicalBins} respectievelijk ${exactCapacity75.nominalMinimumPhysicalBins} bakken nodig. In dit dossier betekent **34 daarom locaties/zoekzones, niet 34 bewezen fysieke bakken**.

Als de officiële service-intentie—**maximaal ongeveer 275 meter, met toegang tot de drie dichtstbijzijnde containers**—leidend is, kom ik voor ruimtelijke reservering uit op **ongeveer 34 locaties: de elf bestaande plus 23 aanvullende zoekzones**. Dat is een heuristische bovengrens; een geldige ondergrens is 29 totaal. De 34 exacte rekenankers zijn geen uitvoeringsplan: van de 23 aanvullingen zijn ${feasibility275.counts.groen} groen, ${feasibility275.counts.oranje} oranje en ${feasibility275.counts.rood} rood in de luchtfoto/BGT-bureauscreen.

**Mijn aanbeveling:** reserveer voorlopig ruimte voor circa 34 locaties, maar neem nog geen plaatsingsbesluit over de 23 ankers. Laat gemeente en HVC eerst een bouwbare kandidaatpool vaststellen en los daarna de vier criteria uit Nevrlý et al. opnieuw op met lokale afvalvolumes, voertuigtijden en echte kosten.`
  },
  {
    id: 'scope',
    type: 'markdown',
    body: `## Scope en interpretatie

“Uitgaan van de bestaande 11” is in drie afzonderlijke vragen vertaald:

1. Wat gebeurt er als de huidige elf locaties blijven zoals ze zijn?
2. Wat is theoretisch mogelijk als precies elf bestaande assets vrij mogen worden verplaatst?
3. Hoeveel locaties zijn ruimtelijk nodig als de elf blijven en circa 275 meter de service-intentie is?

De populatie omvat ${totalAddresses.toLocaleString('nl-NL')} BAG-adressen met woonfunctie binnen de gebruikte bebouwde-komgrens. Van ${coverageSummary.summary.sourceAddressCount.toLocaleString('nl-NL')} woonfunctieadressen in de bredere BAG-woonplaats vallen ${coverageSummary.summary.excludedAddressCount} buiten deze scope. Volgens Schagen blijft de inzameling buiten de bebouwde kom ongewijzigd. Een adres is hier een huishoudproxy, niet één bewezen huishouden, inwonertal of afvalvolume.`
  },
  { id: 'coverage_chart', type: 'chart', chartId: 'coverage_275' },
  {
    id: 'coverage_note',
    type: 'markdown',
    body: 'De conclusie dat elf onvoldoende is, is robuust voor beide gebruikte routemodellen. De exacte meterwaarden tussen scenario’s zijn niet één-op-één vergelijkbaar: de exact-11-run gebruikt een lokale OSM-graaf, de behoudscenario’s een gereconstrueerde historische OSRM-segmentgraaf en de 33-locatiereferentie opgeslagen deur-tot-puntroutes.'
  },
  { id: 'scenario_table_block', type: 'table', tableId: 'scenario_table' },
  { id: 'tail_chart', type: 'chart', chartId: 'tail_distances' },
  {
    id: 'paper_method',
    type: 'markdown',
    body: `## Wat het opgegeven onderzoek werkelijk vraagt

Nevrlý et al. formuleren het locatieprobleem als een mixed-integer linear program met vier conflicterende doelen: volumegewogen loopafstand, aantal inzamelpunten, servicetijd van het inzamelvoertuig en aanschafkosten van containers. Hun voorkeurscompromis beperkt de verslechtering ten opzichte van de afzonderlijke criteriumoptima; capaciteit en vulgraad zijn onderdeel van de casus. Het artikel levert geen universele 225- of 275-metergrens.

De methode is overdraagbaar, maar de casusparameters voor plasticinzameling in een Tsjechische gemeente zijn dat niet. Voor Warmenhuizen ontbreken openbare, locatiespecifieke vraag-, voertuig- en kostendata. Daarom is “optimaal” hier alleen verantwoord voor een expliciet rekenmodel; niet als bestuurlijke of civieltechnische einduitkomst.`
  },
  { id: 'criteria_table_block', type: 'table', tableId: 'criteria_table' },
  {
    id: 'exact11_intro',
    type: 'markdown',
    body: `## Als er echt maar elf assets mogen zijn

De reproduceerbare exact-11-run gebruikt één deterministische greedy start op maximumafstand, daarna P95 en gemiddelde, en voert vervolgens dertien best-improving één-op-éénwissels uit tot de volledige één-swapbuurt geen strikte verbetering bevat. De matrix bevat 2.579 adressen en 207 als algemeen bruikbaar gemarkeerde kandidaatrecords op ${exactEleven.sourceSnapshot.uniqueCandidateCoordinateCount} unieke coördinaten; feitelijke openbare en technische geschiktheid is daarmee niet vastgesteld. De vastgelegde matrix en BAG-dekkingsbron worden met SHA-256 gecontroleerd. Er is geen multistart- of globaal optimaliteitsbewijs; identieke afstandskolommen kunnen bovendien equivalente ID-sets geven.

Uitkomst: gemiddeld ${exactScenario.averageModeledWalkingDistanceM} m, P95 ${exactScenario.p95ModeledWalkingDistanceM} m, maximum ${exactScenario.maximumModeledWalkingDistanceM} m; ${exactScenario.householdsWithin275M.toLocaleString('nl-NL')} adressen binnen en ${exactScenario.distanceBands.over_275.toLocaleString('nl-NL')} boven 275 meter. De locatiebelasting loopt van ${Math.min(...Object.values(exactScenario.assignedHouseholdsByLocation))} tot ${Math.max(...Object.values(exactScenario.assignedHouseholdsByLocation))} adresproxies. Onder de illustratieve 100/75-proxygrenzen vraagt juist deze dichtstbijzijnde-toewijzing ${exactCapacity100.physicalBinsUnderNearestAssignment}/${exactCapacity75.physicalBinsUnderNearestAssignment} fysieke bakken op de elf sites. Dat is geen globale optimaliteitsverklaring en geen operationele capaciteitstoets.

De kaart staat in [exact-11-reallocation-map.html](exact-11-reallocation-map.html); de SVG-versie staat ernaast.`
  },
  { id: 'exact11_table_block', type: 'table', tableId: 'exact11_table' },
  {
    id: 'service_intro',
    type: 'markdown',
    body: `## Als circa 275 meter de service-eis is

Met alle elf bestaande locaties als vaste scenario-invoer vindt de set-coverheuristiek 23 aanvullingen: 34 locaties totaal, gemiddeld ${scenario275.averageModeledWalkingDistanceM} m, P95 ${scenario275.p95ModeledWalkingDistanceM} m en maximum ${scenario275.maximumModeledWalkingDistanceM} m op de gebruikte routegraaf. De packing-ondergrens is 18 aanvullingen, dus het aantoonbare interval is **29–34 totaal**; 34 is een reproduceerbare haalbare bovengrens, geen bewezen minimum.

De aparte [recommended-275-household-coverage-map.html](recommended-275-household-coverage-map.html) gebruikt exact de repo-kleuren: groen ≤100 m, geel 100–125 m, oranje 125–150 m, rood 150–275 m, donkerrood >275 m en grijs zonder route. De JSON bevat per woonadres ook de drie dichtstbijzijnde toegankelijke scenariolocaties. WH23 en WH24 blijven alleen beschikbaar voor hun geconfigureerde private adressen.`
  },
  { id: 'sensitivity_chart', type: 'chart', chartId: 'distance_sensitivity' },
  {
    id: 'sensitivity_note',
    type: 'markdown',
    body: '225 meter is in dit dossier alleen een ambitie-/gevoeligheidsvariant: zij vraagt 49 modelpunten en is geen gemeentelijke norm. De actuele Schagen-pagina noemt circa 275 meter met veiligheids-/bereikbaarheidsexcepties.'
  },
  { id: 'service_locations_block', type: 'table', tableId: 'service_locations_table' },
  {
    id: 'feasibility_intro',
    type: 'markdown',
    body: `## De rekenpunten zijn nog geen bouwpunten

Voor elk aanvullend 275-meteranker is een PDOK-luchtfoto uit laag \`2026_orthoHR\` opgeslagen en zijn BGT-objecten binnen 20 meter gemeten. Dit zijn luchtfoto’s, geen satellietbeelden. De provinciale openbare BRK-laag geeft op 20 van 23 exacte ankers een Gemeente Schagen-indicatie en bij 21 een indicatie binnen 25 meter; dit is nadrukkelijk geen volledige kadastrale recherche of juridisch bewijs.

Slechts model-275-17 en model-275-22 hebben een geloofwaardige nabije zoekzone. Ze zijn ook nog niet goedgekeurd. Veertien rode punten liggen bijvoorbeeld in rijbaan, fietspad, erf of een krappe obstakelzone en moeten materieel verplaatsen. Iedere verplaatsing vereist nieuwe routing voor alle huishoudens.`
  },
  { id: 'feasibility_table_block', type: 'table', tableId: 'feasibility_table' },
  {
    id: 'existing_intro',
    type: 'markdown',
    body: `## De elf bestaande locaties zijn niet zonder voorbehoud “actueel”

Een live dry-run tegen de publieke, adresafhankelijke HVC-respons bevestigde acht repository-ID’s en coördinaten exact. Voor WH05, WH08 en WH23 kwamen bij het referentieadres geen HVC-restlocatiekandidaten terug; die drie vragen handmatige controle. De API is geen formeel assetregister en het aantal teruggegeven locaties zegt niet hoeveel bakken op één site staan.

WH23 en WH24 zijn private Angelaparkpunten. De huidige model-allowlist mag niet zonder schriftelijke bevestiging worden uitgebreid. Daarnaast noemt de actuele gemeentepagina WH27 bij Verzetslaan 40, terwijl de repository/HVC-respons Zigt 97 gebruikt.`
  },
  { id: 'existing_table_block', type: 'table', tableId: 'existing_table' },
  {
    id: 'household_allocation',
    type: 'markdown',
    body: `## Verdeling over huishoudens

Voor beleidsuitvoering zou ik ieder adres **de drie dichtstbijzijnde technisch goedgekeurde en toegankelijke locaties** toewijzen, niet één exclusieve bak. Dat volgt de actuele Schagen-systematiek, biedt uitwijk bij storing/lediging en voorkomt dat de kaarttoewijzing als toegangslijst wordt misbruikt. Voor capaciteitsplanning moet de feitelijke vraag daarna met afvalpassen/volumegegevens over die drie opties worden verdeeld.

De kaarten tonen voor leesbaarheid telkens de dichtstbijzijnde locatie en de afstandsband. De volledige scenario-JSON’s bewaren per adres rang 1–3. De [existing-11-household-coverage-map.html](existing-11-household-coverage-map.html) maakt zichtbaar waar de huidige elf tekortschieten.`
  },
  {
    id: 'implementation',
    type: 'markdown',
    body: `## Aanpak naar een besluitrijpe verdeling

1. **Bevestig de basis:** laat HVC de elf assets, toegang, aantal bakken, volume en status schriftelijk valideren; reconcileer WH27.
2. **Leg criteria en gewichten vast:** circa 275 meter als service-intentie, plus gelijkheid/P95; spreek kosten-, voertuigtijd- en vulgraadcriteria af.
3. **Maak een bouwbare kandidaatpool:** vervang de veertien rode ankers en werk de zeven oranje/twee groene zones uit met veldinmeting, KLIC, bodem/water, bomen, parkeren, eigendom/rechten en HVC-voertuigmal.
4. **Verzamel operationele data:** privacyveilig afvalvolume, passen, ledigingsfrequentie, vulgraden, servicetijden en volledige plaatsings-/verplaatsingskosten.
5. **Los de viercriteria-MILP opnieuw op:** bereken eerst ieder criterium afzonderlijk, daarna meerdere niet-gedomineerde compromissen; rapporteer ook maximum, P95 en uitzonderingen.
6. **Valideer en besluit:** routeer deur-tot-goedgekeurde-pin, geef elk adres de drie dichtstbijzijnde opties en publiceer de definitieve locatie- en uitzonderingenkaart.`
  },
  {
    id: 'limitations',
    type: 'markdown',
    body: `## Grenzen van de conclusie

- De 34-locatieset is een ongecapaciteerde ruimtelijke bovengrens. Zonder kilogrammen, bakvolume en ledigingsfrequentie volgt hieruit geen betrouwbaar aantal fysieke bakken. De woorden asset, locatie en bak mogen in een uitvoeringsbesluit niet als synoniemen worden gebruikt.
- De exact-11-set is een lokaal zoekoptimum op een 207-puntenpool, geen bewezen mondiaal optimum.
- De routegraaf reconstrueert historische OSRM-segmenten en laat korte snapbenen weg; de lokale OSM-matrix wijkt bij calibratie af.
- De gemeentelijke 33-locatie plan-/reporeferentie en het 34-puntenmodel hebben bijna hetzelfde aantal, maar andere locaties en routebasis; men mag hieruit niet afleiden dat “één extra bak” volstaat.
- 303 woonfunctieadressen buiten de gehanteerde kom vallen buiten de containeroptimalisatie.
- Luchtfoto, BGT en grootgrondgebruik zijn bureauscreens; zij vervangen geen veldonderzoek, KLIC, juridische titel of HVC-goedkeuring.`
  },
  {
    id: 'questions',
    type: 'markdown',
    body: `## Open vragen aan gemeente en HVC

- Zijn alle elf repositorylocaties fysiek actief en hoeveel bakken/volume staat per locatie?
- Welke 275-meterdefinitie geldt: deur-tot-inwerpzuil langs een toegankelijke route, en hoe worden uitzonderingen vastgesteld?
- Welke voertuigmal, kraan-/stempelruimte, stopduur en routevensters gelden?
- Wat zijn plaatsings-, civiele, verplaatsings-, ledigings- en beheerprijzen?
- Welke privacyveilig geaggregeerde afvalvolumes en vulgraden zijn per vraagzone beschikbaar?
- Welke vervangende bouwzones voor de veertien rode ankers zijn bestuurlijk en technisch acceptabel?`
  }
];

const manifest = {
  version: 1,
  surface: 'report',
  title,
  description: 'Brononderbouwde scenariostudie naar de verdeling van elf bestaande ondergrondse restcontainerassets en de ruimtelijke behoefte bij circa 275 meter.',
  generatedAt,
  charts,
  tables,
  sources,
  blocks
};

const artifact = {
  surface: 'report',
  manifest,
  snapshot: {
    version: 1,
    generatedAt,
    status: 'ready',
    datasets: {
      scenarios: scenarioRows,
      frontier: frontierRows,
      criteria: criteriaRows,
      exact11_locations: exactElevenRows,
      service_locations: serviceLocationRows,
      existing_locations: existingRows,
      feasibility: feasibilityRows
    }
  },
  sources
};

writeFileSync(new URL('artifact.json', reportDirectory), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  title,
  blocks: blocks.length,
  charts: charts.length,
  tables: tables.length,
  scenarios: scenarioRows,
  serviceLocations: serviceLocationRows.length,
  exactElevenLocations: exactElevenRows.length,
  feasibilityCounts: feasibility275.counts
}, null, 2));
