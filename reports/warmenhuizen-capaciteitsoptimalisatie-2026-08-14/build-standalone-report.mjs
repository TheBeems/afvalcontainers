#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('capacity-plan.json', reportDirectory), 'utf8'));
const mapSvg = readFileSync(new URL('overview-map.svg', reportDirectory), 'utf8').replace(/^<\?xml[^>]*>\s*/u, '');
const outputUrl = new URL('warmenhuizen-capaciteitsplan.html', reportDirectory);

const recommended = plan.recommendedScenario;
const municipal = plan.municipalConceptComparison;
const recommendedDistance = recommended.capacityBalancedDistance;
const municipalDistance = municipal.capacityBalancedDistance;
const capacityComparison = plan.comparison.capacityBalanced;
const nearestComparison = plan.comparison.nearestSiteAccessSensitivity;
const baseline = plan.decisionBaseline;
const findings = plan.locationChangeFindings;
const newLocations = plan.locations.filter(({ kind }) => kind === 'new');
const existingLocations = plan.locations.filter(({ kind }) => kind === 'existing');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ratingLabel(rating) {
  const labels = {
    green: 'groen',
    orange: 'oranje',
    'green-fixed': 'groen (bestaand)',
    'orange-fixed': 'oranje (bestaand)',
    'red-fixed': 'rood (bestaand)',
    'private-fixed': 'privé (bestaand)',
    'not-screened': 'exacte pin niet gescreend'
  };
  return labels[rating] ?? rating;
}

function ratingClass(rating) {
  if (rating.startsWith('green')) return 'green';
  if (rating.startsWith('private')) return 'private';
  if (rating.endsWith('fixed')) return 'fixed';
  return 'orange';
}

function sourceLabel(location) {
  if (location.accessScope === 'private') return 'bestaand privé';
  if (location.sourceType === 'municipal-concept') return 'gemeentelijk concept';
  if (location.kind === 'new') return 'eigen zoekanker';
  return 'bestaand openbaar';
}

