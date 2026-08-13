#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const GENERATED_AT = "2026-08-13T22:15:00+02:00";
const TITLE = "Warmenhuizen: bestaande HVC-locaties behouden en gericht aanvullen";
const DETAIL_THRESHOLD_M = 225;

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function quantile(sortedValues, probability) {
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function summarizeDistances(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    mean: round(total / sorted.length),
    p95: round(quantile(sorted, 0.95)),
    maximum: round(sorted.at(-1)),
  };
}

function countDetailedBands(rows, distanceField) {
  const counts = {
    "0-100 m": 0,
    "100-125 m": 0,
    "125-150 m": 0,
    "150-200 m": 0,
    "200-225 m": 0,
    "225-275 m": 0,
    ">275 m": 0,
  };
  for (const row of rows) {
    const distance = row[distanceField];
    if (row.coverageStatus === "within_100") counts["0-100 m"] += 1;
    else if (row.coverageStatus === "between_100_125") counts["100-125 m"] += 1;
    else if (row.coverageStatus === "between_125_150") counts["125-150 m"] += 1;
    else if (row.coverageStatus === "between_150_275" && distance <= 200) counts["150-200 m"] += 1;
    else if (row.coverageStatus === "between_150_275" && distance <= 225) counts["200-225 m"] += 1;
    else if (row.coverageStatus === "between_150_275") counts["225-275 m"] += 1;
    else if (row.coverageStatus === "over_275") counts[">275 m"] += 1;
  }
  return counts;
}

