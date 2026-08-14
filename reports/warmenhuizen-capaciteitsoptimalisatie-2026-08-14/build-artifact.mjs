#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const generatedAt = new Date().toISOString();
const plan = JSON.parse(readFileSync(new URL('capacity-plan.json', reportDirectory), 'utf8'));
const screening = JSON.parse(readFileSync(new URL('location-screening.json', reportDirectory), 'utf8'));
const title = 'Warmenhuizen: circa 75 huishoudens per restcontainer';

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

const recommended = plan.recommendedScenario;
const municipal = plan.municipalConceptComparison;
const scenarioRows = [
  {
    scenario: 'Gemeentelijke restvoorstellen',
    label: 'Gemeente',
    openbare_locaties: municipal.publicLocationCount,
    nieuwe_locaties: municipal.newPublicLocationCount,
    gemiddeld_adressen: municipal.averageHouseholdsPerPublicContainer,
    gemiddeld_m: municipal.distance.averageWalkingDistanceM,
    p95_m: municipal.distance.p95WalkingDistanceM,
    maximum_m: municipal.distance.maximumWalkingDistanceM,
    boven_275: municipal.distance.distanceBands.over_275,
    totale_loopafstand_m: municipal.distance.totalWalkingDistanceM
  },
  {
    scenario: 'Capaciteitsplan met WH24 openbaar',
    label: 'Advies',
    openbare_locaties: recommended.publicLocationCount,
    nieuwe_locaties: recommended.newPublicLocationCount,
    gemiddeld_adressen: recommended.averageHouseholdsPerPublicContainer,
    gemiddeld_m: recommended.distance.averageWalkingDistanceM,
    p95_m: recommended.distance.p95WalkingDistanceM,
    maximum_m: recommended.distance.maximumWalkingDistanceM,
    boven_275: recommended.distance.distanceBands.over_275,
    totale_loopafstand_m: recommended.distance.totalWalkingDistanceM
  }
];

const bandRows = [
  ['0–100 m', 'within_100'],
  ['100–125 m', 'between_100_125'],
  ['125–150 m', 'between_125_150'],
  ['150–275 m', 'between_150_275'],
  ['>275 m', 'over_275']
].map(([band, key]) => ({
  band,
  gemeente: municipal.distance.distanceBands[key],
  advies: recommended.distance.distanceBands[key]
}));

const newRows = screening.locations.filter(({ role }) => role === 'new').map((location) => ({
  id: location.id,
  adresreferentie: location.address,
  bron: location.source === 'municipal-concept' ? 'gemeentelijk concept' : 'eigen zoekanker',
  latitude: location.lat,
  longitude: location.lon,
  adressen: location.assignedHouseholds,
  bureauscreen: location.rating,
  status: location.rating === 'green'
    ? 'plausibele zoekzone; integraal toetsen'
    : 'lokale verschuiving/conflictcontrole nodig'
}));

const existingRows = screening.locations.filter(({ role }) => role !== 'new').map((location) => ({
  id: location.id,
  toegang: location.role === 'existing-private' ? 'privé' : 'openbaar',
  adres: location.address,
  adressen: location.assignedHouseholds,
  bureauscreen: location.rating,
  besluit: location.id === 'WH24' ? 'openbaar volgens expliciete scenarioaanname' : 'bestaand; exacte locatie behouden'
}));

const criteriaRows = [
  { criterium: 'Loopafstand', artikel: 'volumegewogen afstand', toepassing: 'één BAG-woonadresproxy, voetgangersnetwerkafstand', grens: '275 m alleen rapportage' },
  { criterium: 'Aantal punten/bakken', artikel: 'aantal inzamelpunten en containertype', toepassing: 'minimum 25 nieuwe openbare fysieke bakken', grens: '35 openbaar + WH23 privé' },
  { criterium: 'Capaciteit', artikel: 'volume, frequentie en benutting', toepassing: 'beleidsproxy 60–90 adressen per nieuwe bak', grens: 'geen liter-/kilogrambewijs' },
  { criterium: 'Servicetijd', artikel: 'voertuigservicetijd', toepassing: 'alleen BGT/OSM/orthofoto-voorselectie', grens: 'HVC-ritten en stoptijden ontbreken' },
  { criterium: 'Kosten', artikel: 'aanschafkosten', toepassing: 'sunk bestaande locaties; nieuwe aantallen geminimaliseerd', grens: 'lokale civiele en beheerkosten ontbreken' }
];

