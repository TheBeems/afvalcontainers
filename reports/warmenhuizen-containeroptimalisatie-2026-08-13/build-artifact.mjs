#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const GENERATED_AT = "2026-08-13T18:00:00+02:00";
const TITLE = "Warmenhuizen: een beter netwerk van restafvalcontainers";

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

const recommendation = readJson(new URL("recommended-locations.json", REPORT_DIR));
const capacity = readJson(new URL("capacitated-solution.json", REPORT_DIR));
const coverage = readJson(new URL("data/places/warmenhuizen/coverage-summary.json", REPO_DIR));
const survey = readJson(new URL("data/places/warmenhuizen/survey-analysis-2026-07-02.json", REPO_DIR));
const aerialNorth = readJson(new URL("aerial-assessment-sites-01-22.json", REPORT_DIR));
const aerialSouth = readJson(new URL("aerial-assessment-sites-23-43.json", REPORT_DIR));
const capacity100 = capacity.scenarios.find(({ capacityPerContainer }) => capacityPerContainer === 100);
const capacity75 = capacity.scenarios.find(({ capacityPerContainer }) => capacityPerContainer === 75);
const aerialAssessments = new Map([
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
const aerialCounts = [...aerialAssessments.values()].reduce((counts, { rating }) => ({
  ...counts,
  [rating]: (counts[rating] ?? 0) + 1,
}), {});

const sources = [
  {
    id: "current_coverage",
    label: "Actuele Warmenhuizen-loopafstandsanalyse",
    path: "data/places/warmenhuizen/coverage-summary.json",
    query: {
      description: "Gegenereerde nulmeting voor 2.579 BAG-adressen met woonfunctie binnen de bebouwde kom.",
      executed_at: coverage.generatedAt,
      filters: ["woonfunctie in BAG gebruiksdoel", "woonplaats Warmenhuizen", "binnen bebouwde-kompolygoon"],
      metric_definitions: [
        "Loopafstand: opgeslagen OSRM-voetgangersroute naar de beste van zes hemelsbreed voorgeselecteerde containers.",
        "Huidig netwerk: 33 locaties met rest- of semi-restcapaciteit in de repository.",
      ],
    },
  },
  {
    id: "distance_model",
    label: "225-meter netwerklocatiemodel",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/route-graph-optimization.json",
    query: {
      description: "Set-cover-model op een gereconstrueerde voetgangersgraaf uit opgeslagen OSRM-routegeometrieën; kandidaten zijn netwerkknooppunten.",
      executed_at: GENERATED_AT,
      filters: ["2.579 actuele woonfunctie-adressen", "hard ontwerpplafond 225 meter", "afstand eerst; terreinrestricties als tweede screen"],
      metric_definitions: [
        "Gevonden bovengrens: aantal sites in een uitvoerbare greedy-plus-redundantie-oplossing; geen bewijs van het wiskundig minimum.",
        "Ondergrens: greedy 2T-packing van vraagpunten die niet door één site binnen T meter kunnen worden bediend.",
        "Modelafstand bevat netwerksnapfouten; vier referentiepunten hebben meer dan 50 meter BAG-naar-netwerksnap.",
      ],
    },
  },
  {
    id: "ownership_screen",
    label: "Provincie Noord-Holland BRK-percelen, grootgrondgebruik",
    href: "https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/distance-optimal-sites-screened.json",
    query: {
      description: "Punt- en 25-meterbufferscreen op naam en aard zakelijk recht; maandelijkse openbare indicatielaag.",
      executed_at: GENERATED_AT,
      filters: ["naam = Gemeente Schagen", "aard zakelijk recht gerapporteerd maar niet juridisch geverifieerd"],
      metric_definitions: ["Positieve hit betekent kansrijke openbare grond; geen kadastraal eigendomsbewijs of plaatsingsbesluit."],
    },
  },
  {
    id: "osm_access",
    label: "OpenStreetMap-wegennet Warmenhuizen",
    href: "https://www.openstreetmap.org/copyright",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/osm-highways.json",
    query: {
      description: "Overpass-snapshot van highway-ways binnen Warmenhuizen, gebruikt voor een grove openbare voertuigroutefilter.",
      executed_at: GENERATED_AT,
      filters: ["bbox 52.710,4.724,52.733,4.754", "highway=*"],
      metric_definitions: ["Voertuigroute binnen 8 meter is alleen een positieve desktop-screen; geen HVC-draaicirkel-, opstel- of kraantoets."],
    },
  },
  {
    id: "schagen_policy",
    label: "Gemeente Schagen: plaatsing ondergrondse restafvalcontainers Warmenhuizen",
    href: "https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen",
    query: {
      description: "Actuele projectinformatie; circa 275 meter loopafstand, voorlopige locaties en planning.",
      executed_at: "2026-08-13T12:00:00+02:00",
    },
  },
  {
    id: "schagen_lioR",
    label: "Gemeente Schagen LIOR, deel 2",
    href: "https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf",
    query: {
      description: "Technische en ruimtelijke plaatsingscriteria voor ondergrondse containers in de openbare ruimte.",
      executed_at: "2026-08-13T12:00:00+02:00",
      metric_definitions: ["Genoemd zijn onder meer veilige stop, niet achteruitrijden, geen obstakels, minimaal 3 meter van de woongevel, draagkracht en kabels/leidingen."],
    },
  },
  {
    id: "schagen_hoep_decision",
    label: "Aanwijzingsbesluit ondergrondse containers De Hoep",
    href: "https://lokaleregelgeving.overheid.nl/CVDR757179/1",
    query: {
      description: "Actueel Schagen-besluit waarin ongeveer 275 meter werkelijke loopafstand en circa 75 tot 100 aansluitingen per container als criteria staan.",
      executed_at: "2026-08-13T12:00:00+02:00",
    },
  },
  {
    id: "council_of_state",
    label: "Raad van State 2021:1194",
    href: "https://www.raadvanstate.nl/uitspraken/@124982/202101193-1-r1-en-202101193-2-r1/",
    query: {
      description: "Uitspraak waaruit volgt dat geen landelijke wettelijke maximale loopafstand voor een ondergrondse container geldt.",
      executed_at: "2026-08-13T12:00:00+02:00",
    },
  },
  {
    id: "survey",
    label: "Inwonersenquete Warmenhuizen, 2 juli 2026",
    path: "data/places/warmenhuizen/survey-analysis-2026-07-02.json",
    query: {
      description: "Geanonimiseerde analyse van online en papieren inzendingen.",
      executed_at: "2026-07-02T23:59:59+02:00",
      filters: ["809 geldige reacties", "17 duplicaten verwijderd", "3 records in quarantaine"],
      metric_definitions: ["Zelfselectieonderzoek; de afstandsstraatdata stamt van voor WH35 en is niet causaal."],
    },
  },
  {
    id: "hvc_information",
    label: "HVC: ondergrondse restafvalcontainer",
    href: "https://www.hvcgroep.nl/ondergrondse-restafval",
    query: {
      description: "Publieke gebruikersinformatie; de specifieke technische voertuigleidraad is niet openbaar aangetroffen.",
      executed_at: "2026-08-13T12:00:00+02:00",
    },
  },
  {
    id: "klic",
    label: "Kadaster KLIC-orientatieverzoek",
    href: "https://www.kadaster.nl/zakelijk/producten/graafwerk/orientatieverzoek",
    query: {
      description: "Benodigde vervolgstap voor kabels-en-leidingenscreening voordat een locatie uitvoerbaar kan worden verklaard.",
      executed_at: "2026-08-13T12:00:00+02:00",
    },
  },
  {
    id: "aerial_bgt",
    label: "PDOK Luchtfoto 2026 en Basisregistratie Grootschalige Topografie",
    href: "https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/aerial-bgt-screen.json",
  },
  {
    id: "enkhuizen_hvc_criteria",
    label: "Gemeente Enkhuizen: beleidsregels ondergrondse containers",
    href: "https://lokaleregelgeving.overheid.nl/CVDR714956/1",
  },
  {
    id: "lelystad_hvc_criteria",
    label: "Gemeente Lelystad: beleidsregels ondergrondse containers",
    href: "https://lokaleregelgeving.overheid.nl/CVDR755808",
  },
  {
    id: "alkmaar_hvc_decision",
    label: "Gemeente Alkmaar: locatiebesluit in afstemming met HVC",
    href: "https://zoek.officielebekendmakingen.nl/gmb-2025-108099.html",
  },
  {
    id: "den_helder_hvc_criteria",
    label: "Gemeente Den Helder: LIOR 2026-2027 met HVC-ledigingscriteria",
    href: "https://zoek.officielebekendmakingen.nl/gmb-2025-547321.html",
  },
  {
    id: "vehicle_comparison_nuenen",
    label: "Gemeente Nuenen: openbare vergelijkingsmaten, niet HVC",
    href: "https://zoek.officielebekendmakingen.nl/gmb-2023-164417.html",
  },
  {
    id: "vehicle_comparison_echt_susteren",
    label: "Gemeente Echt-Susteren: conservatieve openbare voertuigmal, niet HVC",
    href: "https://zoek.officielebekendmakingen.nl/gmb-2025-544827.html",
  },
  {
    id: "capacity_model",
    label: "Capaciteitsmodel voor de vaste 43 afstandsankers",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/capacitated-solution.json",
  },
  {
    id: "aerial_assessment_north",
    label: "Luchtfoto/BGT-beoordeling sites 1-22",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/aerial-assessment-sites-01-22.json",
  },
  {
    id: "aerial_assessment_south",
    label: "Luchtfoto/BGT-beoordeling sites 23-43",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/aerial-assessment-sites-23-43.json",
  },
  {
    id: "hvc_requirements_note",
    label: "Bronnotitie HVC-ledigingseisen en vergelijkingsmaten",
    path: "reports/warmenhuizen-containeroptimalisatie-2026-08-13/hvc-vehicle-requirements.md",
  },
];

// These inputs are JSON/TSV/web documents, not SQL query results. Keeping only
// concrete file paths and URLs avoids inventing SQL provenance in the portable artifact.
const canonicalSources = sources.map(({ query: _query, ...source }) => source);

const scenarioFrontier = [
  { cap_m: "100 m", lower_bound_sites: 133, found_sites: 180 },
  { cap_m: "125 m", lower_bound_sites: 89, found_sites: 116 },
  { cap_m: "150 m", lower_bound_sites: 60, found_sites: 86 },
  { cap_m: "175 m", lower_bound_sites: 46, found_sites: 68 },
  { cap_m: "200 m", lower_bound_sites: 35, found_sites: 52 },
  { cap_m: "225 m", lower_bound_sites: 31, found_sites: 43 },
  { cap_m: "250 m", lower_bound_sites: 26, found_sites: 39 },
  { cap_m: "275 m", lower_bound_sites: 22, found_sites: 31 },
];

const distanceBands = [
  { band: "0-100 m", current: 943, proposal: 963 },
  { band: "100-150 m", current: 681, proposal: 836 },
  { band: "150-200 m", current: 473, proposal: 638 },
  { band: "200-225 m", current: 113, proposal: 142 },
  { band: "225-275 m", current: 217, proposal: 0 },
  { band: ">275 m", current: 152, proposal: 0 },
];

const currentVsProposal = [
  { metric: "Gemiddeld", referentie_m: 137.3, voorstel_m: 117.5 },
  { metric: "P95", referentie_m: 283.0, voorstel_m: 201.8 },
  { metric: "Maximum", referentie_m: 447.5, voorstel_m: 224.5 },
];

const siteRows = recommendation.sites.map((site) => {
  const publicVehicle = site.nearestPublicVehicleHighway;
  const aerial = aerialAssessments.get(site.site);
  return {
    site: site.site,
    zoekzone: `${site.street} (nabij ${site.referenceAddress})`,
    latitude: site.latitude,
    longitude: site.longitude,
    adressen: site.assignedAddresses,
    bakken_bij_100: site.recommendedCapacityUnitsAt100,
    bakken_bij_75: site.recommendedCapacityUnitsAt75,
    gemiddelde_m: site.meanWalkingDistanceM,
    p95_m: site.p95WalkingDistanceM,
    maximum_m: site.maxWalkingDistanceM,
    gemeentegrond: site.exactMunicipal ? "exacte hit" : (site.municipalParcelWithin25M ? "binnen 25 m" : "geen hit binnen 25 m"),
    perceel: site.exactMunicipalParcel ?? "-",
    voertuigroute: `${publicVehicle.highway ?? "onbekend"}${publicVehicle.name ? `, ${publicVehicle.name}` : ""} (${publicVehicle.distanceM} m)`,
    luchtfoto_oordeel: aerial?.rating ?? "niet beoordeeld",
    lokaal_vervolg: aerial?.recommendation ?? "-",
    eerste_screen: site.screeningDecision,
    modelwaarschuwing: site.warnings.join("; ") || "-",
  };
});

const surveyRows = survey.distanceBands.map((band) => ({
  afstand: band.label,
  reacties: band.total,
  instemming_pct: Number((band.yesRatio * 100).toFixed(1)),
  afwijzing_pct: Number((band.noRatio * 100).toFixed(1)),
}));
const siteAdviceMarkdown = recommendation.sites.map((site) => {
  const aerial = aerialAssessments.get(site.site);
  const ownership = site.exactMunicipal
    ? "positieve gemeentelijke perceelhit"
    : (site.municipalParcelWithin25M ? "gemeentegrond binnen 25 m" : "geen gemeentegrond-hit binnen 25 m");
  return `- **${site.site}. ${site.street} — ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)} — ${aerial?.rating ?? "onbeoordeeld"} — ${site.recommendedCapacityUnitsAt100} bak(ken) bij 100:** ${ownership}. ${aerial?.recommendation ?? "Geen luchtfoto-advies beschikbaar."}`;
}).join("\n");

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

const manifest = {
  version: 1,
  surface: "report",
  title: TITLE,
  description: "Advies over maximale loopafstand, aantal locaties, exacte analytische zoekpunten en uitvoerbaarheidsvoorwaarden.",
  generatedAt: GENERATED_AT,
  charts: [
    {
      id: "distance_comparison",
      title: "Loopafstand in de 33-locatiereferentie en 225-meteronderzoeksvariant",
      subtitle: "Gemiddelde, P95 en maximum in meters; 2.579 woonfunctie-adressen.",
      type: "bar",
      dataset: "current_vs_proposal",
      source: inlineSqlSource(
        "distance_comparison_sql",
        "Nulmeting versus 225-meteronderzoeksvariant",
        currentVsProposal,
        ["metric", "referentie_m", "voorstel_m"],
        "Begrensde chartdataset uit de nulmeting en de gereconstrueerde routegraaf.",
      ),
      encodings: {
        x: { field: "metric", type: "nominal", label: "Maatstaf" },
        y: { fields: ["referentie_m", "voorstel_m"], type: "quantitative", label: "Loopafstand (m)" },
        tooltip: [
          { field: "referentie_m", type: "quantitative", label: "33-locatiereferentie", format: "number" },
          { field: "voorstel_m", type: "quantitative", label: "Voorstel", format: "number" },
        ],
      },
    },
    {
      id: "pareto_frontier",
      title: "Afstandsplafond en benodigd aantal sites",
      subtitle: "Geldige ondergrens en gevonden uitvoerbare bovengrens; een exact minimum is niet bewezen.",
      type: "bar",
      dataset: "scenario_frontier",
      source: inlineSqlSource(
        "pareto_frontier_sql",
        "Reproduceerbare grenzen van het routegraafmodel",
        scenarioFrontier,
        ["cap_m", "lower_bound_sites", "found_sites"],
        "Scenarioresultaten van optimize-route-graph.mjs.",
      ),
      encodings: {
        x: { field: "cap_m", type: "nominal", label: "Maximale modelafstand" },
        y: { fields: ["lower_bound_sites", "found_sites"], type: "quantitative", label: "Aantal sites" },
        tooltip: [
          { field: "lower_bound_sites", type: "quantitative", label: "Ondergrens" },
          { field: "found_sites", type: "quantitative", label: "Gevonden oplossing" },
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
  sources: canonicalSources,
  blocks: [
    { id: "title", type: "markdown", body: `# ${TITLE}` },
    {
      id: "executive_summary",
      type: "markdown",
      body: `## Executive Summary

- **Advies:** ontwerp op **maximaal 225 meter werkelijke loopafstand** en gebruik **275 meter uitsluitend als gemotiveerd uitzonderingsplafond**. De gemeente hanteert nu circa 275 meter; landelijk bestaat geen vaste wettelijke maximumafstand.
- **Afstandsoptimale onderzoeksvariant:** **43 analytische zoekankers**. Zonder fysieke terreinrestricties komt het model uit op gemiddeld **117,5 m**, P95 **201,8 m** en maximaal **224,5 m**; in de 33-locatie plan-/reporeferentie zijn dat 137,3 m, circa 283,0 m en 447,5 m.
- **Fysieke haalbaarheid nog niet bewezen:** de officiële luchtfoto 2026 en BGT leveren ${aerialCounts.groen} groene, ${aerialCounts.oranje} oranje en ${aerialCounts.rood} rode ankers op. Vooral de rode punten moeten worden verplaatst en daarna opnieuw gerouteerd; de 43 punten zijn dus geen bouwbesluit.
- **Capaciteit van de vaste modelvariant:** een capaciteitsmodel vindt **45 bakken bij maximaal 100 adres-equivalenten per bak** en **48 bij 75**. Dit geldt uitsluitend als de 43 ankers bruikbaar blijven; actieve passen, tonnage en vulgraad ontbreken.
- **Eerlijk antwoord op 'exact waar':** openbare gegevens kunnen exacte onderzoekscoordinaten en lokale verschuifrichtingen geven, maar geen bouwrijpe pin. Daarvoor ontbreken KLIC/proefsleuven, draagkracht, wortels, actuele parkeerdruk en de maatvaste HVC-voertuig- en kraantoets. Dit is bovendien een adresgewogen analyse binnen de bebouwde kom, geen bewezen optimum voor iedere individuele inwoner.`,
    },
    {
      id: "decision",
      type: "markdown",
      body: "## Het besluit dat ik zou nemen\n\nIk zou het netwerk lexicografisch ontwerpen: **(1) niemand boven de afgesproken maximumafstand, (2) daarna P95 en gemiddelde zo laag mogelijk, (3) daarna zo weinig mogelijk sites en bakken, maar alleen uit fysiek haalbare pins op openbare grond die HVC veilig kan legen**. De 43-sitevariant is een afstands-Pareto-kandidaat, nog geen integraal Pareto-optimum.\n\n**Waarom 225 meter?** Bij 150 meter ligt de reproduceerbare ondergrens al op 60 sites en vond de heuristiek 86 sites. Bij 275 meter daalt de gevonden oplossing naar 31 sites, maar verdwijnt de uitvoeringsbuffer. Op 225 meter ligt de bewezen modelondergrens op 31 en is een oplossing met 43 sites gevonden. De 50-meterbuffer tot de bestuurlijke 275-metergrens kan kleine inpassingsverschuivingen opvangen, niet automatisch de 55-120 meter die enkele rode luchtfotoscreens vragen.",
    },
    {
      id: "definitions",
      type: "markdown",
      body: "## Wat is precies gemeten?\n\nDe vraagpopulatie bestaat uit **2.579 BAG-adressen met woonfunctie binnen de gehanteerde bebouwde-komgrens**. Van de 2.882 woonfunctie-adressen in de BAG-woonplaats vallen **303 adressen (10,5%) buiten die grens**. Voor hen moet de gemeente het inzamelregime of individueel maatwerk apart vastleggen. De analyse weegt adressen gelijk; aantallen inwoners per adres, mobiliteitsbeperkingen en toegankelijke routekwaliteit ontbreken.\n\nEen site is in het model een punt op het voetgangersnetwerk; de routeafstand loopt over dat netwerk, niet hemelsbreed. De referentie gebruikt 33 rest-/semi-restlocaties uit de repo: 11 zijn als bestaand en 22 als nieuw gemarkeerd. Dit is dus een gepubliceerde plan-/repovariant, niet zonder meer de feitelijke huidige straatopstelling. Per adres is de beste route uit zes hemelsbreed voorgeselecteerde kandidaten bewaard.\n\nEen **site** is een plek; een **fysieke bak** is een 5.000-litercontainer op die plek. Eén site kan meer dan één bak nodig hebben. De openbare bronnen noemen circa 75-100 aansluitingen per bak, maar de repo bevat adressen en geen gevalideerde HVC-pas-, vulgraad- of tonnagegegevens. Daarom is het locatieadvies sterker dan de capaciteitsraming.",
    },
    {
      id: "current_state",
      type: "markdown",
      body: "## De 33-locatie plan-/repovariant laat een lange staart bestaan\n\nDe gemiddelde afstand van 137,3 meter oogt redelijk, maar maskeert de verdeling: **152 adressen (5,9%) liggen boven 275 meter**, P95 ligt rond 283 meter en het maximum is 447,5 meter. De afstandsoptimale 225-meteronderzoeksvariant verlaagt vooral deze staart; het gemiddelde verbetert met circa 20 meter, maar het maximum halveert bijna. Dat is precies wat een eerlijke maximumafstandsdoelstelling hoort te doen.",
    },
    { id: "distance_chart", type: "chart", chartId: "distance_comparison" },
    {
      id: "frontier_text",
      type: "markdown",
      body: "## De Pareto-afweging is steil onder 200 meter\n\nDe grafiek toont geen enkel exact optimum, maar een **onder- en bovengrens** voor ieder afstandsplafond. De brede sprong van 43 gevonden sites bij 225 meter naar 86 bij 150 meter maakt een universele 150-meternorm ruimtelijk en financieel zwaar. Andersom levert 275 meter twaalf sites minder op, maar benut die variant de bestuurlijke grens volledig en laat zij nauwelijks ruimte om een modelpunt naar een uitvoerbare plek te schuiven.",
      sourceId: "distance_model",
    },
    { id: "frontier_chart", type: "chart", chartId: "pareto_frontier" },
    {
      id: "locations_intro",
      type: "markdown",
      body: `## Waar de 43 zoekzones liggen

Het overzicht geeft de **exacte afstandsankercoordinaten**, plus het lokale verschuifadvies uit luchtfoto/BGT. Het kruis ligt vaak op het midden van een route en is daarom uitdrukkelijk geen graafpin. De visuele triage is: **${aerialCounts.groen} groen**, **${aerialCounts.oranje} oranje** en **${aerialCounts.rood} rood**.

Groen betekent alleen “direct technisch inmeten”; oranje vraagt een beperkte lokale variant; rood betekent “exacte pin verlaten en de zoekzone opnieuw ontwerpen”. Tien ankers liggen binnen 50 meter van een reeds gepubliceerde gemeentelijke restlocatie. Een bestaande of conceptpin heeft daar praktisch voorrang als een nieuwe volledige routering de 225-meterdekking bevestigt.`,
    },
    {
      id: "site_advice",
      type: "markdown",
      body: `## Lokaal verschuif- en vervolgadvies per zoekzone\n\n${siteAdviceMarkdown}`,
    },
    {
      id: "land_access",
      type: "markdown",
      body: "## Gemeentegrond en HVC-bereikbaarheid zijn harde poorten\n\nEen locatie gaat alleen door als zij op gemeentelijke openbare ruimte ligt, minimaal 3 meter van een woongevel blijft, zonder hijsen over geparkeerde auto's kan worden geleegd en veilig bereikbaar is zonder achteruitrijden. Schagen verlangt bovendien obstakelvrijheid, onderzoek naar kabels/leidingen en verharding die as- en stempeldruk draagt. De perceelscreen vindt **40 exacte positieve Gemeente Schagen-hits** en bij een 41e gemeentegrond binnen 25 meter, maar dit is geen juridische eigendomsverklaring.\n\nOpenbare regels uit HVC-gemeenten Enkhuizen, Lelystad, Den Helder en Alkmaar ondersteunen als voorlopige ledigingstoets **maximaal 5,0 meter van de zijkant van de wagen tot het containerhart**. Exacte HVC-maten zijn niet openbaar gevonden. Voor de luchtfotoscreen is daarom slechts een conservatieve, expliciet niet-HVC voertuigmal gebruikt: 12,0 bij 3,10 meter, 40 ton, 4 meter routehoogte, 12 meter werkhoogte en circa 23 meter buitenste draaicirkel. HVC Schagen moet voertuigmal, kraandiagram en stempeldruk schriftelijk bevestigen.",
    },
    {
      id: "aerial_screen",
      type: "markdown",
      body: "## Luchtfoto is een uitsluitingsscreen, geen goedkeuring\n\nDe 2026-orthofoto en actuele BGT zijn per anker bekeken op rijbaan/voetpad, parkeren, bomen, water, gevels en een plausibele opstelroute. Ze zijn veel bruikbaarder dan KartaView, waarvan slechts drie foto's werkelijk binnen 50 meter lagen en de beelden uit 2017 stamden. Luchtfoto's tonen echter geen kabels, funderingsopbouw, stempeldraagkracht, boomwortels, piekparkeren of hoogte. Daarom kan groen nooit meer betekenen dan “kansrijk voor inmeten”.",
    },
    {
      id: "capacity",
      type: "markdown",
      body: `## Capaciteit: 45 bakken in de 100-adressenscreen, 48 bij 75

Een capaciteitsgebonden herverdeling binnen 225 meter bedient alle 2.579 adressen met **${capacity100.containers} bakken** als elke bak maximaal 100 adres-equivalenten krijgt. Site 1 (Zigt) en site 9 (Poolster) krijgen dan twee bakken; de overige ankers één. Met maximaal 75 zijn **${capacity75.containers} bakken** gevonden: drie bij site 1 en twee bij sites 4, 9 en 10.

Dit is exact voor de **vaste modelmatrix**, niet voor de uiteindelijke openbare bouwpinnen. Een BAG-adres is bovendien geen actieve afvalpas en zegt niets over kilogrammen, seizoenspiek of ledigingsfrequentie. Gebruik daarom 45 als modelraming en 48 als gevoeligheidsscenario; neem pas een investeringsbesluit na een herberekening met HVC-pas- en vulgraaddata.`,
      sourceId: "capacity_model",
    },
    {
      id: "survey_context",
      type: "markdown",
      body: `## De inwonersreacties ondersteunen een kortere ontwerpafstand\n\nVan ${survey.summary.total} geldige reacties was ${(survey.summary.noRatio * 100).toFixed(1)}% tegen het voorliggende plan. Onder de tegenstemmers noemde ${(survey.reasonFlags.find(({ label }) => label === "De loopafstand is te ver").ratioOfNo * 100).toFixed(1)}% de afstand te groot en ${(survey.reasonFlags.find(({ label }) => label.includes("ouderen")).ratioOfNo * 100).toFixed(1)}% problemen voor ouderen of mensen met een beperking. Instemming daalde van 31,2% bij maximaal 100 meter naar 4,3% boven 275 meter.\n\nDit bewijst niet dat kortere afstand instemming veroorzaakt: de steekproef is zelfgeselecteerd en de straatindeling is ouder dan de actuele repo-analyse. Wel bevestigt zij dat juist de lange staart bestuurlijk gevoelig is en dat alleen sturen op gemiddelde afstand onvoldoende is.`,
      sourceId: "survey",
    },
    { id: "survey_chart", type: "chart", chartId: "survey_agreement" },
    { id: "survey_table_block", type: "table", tableId: "survey_table" },
    {
      id: "implementation",
      type: "markdown",
      body: "## Uitvoeringsroute in vier beslismomenten\n\n1. **Bevries de service-eis:** 225 meter ontwerpmaximum; alleen gemotiveerd maatwerk tot 275 meter. Laat Schagen schriftelijk uitleggen hoe de LIOR-straal van 150 meter zich tot 275 meter werkelijke loopafstand verhoudt.\n2. **Maak een echte bouwpinset:** meet eerst de 8 groene zones in; ontwerp varianten voor de 14 oranje en vervang de 21 rode. Laat eigendom, beheer, verkeerskunde en HVC iedere pin aftekenen met een schaalvaste voertuigmal.\n3. **Toets ondergrond en capaciteit:** KLIC, proefsleuven, bodem/draagkracht, wortels, parkeer- en groeneffect, actieve passen, kilogrammen en ledigingsfrequentie.\n4. **Optimaliseer opnieuw op uitsluitend goedgekeurde pins:** routeer alle 2.579 woonfunctie-adressen opnieuw, los locatie en capaciteit gezamenlijk op en publiceer per adres de kortste veilige route en elke gemotiveerde uitzondering.",
    },
    {
      id: "uncertainty",
      type: "markdown",
      body: "## Wat dit rapport niet kan bewijzen\n\n- De 43-siteoplossing is **een reproduceerbare afstands-Pareto-kandidaat**, geen integraal of uniek optimum; bij 225 meter ligt het modelminimum tussen 31 en 43 sites.\n- Omdat 21 ankers visueel rood zijn en soms 55-120 meter moeten opschuiven, zijn 43 locaties en het 225-metermaximum fysiek nog niet bewezen.\n- Openbare perceelinformatie is een positieve eigendomsscreen, geen juridisch kadastraal bewijs of plaatsingstoestemming.\n- Vier modelpunten hebben een BAG-naar-netwerksnap groter dan 50 meter; hun lokale afstand is onbetrouwbaar.\n- De nulmeting selecteert zes hemelsbreed dichtstbijzijnde containers en overschat daardoor enkele werkelijke minima; private Angelaparklocaties zijn geen algemeen openbaar aanbod.\n- Zonder actieve aansluitingen en afvalvolume zijn 45 en 48 modeluitkomsten, geen definitief exploitatieaantal.",
    },
    {
      id: "further_questions",
      type: "markdown",
      body: "## Open vragen voor het college en HVC\n\n- Is 225 meter als ontwerpmaximum bestuurlijk acceptabel en welke uitzonderingsprocedure geldt tot 275 meter?\n- Geldt naast 275 meter werkelijke loopafstand ook de LIOR-straal van 150 meter als harde voorwaarde?\n- Welke voertuigafmetingen, stempellasten, kraanreikwijdte, obstakelvrije hoogte en toegestane stopduur hanteert HVC in Warmenhuizen?\n- Hoeveel actieve aansluitingen en hoeveel kilogram restafval per week horen werkelijk bij iedere zoekzone?\n- Welke fysiek goedgekeurde bouwpinnen vervangen de 21 rode ankers, in het bijzonder De Fuik 14 en Veilingweg 70D waar geen gemeentelijke perceelhit binnen 25 meter is gevonden?",
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
      recommended_sites: siteRows,
      survey_distance: surveyRows,
    },
  },
  sources: canonicalSources,
};

writeFileSync(new URL("artifact.json", REPORT_DIR), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ blocks: manifest.blocks.length, charts: manifest.charts.length, tables: manifest.tables.length, rows: Object.fromEntries(Object.entries(artifact.snapshot.datasets).map(([key, rows]) => [key, rows.length])) }, null, 2));