function comparisonChart() {
  const rows = [
    { label: 'Gemiddeld', municipal: municipalDistance.averageWalkingDistanceM, recommended: recommendedDistance.averageWalkingDistanceM },
    { label: 'P95', municipal: municipalDistance.p95WalkingDistanceM, recommended: recommendedDistance.p95WalkingDistanceM }
  ];
  const width = 760;
  const plot = { x: 90, y: 35, width: 610, height: 220 };
  const maximum = Math.max(...rows.flatMap(({ municipal: left, recommended: right }) => [left, right])) * 1.12;
  const bars = rows.map((row, index) => {
    const groupX = plot.x + index * 300 + 70;
    const municipalHeight = row.municipal / maximum * plot.height;
    const recommendedHeight = row.recommended / maximum * plot.height;
    return `
      <rect x="${groupX}" y="${plot.y + plot.height - municipalHeight}" width="72" height="${municipalHeight}" rx="5" fill="#94a3b8"/>
      <rect x="${groupX + 88}" y="${plot.y + plot.height - recommendedHeight}" width="72" height="${recommendedHeight}" rx="5" fill="#2563eb"/>
      <text x="${groupX + 36}" y="${plot.y + plot.height - municipalHeight - 9}" text-anchor="middle">${formatNumber(row.municipal, 1)} m</text>
      <text x="${groupX + 124}" y="${plot.y + plot.height - recommendedHeight - 9}" text-anchor="middle">${formatNumber(row.recommended, 1)} m</text>
      <text x="${groupX + 80}" y="${plot.y + plot.height + 28}" text-anchor="middle" font-weight="700">${row.label}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} 330" role="img" aria-label="Capaciteitsgebalanceerde vergelijking van gemiddelde en P95-modelafstand">
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#cbd5e1"/>
${bars}
    <rect x="250" y="300" width="16" height="10" rx="2" fill="#94a3b8"/><text x="274" y="309">Gemeente</text>
    <rect x="390" y="300" width="16" height="10" rx="2" fill="#2563eb"/><text x="414" y="309">Advies</text>
  </svg>`;
}

function distanceBandChart() {
  const bands = [
    ['0–100', 'within_100', '#15803d'],
    ['>100–125', 'between_100_125', '#eab308'],
    ['>125–150', 'between_125_150', '#f97316'],
    ['>150–275', 'between_150_275', '#dc2626'],
    ['>275', 'over_275', '#7f1d1d']
  ];
  const maximum = Math.max(...bands.flatMap(([, key]) => [municipalDistance.distanceBands[key], recommendedDistance.distanceBands[key]]));
  const rows = bands.map(([label, key, color], index) => {
    const y = 45 + index * 58;
    const municipalValue = municipalDistance.distanceBands[key];
    const recommendedValue = recommendedDistance.distanceBands[key];
    return `<text x="86" y="${y + 7}" text-anchor="end" font-weight="700">${label} m</text>
      <rect x="103" y="${y - 15}" width="${municipalValue / maximum * 500}" height="18" rx="3" fill="#cbd5e1"/>
      <rect x="103" y="${y + 7}" width="${recommendedValue / maximum * 500}" height="18" rx="3" fill="${color}"/>
      <text x="${118 + municipalValue / maximum * 500}" y="${y - 1}">${formatNumber(municipalValue)}</text>
      <text x="${118 + recommendedValue / maximum * 500}" y="${y + 22}">${formatNumber(recommendedValue)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 800 365" role="img" aria-label="Capaciteitsgebalanceerde afstandsbanden van gemeente en advies">
    ${rows}
    <rect x="235" y="340" width="16" height="10" rx="2" fill="#cbd5e1"/><text x="259" y="349">Gemeente</text>
    <rect x="385" y="340" width="16" height="10" rx="2" fill="#2563eb"/><text x="409" y="349">Advies, in repo-bandkleur</text>
  </svg>`;
}

function focusAreaChart() {
  const rows = [
    { id: 'deFuik', label: 'De Fuik' },
    { id: 'dorpsFabriekEiland', label: "Dorps-/Fabrieksstraat/'t Eiland" },
    { id: 'eastNeighbourhood', label: 'Oostelijke woonwijk' }
  ].map((row) => ({ ...row, ...findings.focusAreas[row.id] }));
  const maximum = Math.max(...rows.flatMap(({ baseline: before, recommended: after }) => [before.distanceBands.over_275, after.distanceBands.over_275]));
  const bars = rows.map((row, index) => {
    const y = 50 + index * 82;
    const before = row.baseline.distanceBands.over_275;
    const after = row.recommended.distanceBands.over_275;
    return `<text x="190" y="${y + 12}" text-anchor="end" font-weight="700">${escapeHtml(row.label)}</text>
      <rect x="210" y="${y - 9}" width="${before / maximum * 500}" height="19" rx="3" fill="#cbd5e1"/>
      <rect x="210" y="${y + 15}" width="${after / maximum * 500}" height="19" rx="3" fill="#2563eb"/>
      <text x="${222 + before / maximum * 500}" y="${y + 6}">${before}</text>
      <text x="${222 + after / maximum * 500}" y="${y + 31}">${after}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 800 330" role="img" aria-label="Adressen boven 275 meter per focusgebied, voor en na de locatieaanpassingen">
    ${bars}
    <rect x="260" y="300" width="16" height="10" rx="2" fill="#cbd5e1"/><text x="284" y="309">WH24-openbare baseline</text>
    <rect x="495" y="300" width="16" height="10" rx="2" fill="#2563eb"/><text x="519" y="309">Besloten variant</text>
  </svg>`;
}

function loadChart() {
  const plot = { x: 50, y: 35, width: 780, height: 240 };
  const gap = 4;
  const barWidth = (plot.width - gap * (newLocations.length - 1)) / newLocations.length;
  const bars = newLocations.map((location, index) => {
    const barHeight = location.assignedHouseholds / 100 * plot.height;
    const x = plot.x + index * (barWidth + gap);
    return `<rect x="${x}" y="${plot.y + plot.height - barHeight}" width="${barWidth}" height="${barHeight}" rx="2" fill="${location.screeningRating === 'green' ? '#0f766e' : '#2563eb'}">
      <title>${escapeHtml(location.id)}: ${location.assignedHouseholds} adressen</title></rect>
      <text transform="translate(${x + barWidth / 2} ${plot.y + plot.height + 12}) rotate(65)" font-size="9">${escapeHtml(location.id)}</text>`;
  }).join('');
  const targetY = plot.y + plot.height - 75 / 100 * plot.height;
  return `<svg class="chart" viewBox="0 0 860 360" role="img" aria-label="Modelbelasting van de ${newLocations.length} nieuwe locaties">
    <rect x="${plot.x}" y="${plot.y + plot.height - 90 / 100 * plot.height}" width="${plot.width}" height="${(90 - 60) / 100 * plot.height}" fill="#dbeafe" opacity=".55"/>
    <line x1="${plot.x}" y1="${targetY}" x2="${plot.x + plot.width}" y2="${targetY}" stroke="#0f172a" stroke-width="2" stroke-dasharray="6 5"/>
    ${bars}
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#94a3b8"/>
    <line x1="${plot.x}" y1="18" x2="${plot.x + 44}" y2="18" stroke="#0f172a" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="${plot.x + 52}" y="22" font-weight="700">zacht doel 75</text>
  </svg>`;
}

function locationRows(locations) {
  return locations.map((location) => `<tr>
    <td><strong>${escapeHtml(location.id)}</strong></td>
    <td>${escapeHtml(location.address)}</td>
    <td>${escapeHtml(sourceLabel(location))}</td>
    <td class="number">${location.assignedHouseholds}</td>
    <td><span class="tag ${ratingClass(location.screeningRating)}">${escapeHtml(ratingLabel(location.screeningRating))}</span></td>
    <td class="coord">${formatNumber(location.lat, 6)}, ${formatNumber(location.lon, 6)}</td>
  </tr>`).join('');
}

function chartRegion(label, chart) {
  return `<div class="chart-wrap" tabindex="0" role="region" aria-label="${escapeHtml(label)}; op een smal scherm horizontaal te verschuiven">${chart}</div>`;
}

const totalBands = recommended.totalDistanceIncludingPrivate.distanceBands;
const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(plan.title)}</title>
  <style>
    :root { --ink:#0f172a; --muted:#475569; --line:#dbe3ec; --blue:#2563eb; --soft:#f1f5f9; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:#edf2f7; font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    header { color:white; background:linear-gradient(135deg,#0f172a,#1d4ed8); padding:58px 24px 50px; }
    header>div, main { max-width:1120px; margin:auto; }
    h1 { margin:0 0 14px; max-width:900px; font-size:clamp(30px,5vw,52px); line-height:1.05; letter-spacing:-.035em; }
    h2 { margin:0 0 18px; font-size:27px; letter-spacing:-.02em; }
    header p { max-width:850px; margin:0; color:#dbeafe; font-size:18px; }
    main { padding:28px 18px 70px; }
    section { margin:0 0 24px; padding:28px; background:white; border:1px solid var(--line); border-radius:16px; box-shadow:0 8px 28px rgba(15,23,42,.05); }
    .cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:22px 0 0; }
    .card { padding:18px; color:var(--ink); background:white; border-radius:12px; }
    .card strong { display:block; font-size:30px; line-height:1.1; color:#1d4ed8; }
    .card span { color:var(--muted); font-size:13px; }
    .lead { font-size:18px; }
    .callout { padding:17px 19px; border-left:5px solid var(--blue); background:#eff6ff; border-radius:8px; }
    .warning { border-left-color:#ea580c; background:#fff7ed; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; color:#334155; background:var(--soft); position:sticky; top:0; }
    th,td { padding:9px 10px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
    td.number { text-align:right; font-variant-numeric:tabular-nums; }
    td.coord { font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; }
    .table-wrap,.chart-wrap,.map { overflow:auto; border:1px solid var(--line); border-radius:10px; }
    .table-wrap { max-height:620px; }
    .chart-wrap:focus-visible,.map:focus-visible { outline:3px solid #38bdf8; outline-offset:2px; }
    .tag { display:inline-block; padding:2px 7px; border-radius:999px; background:#fed7aa; color:#9a3412; font-size:11px; font-weight:700; }
    .tag.green { background:#dcfce7; color:#166534; } .tag.private { background:#dbeafe; color:#1e40af; } .tag.fixed { background:#e2e8f0; color:#334155; }
    .chart { display:block; width:100%; height:auto; overflow:visible; } .chart text { fill:#334155; font-family:inherit; font-size:12px; }
    .map { background:white; }
    .map svg { display:block; width:100%; height:auto; min-width:1050px; }
    a { color:#1d4ed8; } li+li { margin-top:7px; }
    .source-list { columns:2; column-gap:36px; }
    .source-list li { break-inside:avoid; margin-bottom:8px; }
    footer { color:#64748b; text-align:center; padding:20px; }
    @media(max-width:800px){ .cards,.grid{grid-template-columns:1fr 1fr}.source-list{columns:1}section{padding:20px} }
    @media(max-width:520px){ .cards,.grid{grid-template-columns:1fr}.chart{min-width:680px} }
    @media print { body{background:white}header{background:#0f172a}section{break-inside:avoid;box-shadow:none}.table-wrap{max-height:none}.chart,.map svg{min-width:0} }
  </style>
</head>
<body>
  <header><div>
    <h1>Capaciteitsplan Warmenhuizen</h1>
    <p>WH24 openbaar · M094 behouden · M082 toegevoegd · gerichte verschuivingen bij De Fuik en de Molenaarweg</p>
  </div></header>
  <main>
    <section>
      <h2>Executive Summary</h2>
      <ul class="lead">
        <li><strong>De gekozen variant telt 37 fysieke containers.</strong> WH24 wordt openbaar, WH23 blijft privé, M094 blijft staan en M082 wordt als extra openbare zoekzone toegevoegd.</li>
        <li><strong>De drie probleemgebieden verbeteren tegelijk.</strong> WH02 verschuift naar M055 bij De Fuik, WH30 naar M056 in de oostelijke wijk en M082 bedient Dorpsstraat, Fabrieksstraat en ’t Eiland.</li>
        <li><strong>De gemiddelde modelafstand daalt van ${formatNumber(baseline.capacityBalancedDistance.averageWalkingDistanceM, 1)} naar ${formatNumber(recommendedDistance.averageWalkingDistanceM, 1)} meter.</strong> De P95 daalt met ${formatNumber(findings.p95WalkingDistanceReductionM, 1)} meter en het aantal openbare adressen boven 275 meter van ${baseline.capacityBalancedDistance.distanceBands.over_275} naar ${recommendedDistance.distanceBands.over_275}.</li>
        <li><strong>M044 en M094 blijven bewust behouden.</strong> M044 blijft systeemmatig waardevol; M094 behouden levert tegenover de gelijk-aantalvariant nog ${formatNumber(findings.samePhysicalCountSensitivity.extraContainerBenefit.averageWalkingDistanceReductionM, 1)} meter gemiddeld en vier adressen boven 275 meter winst.</li>
      </ul>
      <div class="cards">
        <div class="card"><strong>${plan.decision.totalPhysicalContainers}</strong><span>fysieke containers totaal</span></div>
        <div class="card"><strong>${plan.decision.publicContainers}</strong><span>openbaar bruikbare locaties</span></div>
        <div class="card"><strong>${formatNumber(recommended.averageHouseholdsPerPublicContainer, 1)}</strong><span>adressen per openbare bak gemiddeld</span></div>
        <div class="card"><strong>${formatNumber(recommendedDistance.averageWalkingDistanceM, 1)} m</strong><span>capaciteitsgebalanceerde modelafstand</span></div>
      </div>
    </section>
    <section>
      <h2>Besloten locatievariant</h2>
      <p class="lead">Alle elf bestaande fysieke containers blijven op hun huidige coördinaten. WH24 wordt in dit scenario openbaar; alleen WH23 blijft privé voor drie geconfigureerde adressen. De 2.576 openbare BAG-woonadresproxies worden verdeeld over 36 openbare locaties: tien bestaande en 26 nieuwe zoekzones.</p>
      <ul>
        <li><strong>De Fuik:</strong> WH02 vervalt als zoekzone; M055 komt circa 140 meter noordelijker. M027 blijft staan.</li>
        <li><strong>Fabrieksstraat/’t Eiland:</strong> M082 komt erbij als extra zoekzone. M094 blijft behouden.</li>
        <li><strong>Oostelijke woonwijk:</strong> WH30 verschuift circa 68 meter oostwaarts naar M056, nabij Dorsvlegel/Schoffel/Strekel.</li>
        <li><strong>Molenaarsweg:</strong> M044 blijft staan; verplaatsing is onderzocht maar geeft een zwakker totaalresultaat.</li>
      </ul>
      <p class="callout"><strong>Relatie met het 75-doel:</strong> de rekenkundige minimumtelling bij maximaal 75 is 35 openbare locaties. Deze servicevariant kiest er 36 en komt uit op gemiddeld ${formatNumber(recommended.averageHouseholdsPerPublicContainer, 1)} adressen. Iedere nieuwe locatie blijft in de gekozen modelband van 60–90.</p>
    </section>
    <section>
      <h2>Effect ten opzichte van het gemeentelijke concept</h2>
      <div class="grid">
        ${chartRegion('Vergelijkingsgrafiek', comparisonChart())}
        <div><p><strong>+5 openbare locaties</strong> ten opzichte van het scenario met de 21 als restafval gedocumenteerde gemeentelijke voorstellen.</p>
          <p>Bij exclusieve capaciteitsbalancering:</p>
          <ul>
            <li>${formatNumber(capacityComparison.totalWalkingDistanceReductionPercent, 2)}% minder totale modelafstand</li>
            <li>${formatNumber(capacityComparison.averageWalkingDistanceReductionM, 1)} m lager gemiddelde</li>
            <li>${formatNumber(capacityComparison.p95WalkingDistanceReductionM, 1)} m lagere P95</li>
            <li>${formatNumber(capacityComparison.over275Reduction)} minder adressen boven 275 m</li>
          </ul>
          <p><strong>Optimistische gevoeligheid zonder capaciteitsbalans:</strong> als ieder adres de dichtstbijzijnde geselecteerde openbare bak kiest, is de reductie ${formatNumber(nearestComparison.totalWalkingDistanceReductionPercent, 2)}%, de P95-winst ${formatNumber(nearestComparison.p95WalkingDistanceReductionM, 1)} m en zijn er ${formatNumber(nearestComparison.over275Reduction)} minder adressen boven 275 m. Het verschil tussen beide minima is geen grens voor werkelijk bewonersgedrag.</p>
        </div>
      </div>
      <p class="callout warning"><strong>Interpretatie:</strong> de hoofdvergelijking is een één-op-één modeltoewijzing binnen de 60–90-band. Zij voorspelt niet welke van de drie met een afvalpas toegankelijke bakken bewoners feitelijk kiezen. De winst combineert bovendien andere locaties met vijf extra openbare locaties.</p>
    </section>
    <section>
      <h2>De drie aangewezen probleemgebieden verbeteren</h2>
      ${chartRegion('Adressen boven 275 meter per focusgebied', focusAreaChart())}
      <p><strong>De Fuik:</strong> van 16 naar 2 adressen boven 275 meter; de gemiddelde modelafstand daalt van ${formatNumber(findings.focusAreas.deFuik.baseline.averageWalkingDistanceM, 1)} naar ${formatNumber(findings.focusAreas.deFuik.recommended.averageWalkingDistanceM, 1)} meter.</p>
      <p><strong>Dorpsstraat, Fabrieksstraat en ’t Eiland:</strong> van 67 naar 20 adressen boven 275 meter. M082 is hier de nuttigste nog fysiek plausibele zoekzone; de exact afstandsgunstige M147-pin bij ’t Eiland 2 blijft afvallen wegens de eerder rode bureauscreening.</p>
      <p><strong>Oostelijke woonwijk:</strong> van 7 naar 0 adressen boven 275 meter. M056 is alleen logisch in combinatie met M082, omdat M082 de zuidwestelijke functie van WH30 overneemt.</p>
    </section>
    <section><h2>Dezelfde afstandskleuren als de repository</h2>
      ${chartRegion('Grafiek met afstandsbanden', distanceBandChart())}
      <p>Advies inclusief WH23 privé: ${formatNumber(totalBands.within_100)} groen, ${formatNumber(totalBands.between_100_125)} geel, ${formatNumber(totalBands.between_125_150)} oranje, ${formatNumber(totalBands.between_150_275)} rood, ${formatNumber(totalBands.over_275)} donkerrood en ${formatNumber(totalBands.unreachable)} grijs/onbereikbaar.</p>
    </section>
    <section><h2>Belasting van de ${newLocations.length} nieuwe locaties</h2>
      ${chartRegion('Grafiek met modelbelasting per nieuwe locatie', loadChart())}
      <p>De lichtblauwe zone is de gekozen modelband 60–90; de stippellijn markeert het zachte doel 75. Dit is een BAG-adresproxy, geen gemeten afvalvolume of bewezen fysieke bakcapaciteit.</p>
    </section>
    <section>
      <h2>Nieuwe zoekzones</h2>
      <p>Vier zones zijn groen en negentien oranje in de bestaande bureauscreen. De exacte pins van M055, M056 en M082 zijn nog niet integraal op BGT, orthofoto, eigendom of in het veld gescreend. Alle 26 punten zijn netwerkankers voor dienstverlening, geen exacte bouw- of graafpinnen.</p>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Referentie</th><th>Bron</th><th>Adressen</th><th>Screen</th><th>WGS84</th></tr></thead><tbody>${locationRows(newLocations)}</tbody></table></div>
    </section>
    <section>
      <h2>Bestaande locaties</h2>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Referentie</th><th>Rol</th><th>Adressen</th><th>Screen</th><th>WGS84</th></tr></thead><tbody>${locationRows(existingLocations)}</tbody></table></div>
    </section>
    <section>
      <h2>Onderzoeksmethode en onzekerheid</h2>
      <p>Nevrlý et al. onderzoeken plasticafval en modelleren vier conflicterende criteria: volumegewogen loopafstand, aantal inzamelpunten, aanschafkosten en voertuigservicetijd. Dit rapport past de afwegingsmethode toe op restafval; er volgt geen universele 275-metergrens uit het artikel.</p>
      <p>De loopafstanden zijn schattingen over een lokale bidirectionele OSM-voetgangersgraaf. De eerdere kalibratie tegen de opgeslagen routeringsdata had een gemiddelde absolute afwijking van 29,9 m en een P95-afwijking van 80,9 m. Meterwaarden zijn daarom vergelijkbare modeluitkomsten, geen veldnauwkeurige routeclaims.</p>
      <p>Beide openbare scenario’s gebruiken uitsluitend diezelfde OSM-matrix voor 2.576 adressen. Alleen de drie private WH23-rijen op de kaart behouden hun eerder opgeslagen OSRM-route; zij tellen niet mee in de openbare scenariovergelijking.</p>
      <p>De vorige 25-zone-uitkomst is als baseline herbouwd. Daarop zijn de expliciet gekozen wijzigingen WH02 → M055, WH30 → M056 en de toevoeging van M082 toegepast, met behoud van M027, M044 en M094. De vaste-locatietoewijzing minimaliseert de totale modelafstand binnen de 60–90-regels; de locatiekeuzes zelf zijn geen wereldwijd optimaliteitsbewijs.</p>
    </section>
    <section>
      <h2>Waarom M044 en M094 blijven</h2>
      <p><strong>M044 blijft volledig benut met 90 adressen.</strong> Als M044 in de gecombineerde wijzigingsvariant vervalt, loopt WH24 direct op tot 90 adressen en stijgt de totale modelafstand met ${formatNumber(findings.m044RemovalSensitivity.capacityBalancedDistance.totalWalkingDistanceM - recommendedDistance.totalWalkingDistanceM, 1)} meter. M044 blijft daarom nuttiger dan verplaatsing naar de zuidelijke M082-zone.</p>
      <p><strong>M094 blijft omdat een extra container is toegestaan.</strong> De gelijk-aantalvariant zonder M094 heeft ${findings.samePhysicalCountSensitivity.capacityBalancedDistance.distanceBands.over_275} adressen boven 275 meter. Met M094 én M082 zijn dat ${recommendedDistance.distanceBands.over_275}; het gemiddelde daalt nog ${formatNumber(findings.samePhysicalCountSensitivity.extraContainerBenefit.averageWalkingDistanceReductionM, 1)} meter. Dit is een servicekeuze, geen capaciteitstechnische noodzaak.</p>
    </section>
    <section>
      <h2>Kaart</h2>
      <p>Een donker vierkant is een bestaande openbare HVC-locatie, inclusief WH24; de blauwe ruit is privélocatie WH23 en een magenta pluscirkel is een nieuw modelanker. Huishoudpunten volgen de zes repositorykleuren.</p>
      <div class="map" tabindex="0" role="region" aria-label="Overzichtskaart; op een smal scherm horizontaal te verschuiven">${mapSvg}</div>
    </section>
    <section>
      <h2>Bouwbaarheid en vervolgstappen</h2>
      <p class="callout warning"><strong>Geen plaatsingsbesluit op deze pins.</strong> Orthofoto, BGT, OSM en gemeentelijke stukken zijn bureauscreens. Zij bewijzen geen eigendom, kabel-/leidingvrij volume, boomwortelvrijheid, actuele parkeerdruk, draaicurve, draagkracht of vrije hijslijn.</p>
      <ol>
        <li>Screen M055 exact op gemeentelijke grond, KLIC, gevel-/boomafstand en HVC-opstelroute.</li>
        <li>Zoek binnen de M082-zone een concrete pin aan de noord-/oostelijke grasrand en toets eigendom en verkeersveiligheid.</li>
        <li>Toets M056 daarna; de verplaatsing van WH30 hangt samen met een haalbare M082-zone.</li>
        <li>Leg openbare ruimte, eigendom en rechten juridisch vast.</li>
        <li>Meet gevel, bomen, water, zicht, parkeren en toegankelijkheid ter plaatse in.</li>
        <li>Doe een KLIC-orientatieverzoek, zo nodig proefsleuven en later een graafmelding.</li>
        <li>Toets bodem, grondwater, afwatering, HHNK-leggers en boomwortels.</li>
        <li>Laat HVC rijcurve, aslast, stempels, stoppositie en vrije hijslijn goedkeuren.</li>
        <li>Herbereken routes en lasten na iedere materiële verschuiving.</li>
      </ol>
    </section>
    <section>
      <h2>Scope, afstandsuitschieters en groei</h2>
      <p>De analyse bevat 2.579 BAG-woonfunctie-adresproxies binnen de vastgelegde BRT-bebouwde-komgrens van 1 juli 2025. Van de bredere BAG-woonplaatsselectie vallen 303 adressen buiten deze scope; of zij apart moeten worden bediend is een beleidskeuze, geen modelconclusie.</p>
      <p>${formatNumber(recommendedDistance.distanceBands.over_275)} openbare adressen blijven in de capaciteitsgebalanceerde toewijzing boven 275 m; de model-P95 is ${formatNumber(recommendedDistance.p95WalkingDistanceM, 1)} m en het maximum ${formatNumber(recommendedDistance.maximumWalkingDistanceM, 0)} m bij Debbemeerweg 39. Behandel de 275-meteraantallen in het licht van de route-onzekerheid.</p>
      <p>Dergmeerweg noemt 88 toekomstige woningen: reserveer ruimte voor één of twee aanvullende bakken, afhankelijk van netto nieuwe BAG-adressen, spreiding, afvalvolume en reservecapaciteit. Controleer voor Landsheer eerst welke van de 153 woningen al in de BAG-momentopname van 13 augustus 2026 zitten.</p>
    </section>
    <section>
      <h2>Bronnen en bestanden</h2>
      <ul class="source-list">
        <li><a href="https://www.sciencedirect.com/science/article/pii/S0959652620334909">Nevrlý et al. (2021)</a></li>
        <li><a href="https://www.cetjournal.it/index.php/cet/article/view/CET1976093">Openbare MILP-voorganger (2019)</a></li>
        <li><a href="https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3">VUT-masterthesis (2020)</a></li>
        <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen">Gemeentelijke conceptlocaties en toegang tot drie bakken</a></li>
        <li><a href="https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html">Gemeentelijk locatiecriteria-precedent</a></li>
        <li><a href="https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf">Schagen LIOR deel 2</a></li>
        <li><a href="https://www.schagen.nl/dergmeerweg">Dergmeerweg</a> en <a href="https://www.schagen.nl/nieuwbouwwijk-landsheer">Landsheer</a></li>
        <li><a href="https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&amp;lang=nl">PDOK BAG</a> en <a href="https://api.pdok.nl/lv/bgt/ogc/v1?f=html&amp;lang=nl">PDOK BGT</a></li>
        <li><a href="https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-">PDOK orthofoto RGB</a></li>
        <li><a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></li>
        <li><a href="capacity-plan.json">Plan, locatievarianten en bronhashes</a> · <a href="private-access-leave-one-out.json">eerdere 26-kandidaten-baseline</a></li>
        <li><a href="household-assignment.json">2.579 unieke toewijzingen</a> · <a href="locations.geojson">GeoJSON</a></li>
      </ul>
    </section>
  </main>
  <footer>Onderzoeksadvies · 14 augustus 2026 · geen civieltechnische vrijgave</footer>
</body>
</html>`;

writeFileSync(outputUrl, html);
const verification = readFileSync(outputUrl, 'utf8');
for (const expected of ['Executive Summary', 'WH24 wordt openbaar', 'M094 blijft', 'M082', 'M055', 'M056', '26 nieuwe locaties', 'dichtstbijzijnde geselecteerde', '#15803d', '#eab308', '#f97316', '#dc2626', '#7f1d1d', 'M157', 'magenta pluscirkel']) {
  if (!verification.includes(expected)) throw new Error(`Standalone report is missing ${expected}.`);
}
console.log(JSON.stringify({ output: outputUrl.pathname, bytes: Buffer.byteLength(verification), locations: plan.locations.length, status: 'verified' }, null, 2));