const loadDistributionRows = [
  { band: '60–74', aantal: newRows.filter(({ adressen }) => adressen >= 60 && adressen <= 74).length },
  { band: '75–89', aantal: newRows.filter(({ adressen }) => adressen >= 75 && adressen <= 89).length },
  { band: '90', aantal: newRows.filter(({ adressen }) => adressen === 90).length }
];

const sources = [
  { id: 'paper', label: 'Nevrlý et al. (2021), Location of municipal waste containers: Trade-off between criteria', href: 'https://www.sciencedirect.com/science/article/pii/S0959652620334909' },
  { id: 'paper_predecessor', label: 'Nevrlý et al. (2019), openbare MILP-voorganger', href: 'https://www.cetjournal.it/index.php/cet/article/view/CET1976093' },
  { id: 'paper_thesis', label: 'Khýr (2020), openbare VUT-masterthesis', href: 'https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3' },
  { id: 'schagen_plan', label: 'Gemeente Schagen conceptlocaties Warmenhuizen', href: 'https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen' },
  { id: 'schagen_pdf', label: 'Bewonersboekje Warmenhuizen', href: 'https://www.schagen.nl/sites/default/files/2026-04/bewonersboekje-warmenhuizen.pdf' },
  { id: 'criteria', label: 'Formele locatiecriteria gemeente Schagen', href: 'https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html' },
  { id: 'bag', label: 'PDOK BAG OGC API', href: 'https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&lang=nl', path: 'data/places/warmenhuizen/house-coverage.json' },
  { id: 'bgt', label: 'PDOK BGT OGC API', href: 'https://api.pdok.nl/lv/bgt/ogc/v1?f=html&lang=nl', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/location-screening.json' },
  { id: 'orthophoto', label: 'PDOK luchtfoto RGB', href: 'https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-' },
  { id: 'osm', label: 'OpenStreetMap pedestrian network snapshot', href: 'https://www.openstreetmap.org/copyright', path: 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/osm-highways.json' },
  { id: 'plan_json', label: 'Volledig capaciteitsplan en bronhashes', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/capacity-plan.json' },
  { id: 'assignments', label: 'Unieke toewijzing van 2.579 adresproxies', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/household-assignment.json' },
  { id: 'map', label: 'Interactieve afstandskaart', path: 'reports/warmenhuizen-capaciteitsoptimalisatie-2026-08-14/overview-map.html' }
];

const charts = [
  {
    id: 'distance_comparison',
    title: 'Het advies verkort gemiddelde en P95-loopafstand',
    subtitle: 'Zelfde 2.576 openbare BAG-woonadresproxies, voetgangersmatrix en capaciteitsband.',
    type: 'bar',
    dataset: 'scenarios',
    source: inlineSqlSource('distance_comparison_sql', 'Afstandsvergelijking', scenarioRows, ['label', 'gemiddeld_m', 'p95_m'], 'Afgeleid uit capacity-plan.json.'),
    encodings: {
      x: { field: 'label', type: 'nominal', label: 'Scenario' },
      y: { fields: ['gemiddeld_m', 'p95_m'], type: 'quantitative', label: 'Loopafstand (m)' },
      tooltip: [
        { field: 'gemiddeld_m', type: 'quantitative', label: 'Gemiddeld (m)' },
        { field: 'p95_m', type: 'quantitative', label: 'P95 (m)' }
      ]
    }
  },
  {
    id: 'distance_bands',
    title: 'Afstandskleuren verschuiven naar kortere routes',
    subtitle: '275 meter is een rapportageband, geen harde optimalisatiegrens.',
    type: 'bar',
    dataset: 'distance_bands',
    source: inlineSqlSource('distance_bands_sql', 'Afstandsbanden', bandRows, ['band', 'gemeente', 'advies'], 'Afgeleid uit de capaciteitsassignments.'),
    encodings: {
      x: { field: 'band', type: 'nominal', label: 'Loopafstand' },
      y: { fields: ['gemeente', 'advies'], type: 'quantitative', label: 'Adresproxies' },
      tooltip: [
        { field: 'gemeente', type: 'quantitative', label: 'Gemeente' },
        { field: 'advies', type: 'quantitative', label: 'Advies' }
      ]
    }
  },
  {
    id: 'new_loads',
    title: 'Nieuwe locaties liggen rond het doel van 75',
    subtitle: 'Verdeling van de 25 nieuwe bakken binnen de beleidsband 60–90.',
    type: 'bar',
    dataset: 'load_distribution',
    source: inlineSqlSource('new_loads_sql', 'Belastingsbanden nieuwe locaties', loadDistributionRows, ['band', 'aantal'], 'Geteld uit location-screening.json.'),
    encodings: {
      x: { field: 'band', type: 'nominal', label: 'Toegewezen adressen' },
      y: { field: 'aantal', type: 'quantitative', label: 'Nieuwe locaties' },
      tooltip: [{ field: 'aantal', type: 'quantitative', label: 'Locaties' }]
    }
  }
];

const tables = [
  {
    id: 'scenario_table',
    title: 'Gelijke modelvergelijking',
    subtitle: 'WH24 is in beide scenario’s openbaar; WH23 blijft privé.',
    dataset: 'scenarios', density: 'dense',
    source: inlineSqlSource('scenario_table_sql', 'Scenario-KPI’s', scenarioRows, Object.keys(scenarioRows[0]), 'Afgeleid uit capacity-plan.json.'),
    columns: [
      { field: 'scenario', label: 'Scenario', type: 'text', sizing: 'content' },
      { field: 'openbare_locaties', label: 'Openbaar', type: 'number', sizing: 'content' },
      { field: 'gemiddeld_adressen', label: 'Adres/bak', type: 'number', sizing: 'content' },
      { field: 'gemiddeld_m', label: 'Gem. m', type: 'number', sizing: 'content' },
      { field: 'p95_m', label: 'P95 m', type: 'number', sizing: 'content' },
      { field: 'boven_275', label: '>275 m', type: 'number', sizing: 'content' }
    ]
  },
  {
    id: 'new_locations_table',
    title: 'De 25 aanvullende zoekzones',
    subtitle: 'Service-ankers; geen bouw- of graafpinnen.',
    dataset: 'new_locations', density: 'dense',
    source: inlineSqlSource('new_locations_sql', 'Nieuwe zoekzones', newRows, Object.keys(newRows[0]), 'Afgeleid uit location-screening.json.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'adresreferentie', label: 'Referentie', type: 'text', sizing: 'content' },
      { field: 'bron', label: 'Bron', type: 'text', sizing: 'content' },
      { field: 'adressen', label: 'Adressen', type: 'number', sizing: 'content' },
      { field: 'bureauscreen', label: 'Screen', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'existing_table',
    title: 'De elf onverplaatste bestaande locaties',
    subtitle: 'WH24 openbaar; WH23 als enige privélocatie.',
    dataset: 'existing_locations', density: 'dense',
    source: inlineSqlSource('existing_locations_sql', 'Bestaande locaties', existingRows, Object.keys(existingRows[0]), 'Afgeleid uit location-screening.json.'),
    columns: [
      { field: 'id', label: 'ID', type: 'text', sizing: 'content' },
      { field: 'toegang', label: 'Toegang', type: 'text', sizing: 'content' },
      { field: 'adres', label: 'Adres', type: 'text', sizing: 'content' },
      { field: 'adressen', label: 'Adressen', type: 'number', sizing: 'content' },
      { field: 'besluit', label: 'Status', type: 'text', sizing: 'content' }
    ]
  },
  {
    id: 'criteria_table',
    title: 'Vertaling van het onderzoek',
    subtitle: 'Wat is toegepast en welke operationele data nog ontbreken.',
    dataset: 'criteria', density: 'dense',
    source: inlineSqlSource('criteria_sql', 'Onderzoekscriteria', criteriaRows, Object.keys(criteriaRows[0]), 'Methodische vertaling van Nevrlý et al.'),
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
    id: 'summary', type: 'markdown', body: `## Advies

Behoud alle **11 bestaande** containers exact. Maak **WH24 openbaar** en houd alleen WH23 privé voor drie adressen. Plaats **25 nieuwe openbare bakken**: 36 fysiek totaal, waarvan 35 openbaar. De 2.576 openbare BAG-woonadresproxies geven gemiddeld **73,6 adressen per openbare container**.

De ondergrens is exact: \`ceil(2.576 / 75) = 35\` openbaar. De 25 nieuwe locaties hebben ieder 60–90 toegewezen adressen. Dit is de beste gevonden lokale locatieoplossing, niet een mondiaal optimaliteitsbewijs.`
  },
  { id: 'scenario_table_block', type: 'table', tableId: 'scenario_table' },
  { id: 'distance_chart_block', type: 'chart', chartId: 'distance_comparison' },
  {
    id: 'comparison', type: 'markdown', body: `Het advies gebruikt vier openbare locaties meer dan de 21 nieuwe gemeentelijke restvoorstellen, maar reduceert de totale openbare eenrichtingsloopafstand met **${plan.comparison.totalWalkingDistanceReductionPercent}%**, gemiddeld met ${plan.comparison.averageWalkingDistanceReductionM} m en P95 met ${plan.comparison.p95WalkingDistanceReductionM} m. Het aantal openbare adressen boven 275 m daalt van ${municipal.distance.distanceBands.over_275} naar ${recommended.distance.distanceBands.over_275}.`
  },
  { id: 'band_chart_block', type: 'chart', chartId: 'distance_bands' },
  {
    id: 'paper', type: 'markdown', body: `## Onderzoek en model

Nevrlý et al. modelleren volumegewogen loopafstand, aantal inzamelpunten, aanschafkosten en voertuigservicetijd als conflicterende criteria. Er volgt geen universele 275-metergrens uit het artikel. Voor dit dossier zijn bestaande voorzieningen vast, huishoudens ondeelbaar en looproutes netwerkafstanden. De volledige artikeltekst was niet legaal openbaar beschikbaar; exacte formulering is gecontroleerd tegen openbare primaire auteursbronnen.

De 75 is hier een beleidsmatige adresproxy, geen bewezen fysieke volumegrens. Afvalvolumes, containervolume, vulgraad, ledigingsfrequentie, lokale kosten en echte HVC-servicetijden ontbreken.`
  },
  { id: 'criteria_table_block', type: 'table', tableId: 'criteria_table' },
  { id: 'loads_chart_block', type: 'chart', chartId: 'new_loads' },
  { id: 'existing_table_block', type: 'table', tableId: 'existing_table' },
  { id: 'new_table_block', type: 'table', tableId: 'new_locations_table' },
  {
    id: 'map', type: 'markdown', body: `## Kaart en afstandskleuren

Open [de interactieve overzichtskaart](overview-map.html) of [de SVG-kaart](overview-map.svg). Kleuren zijn exact de repo-indeling: groen 0–100, geel 100–125, oranje 125–150, rood 150–275, donkerrood boven 275 en grijs onbereikbaar. 275 m is alleen een kwaliteitsindicator.`
  },
  {
    id: 'screening', type: 'markdown', body: `## Zoekzones zijn geen bouwpinnen

Vier nieuwe zones zijn groen en 21 oranje in de geautomatiseerde/visuele voorselectie. Geen enkele zone is uitvoeringsrijp. PDOK-orthofoto, BGT, OSM, BRK, HHNK, AHN en gemeentelijke stukken ondersteunen de bureauscreen, maar bewijzen geen eigendom, vrije kabel-/leidingruimte, boomwortelvrij volume, voertuigbeweging, actuele parkeerdruk of draagkracht.

Vereist: veldinmeting, KLIC en zo nodig proefsleuven, juridische titel, bodem/water/bomen, toegankelijkheid en een HVC swept-path-, stempel- en hijsproef. Iedere pinverschuiving vraagt een nieuwe route- en capaciteitsrun.`
  },
  {
    id: 'fairness', type: 'markdown', body: `## Afstandsuitschieters en groei

Er blijven 157 openbare adressen boven 275 m; P95 is 288,5 m en het maximum 776 m bij Debbemeerweg 39. De grootste clusters liggen aan Dorpsstraat, Fabrieksstraat, De Fuik, Oostwal, Oudevaart en Oudewal. Een aparte gelijkheidsvariant kan een extra corridorzone rond Oudevaart 67–89 onderzoeken, maar verlaagt de gemiddelde belasting onder het minimale 75-plan.

Dergmeerweg noemt publiek 88 toekomstige woningen: reserveer ten minste twee extra bakken en heroptimaliseer zodra een gezaghebbende adressenlijst beschikbaar is. Controleer bij Landsheer welke van de 153 woningen al in de BAG-momentopname zitten.`
  },
  {
    id: 'reproducibility', type: 'markdown', body: `## Reproduceerbaarheid

\`build-wh24-public-column.mjs\` voegt WH24 met dezelfde vastgelegde OSM-graaf toe. \`build-capacity-plan.mjs\` bouwt de unieke capaciteitsassignments. \`validate-capacity-plan.mjs\` controleert alle 2.579 adressen, lasten, private toegang, vaste coördinaten, bronhashes en kaartkleuren. Zie ook [capacity-plan.json](capacity-plan.json), [household-assignment.json](household-assignment.json), [locations.tsv](locations.tsv) en [locations.geojson](locations.geojson).`
  }
];

const manifest = {
  version: 1,
  surface: 'report',
  title,
  description: 'Brononderbouwd capaciteitsplan met WH24 openbaar, 11 bestaande en 25 nieuwe restcontainers.',
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
