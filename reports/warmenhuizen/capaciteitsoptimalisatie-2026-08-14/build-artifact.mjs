#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const generatedAt = new Date().toISOString();
const plan = JSON.parse(readFileSync(new URL('capacity-plan.json', reportDirectory), 'utf8'));
const title = 'Warmenhuizen: circa 75 huishoudens per openbare restcontainer';

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function inlineSqlSource(id, label, rows, fields, description) {
  const columns = fields.map((field) => `"${field}"`).join(', ');
  const values = rows.map((row) => `(${fields.map((field) => sqlLiteral(row[field])).join(', ')})`).join(',\n  ');
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

function sourceLabel(location) {
  if (location.accessScope === 'private') return 'bestaand privé';
  if (location.sourceType === 'municipal-concept') return 'gemeentelijk concept';
  if (location.kind === 'new') return 'eigen zoekanker';
  return 'bestaand openbaar';
}

const recommended = plan.recommendedScenario;
const municipal = plan.municipalConceptComparison;
const recommendedDistance = recommended.capacityBalancedDistance;
const municipalDistance = municipal.capacityBalancedDistance;
const capacityComparison = plan.comparison.capacityBalanced;
const nearestComparison = plan.comparison.nearestSiteAccessSensitivity;
const baseline = plan.decisionBaseline;
const findings = plan.locationChangeFindings;
const scenarioRows = [
  {
    scenario: 'Gemeentelijke restvoorstellen',
    label: 'Gemeente',
    openbare_locaties: municipal.publicLocationCount,
    nieuwe_locaties: municipal.newPublicLocationCount,
    gemiddeld_adressen: municipal.averageHouseholdsPerPublicContainer,
    toegewezen_gemiddeld_m: municipalDistance.averageWalkingDistanceM,
    toegewezen_p95_m: municipalDistance.p95WalkingDistanceM,
    toegewezen_boven_275: municipalDistance.distanceBands.over_275,
    dichtstbij_gemiddeld_m: municipal.nearestSiteAccessSensitivity.averageWalkingDistanceM,
    dichtstbij_p95_m: municipal.nearestSiteAccessSensitivity.p95WalkingDistanceM,
    dichtstbij_boven_275: municipal.nearestSiteAccessSensitivity.distanceBands.over_275
  },
  {
    scenario: 'Besloten variant met WH24 openbaar',
    label: 'Advies',
    openbare_locaties: recommended.publicLocationCount,
    nieuwe_locaties: recommended.newPublicLocationCount,
    gemiddeld_adressen: recommended.averageHouseholdsPerPublicContainer,
    toegewezen_gemiddeld_m: recommendedDistance.averageWalkingDistanceM,
    toegewezen_p95_m: recommendedDistance.p95WalkingDistanceM,
    toegewezen_boven_275: recommendedDistance.distanceBands.over_275,
    dichtstbij_gemiddeld_m: recommended.nearestSiteAccessSensitivity.averageWalkingDistanceM,
    dichtstbij_p95_m: recommended.nearestSiteAccessSensitivity.p95WalkingDistanceM,
    dichtstbij_boven_275: recommended.nearestSiteAccessSensitivity.distanceBands.over_275
  }
];

const bandRows = [
  ['0–100 m', 'within_100'],
  ['>100–125 m', 'between_100_125'],
  ['>125–150 m', 'between_125_150'],
  ['>150–275 m', 'between_150_275'],
  ['>275 m', 'over_275']
].map(([band, key]) => ({ band, gemeente: municipalDistance.distanceBands[key], advies: recommendedDistance.distanceBands[key] }));

const newRows = plan.locations.filter(({ kind }) => kind === 'new').map((location) => ({
  id: location.id,
  adresreferentie: location.address,
  bron: sourceLabel(location),
  latitude: location.lat,
  longitude: location.lon,
  adressen: location.assignedHouseholds,
  bureauscreen: location.screeningRating,
  status: location.screeningRating === 'green'
    ? 'plausibele zoekzone; integraal toetsen'
    : location.screeningRating === 'not-screened'
      ? 'exacte pin nog niet integraal gescreend'
      : 'lokale verschuiving/conflictcontrole nodig'
}));

const existingRows = plan.locations.filter(({ kind }) => kind === 'existing').map((location) => ({
  id: location.id,
  toegang: location.accessScope === 'private' ? 'privé' : 'openbaar',
  adres: location.address,
  adressen: location.assignedHouseholds,
  bureauscreen: location.screeningRating,
  besluit: location.accessScope === 'private' ? 'bestaande allowlist behouden' : 'bestaand; exacte locatie behouden'
}));

const criteriaRows = [
  { criterium: 'Loopafstand', artikel: 'volumegewogen afstand', toepassing: 'één BAG-woonadresproxy; geschatte OSM-netwerkafstand', grens: '275 m alleen modelrapportage' },
  { criterium: 'Aantal punten/bakken', artikel: 'aantal inzamelpunten en containertype', toepassing: 'besloten servicevariant: 36 openbaar, inclusief M082', grens: '35 openbaar is de rekenkundige minimumtelling bij maximaal 75' },
  { criterium: 'Capaciteit', artikel: 'volume, frequentie en benutting', toepassing: 'gekozen modelband 60–90 adressen per nieuwe bak', grens: 'geen liter-/kilogrambewijs' },
  { criterium: 'Servicetijd', artikel: 'voertuigservicetijd', toepassing: 'alleen BGT/OSM/orthofoto-voorselectie', grens: 'HVC-ritten en stoptijden ontbreken' },
  { criterium: 'Kosten', artikel: 'aanschafkosten', toepassing: 'alle bestaande locaties vast; één extra fysieke container ten opzichte van de baseline', grens: 'lokale civiele en beheerkosten ontbreken' }
];

const loadDistributionRows = [
  { band: '60–74', aantal: newRows.filter(({ adressen }) => adressen >= 60 && adressen <= 74).length },
  { band: '75–89', aantal: newRows.filter(({ adressen }) => adressen >= 75 && adressen <= 89).length },
  { band: '90', aantal: newRows.filter(({ adressen }) => adressen === 90).length }
];

const sources = [
  { id: 'paper', label: 'Nevrlý et al. (2021), methodische bron over plasticafval', href: 'https://www.sciencedirect.com/science/article/pii/S0959652620334909' },
  { id: 'paper_predecessor', label: 'Nevrlý et al. (2019), openbare MILP-voorganger', href: 'https://www.cetjournal.it/index.php/cet/article/view/CET1976093' },
  { id: 'paper_thesis', label: 'Khýr (2020), openbare VUT-masterthesis', href: 'https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3' },
  { id: 'schagen_plan', label: 'Gemeente Schagen conceptlocaties en toegang tot drie bakken', href: 'https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen' },
  { id: 'schagen_pdf', label: 'Bewonersboekje Warmenhuizen', href: 'https://www.schagen.nl/sites/default/files/2026-04/bewonersboekje-warmenhuizen.pdf' },
  { id: 'criteria', label: 'Gemeentelijk locatiecriteria-precedent', href: 'https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html' },
  { id: 'lior', label: 'Schagen LIOR deel 2', href: 'https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf' },
  { id: 'dergmeerweg', label: 'Gemeente Schagen: Dergmeerweg', href: 'https://www.schagen.nl/dergmeerweg' },
  { id: 'landsheer', label: 'Gemeente Schagen: Landsheer', href: 'https://www.schagen.nl/nieuwbouwwijk-landsheer' },
  { id: 'bag', label: 'PDOK BAG OGC API', href: 'https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&lang=nl', path: 'data/places/warmenhuizen/house-coverage.json' },
  { id: 'bgt', label: 'PDOK BGT OGC API', href: 'https://api.pdok.nl/lv/bgt/ogc/v1?f=html&lang=nl', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/location-screening.json' },
  { id: 'orthophoto', label: 'PDOK luchtfoto RGB', href: 'https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-' },
  { id: 'osm', label: 'OpenStreetMap pedestrian-network snapshot', href: 'https://www.openstreetmap.org/copyright', path: 'reports/warmenhuizen/locatieoptimalisatie-2026-08-13/osm-highways.json' },
  { id: 'selection', label: 'Eerdere 26-kandidaten-baseline', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/private-access-leave-one-out.json' },
  { id: 'plan_json', label: 'Volledig capaciteitsplan en bronhashes', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/capacity-plan.json' },
  { id: 'assignments', label: 'Unieke toewijzing van 2.579 adresproxies', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/household-assignment.json' },
  { id: 'map', label: 'Interactieve afstandskaart', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/overview-map.html' }
];

const charts = [
  {
    id: 'distance_comparison',
    title: 'Capaciteitsgebalanceerde modelafstand',
    subtitle: 'Exclusieve toewijzing van dezelfde 2.576 openbare BAG-woonadresproxies; advies heeft vijf openbare locaties meer.',
    type: 'bar', dataset: 'scenarios',
    source: inlineSqlSource('distance_comparison_sql', 'Afstandsvergelijking', scenarioRows, ['label', 'toegewezen_gemiddeld_m', 'toegewezen_p95_m'], 'Afgeleid uit capacity-plan.json.'),
    encodings: {
      x: { field: 'label', type: 'nominal', label: 'Scenario' },
      y: { fields: ['toegewezen_gemiddeld_m', 'toegewezen_p95_m'], type: 'quantitative', label: 'Geschatte loopafstand (m)' },
      tooltip: [
        { field: 'toegewezen_gemiddeld_m', type: 'quantitative', label: 'Gemiddeld (m)' },
        { field: 'toegewezen_p95_m', type: 'quantitative', label: 'P95 (m)' }
      ]
    }
  },
  {
    id: 'distance_bands',
    title: 'Capaciteitsgebalanceerde afstandsbanden',
    subtitle: 'Binnen dit model is 275 meter een rapportageband, geen optimalisatiegrens.',
    type: 'bar', dataset: 'distance_bands',
    source: inlineSqlSource('distance_bands_sql', 'Afstandsbanden', bandRows, ['band', 'gemeente', 'advies'], 'Afgeleid uit de capaciteitsassignments.'),
    encodings: {
      x: { field: 'band', type: 'nominal', label: 'Geschatte loopafstand' },
      y: { fields: ['gemeente', 'advies'], type: 'quantitative', label: 'Adresproxies' },
      tooltip: [{ field: 'gemeente', type: 'quantitative', label: 'Gemeente' }, { field: 'advies', type: 'quantitative', label: 'Advies' }]
    }
  },
  {
    id: 'new_loads',
    title: 'Nieuwe locaties rond het zachte doel 75',
    subtitle: 'Verdeling van 26 nieuwe bakken binnen de gekozen modelband 60–90.',
    type: 'bar', dataset: 'load_distribution',
    source: inlineSqlSource('new_loads_sql', 'Belastingsbanden nieuwe locaties', loadDistributionRows, ['band', 'aantal'], 'Geteld uit capacity-plan.json.'),
    encodings: {
      x: { field: 'band', type: 'nominal', label: 'Toegewezen adressen' },
      y: { field: 'aantal', type: 'quantitative', label: 'Nieuwe locaties' },
      tooltip: [{ field: 'aantal', type: 'quantitative', label: 'Locaties' }]
    }
  }
];

const tables = [
  {
    id: 'scenario_table', title: 'Twee interpretaties naast elkaar',
    subtitle: 'WH24 is openbaar en alleen WH23 blijft privé; afstand is geschat over dezelfde lokale OSM-graaf.',
    dataset: 'scenarios', density: 'dense',
    source: inlineSqlSource('scenario_table_sql', 'Scenario-KPI’s', scenarioRows, Object.keys(scenarioRows[0]), 'Afgeleid uit capacity-plan.json.'),
    columns: [
      { field: 'scenario', label: 'Scenario', type: 'text', sizing: 'content' },
      { field: 'openbare_locaties', label: 'Openbaar', type: 'number', sizing: 'content' },
      { field: 'gemiddeld_adressen', label: 'Adres/bak', type: 'number', sizing: 'content' },
      { field: 'toegewezen_gemiddeld_m', label: 'Toegewezen gem. m', type: 'number', sizing: 'content' },
      { field: 'toegewezen_p95_m', label: 'Toegewezen P95 m', type: 'number', sizing: 'content' },
      { field: 'dichtstbij_gemiddeld_m', label: 'Dichtstbij gem. m', type: 'number', sizing: 'content' },
      { field: 'dichtstbij_p95_m', label: 'Dichtstbij P95 m', type: 'number', sizing: 'content' }
    ]
  },
  {
    id: 'new_locations_table', title: 'De 26 aanvullende zoekzones', subtitle: 'Service-ankers; geen bouw- of graafpinnen.',
    dataset: 'new_locations', density: 'dense',
    source: inlineSqlSource('new_locations_sql', 'Nieuwe zoekzones', newRows, Object.keys(newRows[0]), 'Afgeleid uit capacity-plan.json.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adresreferentie', label: 'Referentie', type: 'text', sizing: 'content' },
      { field: 'bron', label: 'Bron', type: 'text', sizing: 'content' },
      { field: 'adressen', label: 'Adressen', type: 'number', sizing: 'content' },
      { field: 'bureauscreen', label: 'Screen', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'existing_table', title: 'De elf onverplaatste bestaande locaties', subtitle: 'Tien openbaar, inclusief WH24; alleen WH23 blijft privé.',
    dataset: 'existing_locations', density: 'dense',
    source: inlineSqlSource('existing_locations_sql', 'Bestaande locaties', existingRows, Object.keys(existingRows[0]), 'Afgeleid uit capacity-plan.json.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'toegang', label: 'Toegang', type: 'text', sizing: 'content' },
      { field: 'adres', label: 'Adres', type: 'text', sizing: 'content' },
      { field: 'adressen', label: 'Adressen', type: 'number', sizing: 'content' },
      { field: 'besluit', label: 'Status', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'criteria_table', title: 'Vertaling van het onderzoek', subtitle: 'Wat is toegepast en welke operationele data nog ontbreken.',
    dataset: 'criteria', density: 'dense',
    source: inlineSqlSource('criteria_sql', 'Onderzoekscriteria', criteriaRows, Object.keys(criteriaRows[0]), 'Methodische adaptatie van Nevrlý et al.'),
    columns: [
      { field: 'criterium', label: 'Criterium', type: 'text', sizing: 'content' },
      { field: 'artikel', label: 'Artikel', type: 'text', sizing: 'content' },
      { field: 'toepassing', label: 'Warmenhuizen', type: 'text', sizing: 'content' },
      { field: 'grens', label: 'Datagrens', type: 'text', sizing: 'content' }
    ]
  }
];

const blocks = [
  { id: 'title', type: 'markdown', body: `# ${title}` },
  {
    id: 'summary', type: 'markdown', body: `## Executive Summary

- **37 fysieke containers, waarvan 36 openbaar.** WH24 wordt openbaar, alleen WH23 blijft privé en M082 wordt toegevoegd terwijl M094 behouden blijft.
- **Gerichte verschuivingen verbeteren de drie probleemgebieden.** WH02 → M055 bij De Fuik en WH30 → M056 in de oostelijke wijk; M027 en M044 blijven staan.
- **De gemiddelde capaciteitsgebalanceerde modelafstand daalt van ${baseline.capacityBalancedDistance.averageWalkingDistanceM} naar ${recommendedDistance.averageWalkingDistanceM} meter.** P95 daalt met ${findings.p95WalkingDistanceReductionM} meter en openbare adressen boven 275 meter van ${baseline.capacityBalancedDistance.distanceBands.over_275} naar ${recommendedDistance.distanceBands.over_275}.
- **M094 behouden geeft een kleine aanvullende servicewinst.** Tegenover de gelijk-aantalvariant daalt het gemiddelde nog ${findings.samePhysicalCountSensitivity.extraContainerBenefit.averageWalkingDistanceReductionM} meter en zijn er ${findings.samePhysicalCountSensitivity.extraContainerBenefit.over275Reduction} adres${findings.samePhysicalCountSensitivity.extraContainerBenefit.over275Reduction === 1 ? '' : 'sen'} minder boven 275 meter.

De 2.576 openbare BAG-woonadresproxies geven gemiddeld **${recommended.averageHouseholdsPerPublicContainer} adressen per openbare container**. De rekenkundige minimumtelling bij maximaal 75 is 35 openbaar; deze servicevariant kiest er één extra. Alle nieuwe locaties blijven binnen de gekozen modelband 60–90.`
  },
  { id: 'scenario_table_block', type: 'table', tableId: 'scenario_table' },
  { id: 'distance_chart_block', type: 'chart', chartId: 'distance_comparison' },
  {
    id: 'comparison', type: 'markdown', body: `## De locatieaanpassingen pakken de rode zones gericht aan

Tegenover de WH24-openbare baseline daalt de totale modelafstand ${findings.totalWalkingDistanceReductionM} meter en zijn er ${findings.over275Reduction} minder openbare adressen boven 275 m. De Fuik gaat van 16 naar 2, Dorpsstraat/Fabrieksstraat/'t Eiland van 67 naar 20 en de oostelijke woonwijk van 7 naar 0.

Ten opzichte van het gemeentelijke concept geeft de capaciteitsgebalanceerde één-op-één-toewijzing **${capacityComparison.totalWalkingDistanceReductionPercent}%** minder totale modelafstand en ${capacityComparison.over275Reduction} minder openbare adressen boven 275 m. In de optimistische dichtstbijzijnde-locatiegevoeligheid is dat **${nearestComparison.totalWalkingDistanceReductionPercent}%** en ${nearestComparison.over275Reduction}. Het advies gebruikt vijf openbare locaties meer; beide cijfers combineren dus locatiekeuze en extra capaciteit.`
  },
  { id: 'band_chart_block', type: 'chart', chartId: 'distance_bands' },
  {
    id: 'paper', type: 'markdown', body: `## Onderzoek en model

Nevrlý et al. onderzoeken plasticafval en modelleren volumegewogen loopafstand, aantal inzamelpunten, aanschafkosten en voertuigservicetijd als conflicterende criteria. Dit rapport past de afwegingsmethode toe op restafval. Er volgt geen universele 275-metergrens uit het artikel.

	De 75 is een BAG-adresproxy, geen bewezen fysieke volumegrens. Afvalvolumes, vulgraad, ledigingsfrequentie, lokale kosten en HVC-servicetijden ontbreken. De OSM-netwerkafstand gebruikt projectie op het dichtstbijzijnde toegankelijke wegsegment; de eerdere knoopgesnapte matrix had MAE 29,9 m en P95 absolute afwijking 80,9 m, maar deze opvolger is niet onafhankelijk veldgekalibreerd. De openbare scenariovergelijking gebruikt alleen deze matrix; de drie private WH23-kaartrijen behouden hun opgeslagen OSRM-route en beïnvloeden de vergelijking niet.`
  },
  { id: 'criteria_table_block', type: 'table', tableId: 'criteria_table' },
  { id: 'loads_chart_block', type: 'chart', chartId: 'new_loads' },
  { id: 'existing_table_block', type: 'table', tableId: 'existing_table' },
  { id: 'new_table_block', type: 'table', tableId: 'new_locations_table' },
  {
    id: 'selection', type: 'markdown', body: `## Besloten locatievariant

De vorige 25 zoekzones zijn als baseline herbouwd. WH02 is vervangen door M055, WH30 door M056 en M082 is toegevoegd. M027, M044 en M094 blijven behouden. De gelijk-aantalvariant zonder M094 heeft ${findings.samePhysicalCountSensitivity.capacityBalancedDistance.distanceBands.over_275} adressen boven 275 m; met M094 zijn dat ${recommendedDistance.distanceBands.over_275}. Als M044 vervalt loopt WH24 op tot ${findings.m044RemovalSensitivity.assignedHouseholdsByLocation.WH24} adressen en neemt de totale afstand toe. De locatiekeuzes zijn scenarioafwegingen, geen wereldwijd optimaliteitsbewijs.`
  },
  {
    id: 'map', type: 'markdown', body: `## Kaart en afstandskleuren

Open [de interactieve overzichtskaart](overview-map.html) of [de SVG-kaart](overview-map.svg). Donker vierkant is bestaand openbaar, inclusief WH24; de blauwe ruit is WH23 privé en magenta pluscirkel is een nieuw modelanker. Binnen dit model is 275 m alleen een kwaliteitsindicator.`
  },
  {
    id: 'screening', type: 'markdown', body: `## Zoekzones zijn geen bouwpinnen

Vier nieuwe zones zijn groen en negentien oranje in de bestaande voorselectie. M055, M056 en M082 zijn op hun exacte pin nog niet integraal gescreend. Geen enkele zone is uitvoeringsrijp. Orthofoto, BGT, OSM en gemeentelijke stukken bewijzen geen eigendom, vrije kabel-/leidingruimte, boomwortelvrij volume, voertuigbeweging, parkeerdruk of draagkracht.

Vereist: veldinmeting, KLIC en zo nodig proefsleuven, juridische titel, bodem/water/bomen, toegankelijkheid en een HVC rijcurve-, stempel- en hijsproef. Iedere pinverschuiving vraagt een nieuwe route- en capaciteitsrun.`
  },
  {
    id: 'fairness', type: 'markdown', body: `## Scope, uitschieters en groei

Er blijven ${recommendedDistance.distanceBands.over_275} openbare adressen boven 275 m; model-P95 is ${recommendedDistance.p95WalkingDistanceM} m en het maximum ${recommendedDistance.maximumWalkingDistanceM} m. De analyse sluit 303 BAG-woonfunctieadressen buiten de vastgelegde BRT-bebouwde-komgrens uit; dat blijft een beleidskeuze.

Dergmeerweg noemt 88 toekomstige woningen: reserveer ruimte voor één of twee extra bakken, afhankelijk van netto nieuwe adressen, spreiding, afvalvolume en reserve. Controleer bij Landsheer welke van de 153 woningen al in de BAG-momentopname zitten.`
  },
  {
    id: 'reproducibility', type: 'markdown', body: `## Reproduceerbaarheid

\`build-segment-snapped-walking-matrix.mjs\` herbouwt de lokale afstandsmatrix met wegsegmentsnapping. \`build-capacity-plan.mjs\` bouwt de WH24-openbare baseline, de besloten locatievariant, gevoeligheden en unieke capaciteitsassignments. \`validate-capacity-plan.mjs\` controleert adressen, lasten, toegang, vaste coördinaten, bronhashes en kaartpresentatie. Zie [private-access-leave-one-out.json](private-access-leave-one-out.json) voor de eerdere baseline en [capacity-plan.json](capacity-plan.json), [household-assignment.json](household-assignment.json), [locations.tsv](locations.tsv) en [locations.geojson](locations.geojson) voor de actuele variant.`
  }
];

const manifest = {
  version: 1,
  surface: 'report',
  title,
  description: 'Brononderbouwd capaciteitsplan met 11 bestaande locaties, WH24 openbaar, WH23 privé en 26 nieuwe openbare zoekzones.',
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
      distance_bands: bandRows,
      load_distribution: loadDistributionRows,
      new_locations: newRows,
      existing_locations: existingRows,
      criteria: criteriaRows
    }
  },
  sources
};

writeFileSync(new URL('artifact.json', reportDirectory), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ title, blocks: blocks.length, charts: charts.length, tables: tables.length, newLocations: newRows.length }, null, 2));