function detailedBandRows(currentRows, proposalRows) {
  const current = countDetailedBands(currentRows, "walkingDistance");
  const proposal = countDetailedBands(proposalRows, "walkingDistanceM");
  return Object.keys(current).map((band) => ({
    band,
    referentie: current[band],
    voorstel: proposal[band],
  }));
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function inlineSqlSource(id, label, rows, fields, description) {
  const columns = fields.map((field) => `"${field}"`).join(", ");
  const values = rows
    .map((row) => `(${fields.map((field) => sqlLiteral(row[field])).join(", ")})`)
    .join(",\n  ");
  return {
    id,
    label,
    query: {
      description,
      sql: `WITH source(${columns}) AS (\n  VALUES\n  ${values}\n)\nSELECT * FROM source;`,
      executed_at: GENERATED_AT,
    },
  };
}

const optimization = readJson(new URL("fixed-existing-route-optimization.json", REPORT_DIR));
const modeledCoverage = readJson(new URL("fixed-existing-household-coverage-225.json", REPORT_DIR));
const currentCoverage = readJson(new URL("data/places/warmenhuizen/house-coverage.json", REPO_DIR));
const coverageSummary = readJson(new URL("data/places/warmenhuizen/coverage-summary.json", REPO_DIR));
const survey = readJson(new URL("data/places/warmenhuizen/survey-analysis-2026-07-02.json", REPO_DIR));
const priorRecommendation = readJson(new URL("recommended-locations.json", REPORT_DIR));
const aerialNorth = readJson(new URL("aerial-assessment-sites-01-22.json", REPORT_DIR));
const aerialSouth = readJson(new URL("aerial-assessment-sites-23-43.json", REPORT_DIR));

const scenario225 = optimization.scenarios.find(({ maximumWalkingDistanceTargetM }) => (
  maximumWalkingDistanceTargetM === DETAIL_THRESHOLD_M
));
const capacity100 = optimization.capacitySensitivity225M.find(({ capacityPerContainerAddressEquivalents }) => (
  capacityPerContainerAddressEquivalents === 100
));
const capacity75 = optimization.capacitySensitivity225M.find(({ capacityPerContainerAddressEquivalents }) => (
  capacityPerContainerAddressEquivalents === 75
));
if (!scenario225 || !capacity100 || !capacity75) {
  throw new Error("The fixed-existing 225 m scenario and both capacity scenarios are required");
}

const priorSiteByNode = new Map(priorRecommendation.sites.map((site) => [site.node, site]));
const aerialByPriorSite = new Map([
  ...aerialNorth.sites.map((site) => [site.site, {
    rating: site.status,
    recommendation: site.preferredAdjustment,
    confidence: site.confidence,
  }]),
  ...aerialSouth.sites.map((site) => [site.site, {
    rating: site.rating,
    recommendation: site.recommendation,
    confidence: null,
  }]),
]);

const currentDistances = currentCoverage.houses.map(({ walkingDistance }) => walkingDistance);
const proposalDistances = modeledCoverage.houses.map(({ walkingDistanceM }) => walkingDistanceM);
const currentMetrics = summarizeDistances(currentDistances);
const proposalMetrics = summarizeDistances(proposalDistances);
const distanceBands = detailedBandRows(currentCoverage.houses, modeledCoverage.houses);
const currentVsProposal = [
  { metric: "Gemiddeld", referentie_m: currentMetrics.mean, voorstel_m: proposalMetrics.mean },
  { metric: "P95", referentie_m: currentMetrics.p95, voorstel_m: proposalMetrics.p95 },
  { metric: "Maximum", referentie_m: currentMetrics.maximum, voorstel_m: proposalMetrics.maximum },
];

const scenarioFrontier = optimization.scenarios.map((scenario) => ({
  cap_m: `${scenario.maximumWalkingDistanceTargetM} m`,
  ondergrens_totaal: scenario.fixedExistingLocationCount + scenario.additionalSitePackingLowerBound,
  gevonden_totaal: scenario.totalPhysicalLocationCount,
  bestaande_locaties: scenario.fixedExistingLocationCount,
  aanvullingen_gevonden: scenario.additionalSiteCount,
}));

const locationDistanceStats = new Map(modeledCoverage.locations.map(({ id }) => [id, []]));
for (const house of modeledCoverage.houses) {
  if (locationDistanceStats.has(house.nearestLocationId)) {
    locationDistanceStats.get(house.nearestLocationId).push(house.walkingDistanceM);
  }
}

const locationRows = modeledCoverage.locations.map((location) => {
  const priorSite = location.kind === "additional-model-site"
    ? priorSiteByNode.get(location.graphNode)
    : null;
  const aerial = priorSite ? aerialByPriorSite.get(priorSite.site) : null;
  const assignedDistances = locationDistanceStats.get(location.id) ?? [];
  const assignedStats = assignedDistances.length > 0
    ? summarizeDistances(assignedDistances)
    : { mean: null, p95: null, maximum: null };
  const isExisting = location.kind === "existing";
  return {
    id: location.id,
    soort: isExisting ? "bestaande HVC-locatie" : "aanvullend zoekanker",
    toegang: location.accessScope === "private" ? "privé/allowlist" : "openbaar modelaanbod",
    nabij_adres: isExisting ? location.address : priorSite?.referenceAddress ?? "-",
    straat: isExisting ? location.address.replace(/\s+\d.*$/, "") : priorSite?.street ?? "-",
    latitude: location.lat.toFixed(6),
    longitude: location.lon.toFixed(6),
    hvc_id: location.hvcContainerId ?? "-",
    oud_site_nummer: priorSite?.site ?? null,
    luchtfoto: isExisting ? "bestaand" : aerial?.rating ?? "niet beoordeeld",
    gemeentegrond_screen: isExisting
      ? "bestaande locatie; niet opnieuw gescreend"
      : (priorSite?.exactMunicipal
        ? "exacte positieve hit"
        : (priorSite?.municipalParcelWithin25M ? "gemeentegrond binnen 25 m" : "geen hit binnen 25 m")),
    voertuigroute_screen: isExisting
      ? "bestaande HVC-locatie"
      : `${priorSite?.nearestPublicVehicleHighway?.highway ?? "onbekend"} (${priorSite?.nearestPublicVehicleHighway?.distanceM ?? "-"} m)`,
    dichtstbijzijnde_adressen_ongecapaciteerd: assignedDistances.length,
    toegewezen_bij_100: capacity100.assignedHouseholdsByLocation?.[location.id] ?? null,
    toegewezen_bij_75: capacity75.assignedHouseholdsByLocation?.[location.id] ?? null,
    gemiddelde_m: assignedStats.mean,
    p95_m: assignedStats.p95,
    maximum_m: assignedStats.maximum,
    bakken_bij_100: 1 + (capacity100.extraContainersByLocation?.[location.id] ?? 0),
    bakken_bij_75: 1 + (capacity75.extraContainersByLocation?.[location.id] ?? 0),
    lokaal_vervolg: isExisting
      ? "Actuele status, assetaantal, bereikbaarheid en behoud schriftelijk door HVC bevestigen."
      : aerial?.recommendation ?? "Technisch en juridisch inmeten voordat deze pin kan worden gebruikt.",
  };
});

locationRows.sort((left, right) => (
  right.soort.localeCompare(left.soort)
  || left.id.localeCompare(right.id, "en", { numeric: true })
));

const additionalRows = locationRows.filter(({ soort }) => soort === "aanvullend zoekanker");
const aerialCounts = additionalRows.reduce((counts, { luchtfoto }) => ({
  ...counts,
  [luchtfoto]: (counts[luchtfoto] ?? 0) + 1,
}), {});
const exactMunicipalCount = additionalRows.filter(({ gemeentegrond_screen }) => (
  gemeentegrond_screen === "exacte positieve hit"
)).length;
const municipalWithin25Count = additionalRows.filter(({ gemeentegrond_screen }) => (
  gemeentegrond_screen === "gemeentegrond binnen 25 m"
)).length;
const noMunicipalHitWithin25Count = additionalRows.filter(({ gemeentegrond_screen }) => (
  gemeentegrond_screen === "geen hit binnen 25 m"
)).length;

const retainedNodes = new Set(scenario225.selectedAdditionalSites.map(({ graphNode }) => graphNode));
const removedPriorSites = priorRecommendation.sites
  .filter(({ node }) => !retainedNodes.has(node))
  .map(({ site, street }) => `site ${site} (${street})`)
  .join(", ");

const capacity75ExtraLabels = Object.keys(capacity75.extraContainersByLocation ?? {}).map((id) => {
  const row = locationRows.find((location) => location.id === id);
  return `${id} (${row?.nabij_adres ?? "onbekend"})`;
}).join(" en ");

const surveyRows = survey.distanceBands.map((band) => ({
  afstand: band.label,
  reacties: band.total,
  instemming_pct: round(band.yesRatio * 100),
  afwijzing_pct: round(band.noRatio * 100),
}));

const sources = [
  {
    id: "fixed_existing_input",
    label: "Audit vaste bestaande HVC-restlocaties",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-input-audit.md",
  },
  {
    id: "fixed_existing_model",
    label: "Reproduceerbare optimalisatie met bestaande locaties als harde randvoorwaarde",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-route-optimization.json",
  },
  {
    id: "household_map_data",
    label: "Per woonadres berekende dekking in het behoudscenario",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-household-coverage-225.json",
  },
  {
    id: "household_map",
    label: "Interactieve huishoudkaart van het behoudscenario",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/fixed-existing-household-coverage-map.html",
  },
  {
    id: "current_coverage",
    label: "Actuele 33-locatie plan-/reporeferentie",
    path: "data/places/warmenhuizen/house-coverage.json",
  },
  {
    id: "prior_site_screen",
    label: "Eerdere openbare-grond-, voertuigroute- en luchtfotoscreen van 43 vrije modelankers",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/recommended-locations.json",
  },
  {
    id: "ownership_screen",
    label: "Provincie Noord-Holland BRK-percelen, grootgrondgebruik",
    href: "https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1",
  },
  {
    id: "aerial_bgt",
    label: "PDOK Luchtfoto 2026 en Basisregistratie Grootschalige Topografie",
    href: "https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/aerial-bgt-screen.json",
  },
  {
    id: "osm_access",
    label: "OpenStreetMap-wegennet Warmenhuizen",
    href: "https://www.openstreetmap.org/copyright",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/osm-highways.json",
  },
  {
    id: "schagen_policy",
    label: "Gemeente Schagen: plaatsing ondergrondse restafvalcontainers Warmenhuizen",
    href: "https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen",
  },
  {
    id: "schagen_lior",
    label: "Gemeente Schagen LIOR, deel 2",
    href: "https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf",
  },
  {
    id: "schagen_hoep_decision",
    label: "Aanwijzingsbesluit ondergrondse containers De Hoep",
    href: "https://lokaleregelgeving.overheid.nl/CVDR757179/1",
  },
  {
    id: "council_of_state",
    label: "Raad van State 2021:1194",
    href: "https://www.raadvanstate.nl/uitspraken/@124982/202101193-1-r1-en-202101193-2-r1/",
  },
  {
    id: "hvc_requirements_note",
    label: "Bronnotitie HVC-ledigingseisen en vergelijkingsmaten",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/hvc-vehicle-requirements.md",
  },
  {
    id: "hvc_information",
    label: "HVC: ondergrondse restafvalcontainer",
    href: "https://www.hvcgroep.nl/ondergrondse-restafval",
  },
  {
    id: "klic",
    label: "Kadaster KLIC-orientatieverzoek",
    href: "https://www.kadaster.nl/zakelijk/producten/graafwerk/orientatieverzoek",
  },
  {
    id: "survey",
    label: "Inwonersenquete Warmenhuizen, 2 juli 2026",
    path: "data/places/warmenhuizen/survey-analysis-2026-07-02.json",
  },
];

const manifest = {
  version: 1,
  surface: "report",
  title: TITLE,
  description: "Gecorrigeerd locatie- en capaciteitsadvies waarin alle bestaande HVC-restlocaties behouden blijven.",
  generatedAt: GENERATED_AT,
  charts: [
    {
      id: "distance_comparison",
      title: "Loopafstand in de 33-locatiereferentie en de gecorrigeerde 225-metervariant",
      subtitle: "Gemiddelde, P95 en maximum in meters; 2.579 BAG-woonfunctie-adressen.",
      type: "bar",
      dataset: "current_vs_proposal",
      source: inlineSqlSource(
        "distance_comparison_sql",
        "Referentie versus behoudscenario",
        currentVsProposal,
        ["metric", "referentie_m", "voorstel_m"],
        "Afgeleid uit de actuele repo-dekking en de vaste-bestaande routegraafvariant.",
      ),
      encodings: {
        x: { field: "metric", type: "nominal", label: "Maatstaf" },
        y: { fields: ["referentie_m", "voorstel_m"], type: "quantitative", label: "Loopafstand (m)" },
        tooltip: [
          { field: "referentie_m", type: "quantitative", label: "33-locatiereferentie", format: "number" },
          { field: "voorstel_m", type: "quantitative", label: "Behoudscenario", format: "number" },
        ],
      },
    },
    {
      id: "fixed_frontier",
      title: "Afstandsplafond en totaal aantal locaties bij verplicht behoud",
      subtitle: "Elf locaties staan vast; de grafiek toont een geldige ondergrens en een gevonden bovengrens.",
      type: "bar",
      dataset: "scenario_frontier",
      source: inlineSqlSource(
        "fixed_frontier_sql",
        "Modelgrenzen met elf vaste HVC-locaties",
        scenarioFrontier,
        ["cap_m", "ondergrens_totaal", "gevonden_totaal", "bestaande_locaties", "aanvullingen_gevonden"],
        "Scenarioresultaten van optimize-with-fixed-existing.mjs.",
      ),
      encodings: {
        x: { field: "cap_m", type: "nominal", label: "Maximale modelafstand" },
        y: { fields: ["ondergrens_totaal", "gevonden_totaal"], type: "quantitative", label: "Locaties/modelpunten" },
        tooltip: [
          { field: "bestaande_locaties", type: "quantitative", label: "Verplicht bestaand" },
          { field: "aanvullingen_gevonden", type: "quantitative", label: "Gevonden aanvullingen" },
        ],
      },
    },
    {
      id: "survey_agreement",
      title: "Instemming in de inwonersenquete naar loopafstand",
      subtitle: "809 zelfgeselecteerde reacties; indicatief en niet causaal.",
      type: "bar",
      dataset: "survey_distance",
      source: inlineSqlSource(
        "survey_agreement_sql",
        "Inwonersenquete naar afstandsband",
        surveyRows,
        ["afstand", "reacties", "instemming_pct", "afwijzing_pct"],
        "Afstandsbandtotalen uit survey-analysis-2026-07-02.json.",
      ),
      encodings: {
        x: { field: "afstand", type: "nominal", label: "Loopafstand" },
        y: { field: "instemming_pct", type: "quantitative", label: "Instemming (%)" },
        tooltip: [
          { field: "reacties", type: "quantitative", label: "Reacties" },
          { field: "afwijzing_pct", type: "quantitative", label: "Afwijzing (%)" },
        ],
      },
    },
  ],
  tables: [
    {
      id: "locations_table",
      title: "Elf bestaande locaties en 38 aanvullende zoekankers",
      subtitle: "Exacte modelcoordinaten; aanvullende ankers zijn geen bouwpinnen.",
      dataset: "locations",
      source: inlineSqlSource(
        "locations_sql",
        "Gecorrigeerde locatieset",
        locationRows,
        ["id", "soort", "toegang", "nabij_adres", "latitude", "longitude", "hvc_id", "oud_site_nummer", "luchtfoto", "gemeentegrond_screen", "dichtstbijzijnde_adressen_ongecapaciteerd", "toegewezen_bij_100", "toegewezen_bij_75", "bakken_bij_100", "bakken_bij_75", "maximum_m", "lokaal_vervolg"],
        "Vaste HVC-punten plus de gevonden set-cover-bovengrens bij 225 meter.",
      ),
      defaultSort: { field: "soort", direction: "desc" },
      columns: [
        { field: "id", label: "ID", type: "text" },
        { field: "soort", label: "Soort", type: "text" },
        { field: "toegang", label: "Toegang", type: "text" },
        { field: "nabij_adres", label: "Adres/zoekzone", type: "text" },
        { field: "latitude", label: "Latitude", type: "text" },
        { field: "longitude", label: "Longitude", type: "text" },
        { field: "hvc_id", label: "HVC-ID", type: "text" },
        { field: "oud_site_nummer", label: "Eerdere site", type: "number" },
        { field: "luchtfoto", label: "Luchtfoto", type: "text" },
        { field: "gemeentegrond_screen", label: "Grondscreen", type: "text" },
        { field: "dichtstbijzijnde_adressen_ongecapaciteerd", label: "Dichtstbij (ongecap.)", type: "number" },
        { field: "toegewezen_bij_100", label: "Flow bij 100", type: "number" },
        { field: "toegewezen_bij_75", label: "Flow bij 75", type: "number" },
        { field: "bakken_bij_100", label: "Bakken bij 100", type: "number" },
        { field: "bakken_bij_75", label: "Bakken bij 75", type: "number" },
        { field: "maximum_m", label: "Max m", type: "number" },
        { field: "lokaal_vervolg", label: "Vervolg", type: "text" },
      ],
    },
    {
      id: "survey_table",
      title: "Enquete-uitkomsten per afstandsband",
      subtitle: "Geldige online en papieren reacties op 2 juli 2026.",
      dataset: "survey_distance",
      source: inlineSqlSource(
        "survey_table_sql",
        "Inwonersenquete naar afstandsband",
        surveyRows,
        ["afstand", "reacties", "instemming_pct", "afwijzing_pct"],
        "Afstandsbandtotalen uit survey-analysis-2026-07-02.json.",
      ),
      defaultSort: { field: "reacties", direction: "desc" },
      columns: [
        { field: "afstand", label: "Afstand", type: "text" },
        { field: "reacties", label: "Reacties", type: "number" },
        { field: "instemming_pct", label: "Instemming %", type: "number" },
        { field: "afwijzing_pct", label: "Afwijzing %", type: "number" },
      ],
    },
  ],
  sources,
  blocks: [
    { id: "title", type: "markdown", body: `# ${TITLE}` },
    {
      id: "executive_summary",
      type: "markdown",
      body: `## Executive Summary

- **Correctie:** alle **11 bestaande HVC-restlocaties blijven als harde randvoorwaarde staan**: 9 openbaar en WH23/WH24 alleen voor hun zeven vastgelegde Angelapark-adressen.
- **Advies:** hanteer **225 meter als ontwerpmaximum** en 275 meter alleen als gemotiveerde uitzondering. Het reproduceerbare model vindt bij 225 meter **38 aanvullende zoekankers**, dus **49 locaties/modelpunten in het scenario**. Het bewezen modelinterval is 39-49; 49 is geen bewezen minimum.
- **Afstand:** de gecorrigeerde variant komt uit op gemiddeld **${proposalMetrics.mean} m**, P95 **${proposalMetrics.p95} m** en maximaal **${proposalMetrics.maximum} m**. De 33-locatie plan-/reporeferentie staat op ${currentMetrics.mean} m, ${currentMetrics.p95} m en ${currentMetrics.maximum} m.
- **Capaciteit:** op de vaste 49 modelpunten zijn **${capacity100.testedContainerCount} bakken bij maximaal 100 adres-equivalenten** en **${capacity75.testedContainerCount} bij 75** exact haalbaar binnen de modelmatrix. Actieve passen, kilogrammen en vulgraad ontbreken.
- **Geen bouwbesluit:** van de 38 aanvullende ankers zijn er op luchtfoto/BGT **${aerialCounts.groen ?? 0} groen, ${aerialCounts.oranje ?? 0} oranje en ${aerialCounts.rood ?? 0} rood**. Na het verplaatsen van rode punten moet opnieuw worden gerouteerd; 49 locaties en de 225-metergarantie zijn daarom nog niet fysiek bewezen.
- **Kaart:** de aparte huishoudkaart kleurt alle **${modeledCoverage.houses.length.toLocaleString("nl-NL")} BAG-woonfunctie-adressen** volgens dezelfde zes afstandsbanden als de repo en onderscheidt bestaande openbare, bestaande private en aanvullende locaties.`,
    },
    {
      id: "correction",
      type: "markdown",
      body: `## Wat door deze correctie verandert

De eerdere vrije optimalisatie mocht ieder punt vervangen en kwam uit op 43 modelankers. Dat beantwoordde niet de feitelijke randvoorwaarde dat bestaande HVC-bakken blijven staan. De nieuwe run fixeert daarom WH03, WH05, WH06, WH08, WH14, WH23, WH24, WH26, WH27, WH33 en WH34 voordat aanvullingen worden gekozen.

De eerdere 43-nodeoplossing kan daarna naar 38 aanvullende ankers worden teruggesnoeid. De vervallen vrije ankers zijn ${removedPriorSites}. Drie daarvan liggen bij bestaande HVC-locaties in Zigt, Kuipersven en Poolster; de dekking van de overige twee wordt door de gezamenlijke vaste-plus-aanvullende set overgenomen.`,
      sourceId: "fixed_existing_input",
    },
    {
      id: "decision",
      type: "markdown",
      body: `## Het besluit dat ik zou nemen

Ontwerp lexicografisch: **(1) behoud de 11 bestaande HVC-punten, (2) voorkom dat een adres boven het afgesproken maximum komt, (3) verlaag daarna P95 en gemiddelde, (4) beperk pas daarna locaties en bakken, en (5) gebruik uitsluitend technisch en juridisch goedgekeurde bouwpinnen**.

Bij 225 meter ligt de reproduceerbare ondergrens op **${scenario225.fixedExistingLocationCount + scenario225.additionalSitePackingLowerBound} totale locaties**: 11 verplicht bestaand plus minimaal ${scenario225.additionalSitePackingLowerBound} aanvullingen. De gevonden haalbare bovengrens is ${scenario225.totalPhysicalLocationCount}. De 50 meter buffer tot de bestuurlijke circa 275 meter is nuttig voor lokale inpassing, maar kan een grote verplaatsing van een rood anker niet automatisch opvangen.`,
    },
    {
      id: "definitions",
      type: "markdown",
      body: `## Wat is precies gemeten?

De vraagpopulatie bestaat uit **${coverageSummary.summary.includedAddressCount.toLocaleString("nl-NL")} BAG-adressen met woonfunctie binnen de gebruikte bebouwde-komgrens**. Van de ${coverageSummary.summary.sourceAddressCount.toLocaleString("nl-NL")} woonfunctie-adressen in de BAG-woonplaats vallen ${coverageSummary.summary.excludedAddressCount} adressen (${round(coverageSummary.summary.excludedAddressCount / coverageSummary.summary.sourceAddressCount * 100)}%) buiten deze scope. Een adres is een huishoudproxy, geen inwonertal; mobiliteitsbeperkingen en toegankelijke routekwaliteit ontbreken.

Een modelsite is een punt in de locatieanalyse; alleen de 11 bestaande HVC-punten zijn al fysieke locaties. Een bak is een afzonderlijke 5.000-litercontainer; een uiteindelijke site kan meer dan één bak nodig hebben. De repo identificeert één bestaande restbak met uniek HVC-ID op elk van de 11 vaste locaties, maar kan eventuele extra co-gelokaliseerde bakken niet representeren.

De modelafstand is de kortste route over een gereconstrueerde historische OSRM-voetgangersgraaf. Korte benen tussen BAG-/containercoordinaten en hun gesnapte netwerkknoop ontbreken. De uitkomst is geschikt voor vergelijking en zoekzones, niet voor civieltechnische maatvoering.`,
    },
    {
      id: "current_state",
      type: "markdown",
      body: `## De 33-locatie plan-/reporeferentie houdt een lange staart

In de actuele repo-referentie liggen 152 adressen (${round(152 / currentDistances.length * 100)}%) boven 275 meter en is het maximum ${currentMetrics.maximum} meter. Het behoudscenario brengt alle gemodelleerde adressen onder 225 meter en verlaagt P95 van ${currentMetrics.p95} naar ${proposalMetrics.p95} meter. De vergelijking is conservatief: de referentiegenerator bewaart alleen routes naar zes hemelsbreed voorgeselecteerde kandidaten en kan daardoor enkele werkelijke minima missen.`,
    },
    { id: "distance_chart", type: "chart", chartId: "distance_comparison" },
    {
      id: "distance_chart_note",
      type: "markdown",
      body: "De verbetering zit vooral in de staart van de verdeling. Dat ondersteunt een maximumafstandsdoelstelling naast het gemiddelde, maar bewijst nog niet dat iedere aanvullende pin uitvoerbaar is.",
    },
    {
      id: "frontier_text",
      type: "markdown",
      body: `## De Pareto-afweging met elf verplichte locaties

De grafiek toont geen exact optimum. De ondergrens is een 2T-packing van resterende vraagpunten plus de elf verplichte locaties; de bovengrens is de beste reproduceerbaar gevonden set. Bij 150 meter ligt het interval op ${scenarioFrontier.find(({ cap_m }) => cap_m === "150 m").ondergrens_totaal}-${scenarioFrontier.find(({ cap_m }) => cap_m === "150 m").gevonden_totaal} locaties, bij 225 meter op ${scenarioFrontier.find(({ cap_m }) => cap_m === "225 m").ondergrens_totaal}-${scenarioFrontier.find(({ cap_m }) => cap_m === "225 m").gevonden_totaal} en bij 275 meter op ${scenarioFrontier.find(({ cap_m }) => cap_m === "275 m").ondergrens_totaal}-${scenarioFrontier.find(({ cap_m }) => cap_m === "275 m").gevonden_totaal}. Dit maakt 225 meter een verdedigbare balans tussen service, uitvoeringsbuffer en ruimtebeslag.`,
      sourceId: "fixed_existing_model",
    },
    { id: "frontier_chart", type: "chart", chartId: "fixed_frontier" },
    {
      id: "frontier_note",
      type: "markdown",
      body: "Een kleinere bovengrens kan met een zwaardere solver nog bestaan. De grafiek mag daarom niet worden gelezen als bewijs dat precies 49 locaties noodzakelijk zijn.",
    },
    {
      id: "locations_intro",
      type: "markdown",
      body: `## Waar de locaties en zoekzones exact liggen

De tabel bevat de 11 exacte bestaande HVC-coordinaten en 38 exacte **analytische ankers**. Voor aanvullingen is ook het eerdere luchtfoto-/BGT-oordeel gekoppeld. Van die aanvullingen hebben ${exactMunicipalCount} een exacte positieve Gemeente Schagen-perceelhit, ${municipalWithin25Count} alleen een positieve hit binnen 25 meter en ${noMunicipalHitWithin25Count} geen gemeentelijke hit binnen 25 meter. Een positieve hit is geen kadastraal bewijs of vergunning.

De bestaande HVC-punten zijn behoudspunten, maar hun actuele assetaantal, operationele status en toegang moeten alsnog door HVC worden bevestigd. WH23 en WH24 tellen fysiek mee maar mogen in het model uitsluitend hun geconfigureerde privé-adressen bedienen. “Dichtstbij (ongecap.)” is de afstandstoewijzing; de twee flowkolommen zijn aparte capaciteitsherverdelingen en minimaliseren de loopafstand niet opnieuw.`,
    },
    { id: "locations_table_block", type: "table", tableId: "locations_table" },
    {
      id: "household_map",
      type: "markdown",
      body: `## Huishoudkaart met dezelfde afstandskleuren als de repo

De interactieve kaart staat als **\`fixed-existing-household-coverage-map.html\`** naast dit rapport; **\`fixed-existing-household-coverage-map.svg\`** is de zelfstandig schaalbare versie. Alle ${modeledCoverage.houses.length.toLocaleString("nl-NL")} adressen zijn afzonderlijk zichtbaar: groen 0-100 m, geel 100-125 m, oranje 125-150 m, rood 150-275 m, donkerrood boven 275 m en grijs zonder route. Bestaande openbare, bestaande private en aanvullende punten hebben ieder een eigen markersymbool. De kaarttabel bevat alle 49 locaties met adresreferentie en status.

De kaart is een modelweergave. Afstanden komen uit het vaste historische routenetwerk en niet uit een nieuwe live deur-tot-containerberekening.`,
      sourceId: "household_map",
    },
    {
      id: "aerial_screen",
      type: "markdown",
      body: `## Luchtfoto en BGT: ${aerialCounts.groen ?? 0} groen, ${aerialCounts.oranje ?? 0} oranje, ${aerialCounts.rood ?? 0} rood

De 38 aanvullingen zijn een subset van de eerder visueel beoordeelde 43 nodes, zodat hun 2026-luchtfoto/BGT-screen herbruikbaar is. Groen betekent alleen “direct technisch inmeten”; oranje vraagt een lokale variant; rood betekent “exact anker verlaten en de zoekzone opnieuw ontwerpen”. Luchtfoto is hier beter dekkend dan KartaView, maar toont geen kabels, fundering, stempeldraagkracht, wortels, hoogte of piekparkeren.

Omdat ${aerialCounts.rood ?? 0} ankers rood zijn, is de set van 49 modelcoordinaten **niet uitvoerbaar verklaard**. Verplaatsingen moeten eerst in een kandidaatpool worden gezet en daarna samen met alle adressen opnieuw worden gerouteerd.`,
      sourceId: "prior_site_screen",
    },
    {
      id: "land_access",
      type: "markdown",
      body: "## Gemeentegrond en HVC-bereikbaarheid blijven harde poorten\n\nSchagen verlangt onder meer een veilige stop, achteruitrijden vermijden, geen hijsen over geparkeerde auto's, minimaal 3 meter afstand tot een woongevel, obstakelvrijheid, onderzoek naar kabels/leidingen en verharding die as- en stempeldruk draagt. Openbare regels uit meerdere HVC-gemeenten ondersteunen als voorlopige kraan-/ledigingsafstand maximaal 5,0 meter van wagen tot containerhart. Exacte lengte, breedte, massa, stempeluitslag en kraandiagram van het Schagen-voertuig zijn niet openbaar gevonden en moeten schriftelijk door HVC worden bevestigd.\n\nDe eerder gebruikte 12,0 x 3,10 meter, 40 ton, 4 meter routehoogte, 12 meter werkhoogte en circa 23 meter buitenste draaicirkel zijn conservatieve openbare vergelijkingsmaten, nadrukkelijk geen HVC-goedkeuring.",
    },
    {
      id: "capacity",
      type: "markdown",
      body: `## Capaciteit: ${capacity100.testedContainerCount} bakken bij 100 adressen, ${capacity75.testedContainerCount} bij 75

Op de vaste set van ${scenario225.totalPhysicalLocationCount} locaties is één bak per locatie voldoende bij maximaal 100 adres-equivalenten: **${capacity100.testedContainerCount} bakken totaal**. Bij maximaal 75 zijn **${capacity75.testedContainerCount} bakken** nodig; de twee extra bakken staan in de modelscreen bij ${capacity75ExtraLabels}. Max-flow bewijst binnen deze vaste afstandsmatrix dat geen kleinere bakmultiset aan de respectieve capaciteitslimiet voldoet.

Dit is geen exploitatieadvies. Een BAG-adres is geen actieve afvalpas en zegt niets over kilogrammen, vulgraad, hoogbouw, seizoenspiek of ledigingsfrequentie. Vraag HVC daarom om een actueel asset-, pas- en vulgraadbestand en herbereken capaciteit op de technisch goedgekeurde bouwpinnen.`,
      sourceId: "fixed_existing_model",
    },
    {
      id: "survey_context",
      type: "markdown",
      body: `## De inwonersenquete ondersteunt een kortere ontwerpafstand

Van ${survey.summary.total} geldige reacties was ${round(survey.summary.noRatio * 100)}% tegen het voorliggende plan. Onder de tegenstemmers noemde ${round(survey.reasonFlags.find(({ label }) => label === "De loopafstand is te ver").ratioOfNo * 100)}% de afstand te groot en ${round(survey.reasonFlags.find(({ label }) => label.includes("ouderen")).ratioOfNo * 100)}% problemen voor ouderen of mensen met een beperking. De steekproef is zelfgeselecteerd en bewijst geen causaliteit, maar bevestigt dat de lange staart bestuurlijk relevant is.`,
      sourceId: "survey",
    },
    { id: "survey_chart", type: "chart", chartId: "survey_agreement" },
    { id: "survey_table_block", type: "table", tableId: "survey_table" },
    {
      id: "implementation",
      type: "markdown",
      body: `## Uitvoeringsroute

1. **Bevestig de vaste assets:** laat HVC alle 11 ID's, aantallen bakken, volumes, operationele status en privétoegang valideren.
2. **Bevries de service-eis:** 225 meter ontwerpmaximum; alleen gemotiveerd maatwerk tot 275 meter. Laat Schagen ook uitleggen hoe de LIOR-straal van 150 meter zich tot werkelijke loopafstand verhoudt.
3. **Maak een goedgekeurde kandidaatpool:** meet de ${aerialCounts.groen ?? 0} groene zones in, ontwerp lokale varianten voor ${aerialCounts.oranje ?? 0} oranje en vervang ${aerialCounts.rood ?? 0} rode; toets eigendom, verkeer, KLIC, bodem, bomen, parkeren en HVC-voertuigmal.
4. **Optimaliseer opnieuw:** routeer alle ${modeledCoverage.houses.length.toLocaleString("nl-NL")} adressen naar uitsluitend goedgekeurde pins, los locatie en capaciteit gezamenlijk op en publiceer iedere uitzondering.
5. **Valideer buitengebied en toegankelijkheid:** leg voor de ${coverageSummary.summary.excludedAddressCount} adressen buiten de kom het inzamelregime vast en voer een aparte rolstoel-/rollatorroute-audit uit.`,
    },
    {
      id: "uncertainty",
      type: "markdown",
      body: `## Wat dit rapport niet kan bewijzen

- ${scenario225.totalPhysicalLocationCount} is een reproduceerbare haalbare bovengrens, geen exact of uniek Pareto-optimum; het modelinterval is ${scenario225.fixedExistingLocationCount + scenario225.additionalSitePackingLowerBound}-${scenario225.totalPhysicalLocationCount} locaties.
- De ${scenario225.additionalSiteCount} aanvullende coordinaten zijn zoekankers. Vooral de ${aerialCounts.rood ?? 0} rode ankers moeten veranderen, waarna de harde 225-metergrens opnieuw moet worden bewezen.
- De openbare perceellaag is een positieve eigendomsscreen, geen kadastraal bewijs of plaatsingsbesluit.
- De routegraaf is gereconstrueerd uit een historische snapshot; snapbenen en toegankelijke-routekenmerken ontbreken.
- De referentie selecteert zes hemelsbreed dichtstbijzijnde containers en overschat daardoor enkele minima.
- De ${capacity100.testedContainerCount}/${capacity75.testedContainerCount} bakken zijn uitsluitend capaciteitsgevoeligheden op de vaste modelmatrix, geen investerings- of ledigingsplan.`,
    },
    {
      id: "further_questions",
      type: "markdown",
      body: "## Open vragen voor gemeente en HVC\n\n- Zijn alle 11 HVC-ID's actief, hoeveel fysieke bakken staan per locatie en blijven ze formeel behouden?\n- Is 225 meter als ontwerpmaximum acceptabel en welke uitzonderingsprocedure geldt tot 275 meter?\n- Geldt daarnaast de LIOR-straal van 150 meter als harde filter?\n- Welke exacte voertuigmal, stempellast, kraanreikwijdte, obstakelvrije hoogte en stopduur gelden in Warmenhuizen?\n- Welke alternatieve bouwpinnen voor de rode zoekankers liggen aantoonbaar op gemeentelijke grond?\n- Hoeveel actieve aansluitingen en kilogrammen restafval horen per zone bij de uiteindelijke pins?",
    },
  ],
};

const artifact = {
  surface: "report",
  manifest,
  snapshot: {
    version: 1,
    generatedAt: GENERATED_AT,
    status: "ready",
    datasets: {
      scenario_frontier: scenarioFrontier,
      distance_bands: distanceBands,
      current_vs_proposal: currentVsProposal,
      locations: locationRows,
      survey_distance: surveyRows,
    },
  },
  sources,
};

writeFileSync(new URL("artifact.json", REPORT_DIR), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({
  headline: {
    fixedExistingLocations: scenario225.fixedExistingLocationCount,
    additionalSearchAnchors: scenario225.additionalSiteCount,
    totalPhysicalLocations: scenario225.totalPhysicalLocationCount,
    modelInterval: [
      scenario225.fixedExistingLocationCount + scenario225.additionalSitePackingLowerBound,
      scenario225.totalPhysicalLocationCount,
    ],
    capacityAt100: capacity100.testedContainerCount,
    capacityAt75: capacity75.testedContainerCount,
    aerialCounts,
  },
  blocks: manifest.blocks.length,
  charts: manifest.charts.length,
  tables: manifest.tables.length,
  rows: Object.fromEntries(Object.entries(artifact.snapshot.datasets).map(([key, rows]) => [key, rows.length])),
}, null, 2));
