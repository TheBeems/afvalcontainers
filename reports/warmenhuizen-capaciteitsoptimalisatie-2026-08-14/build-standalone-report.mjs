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
    'private-fixed': 'privé (bestaand)'
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
  return `<svg class="chart" viewBox="0 0 860 360" role="img" aria-label="Modelbelasting van de 25 nieuwe locaties">
    <rect x="${plot.x}" y="${plot.y + plot.height - 90 / 100 * plot.height}" width="${plot.width}" height="${(90 - 60) / 100 * plot.height}" fill="#dbeafe" opacity=".55"/>
    <line x1="${plot.x}" y1="${targetY}" x2="${plot.x + plot.width}" y2="${targetY}" stroke="#0f172a" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="${plot.x + plot.width - 4}" y="${targetY - 7}" text-anchor="end" font-weight="700">zacht doel 75</text>
    ${bars}
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#94a3b8"/>
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
const selection = recommended.recordedCandidatePoolSelection;
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
    <p>Circa 75 huishoudens per openbare restcontainer · alle 11 bestaande locaties én toegangsrechten behouden · modelafstand als allocatiecriterium</p>
    <div class="cards">
      <div class="card"><strong>${plan.decision.totalPhysicalContainers}</strong><span>fysieke containers totaal</span></div>
      <div class="card"><strong>${plan.decision.newPublicContainers}</strong><span>nieuwe openbare zoekzones</span></div>
      <div class="card"><strong>${formatNumber(recommended.averageHouseholdsPerPublicContainer, 1)}</strong><span>adressen per openbare bak gemiddeld</span></div>
      <div class="card"><strong>${formatNumber(recommendedDistance.averageWalkingDistanceM, 1)} m</strong><span>capaciteitsgebalanceerde modelafstand</span></div>
    </div>
  </div></header>
  <main>
    <section>
      <h2>Advies</h2>
      <p class="lead">Behoud alle elf bestaande containers exact, inclusief de private allowlists van WH23 en WH24. Plaats 25 nieuwe openbare containers, zodat ${formatNumber(plan.decision.publicBagResidentialAddressProxies)} openbare BAG-woonadresproxies over ${plan.decision.publicContainers} openbare bakken worden verdeeld. De zeven geconfigureerde private adressen blijven uitsluitend aan WH23 of WH24 gekoppeld.</p>
      <p class="callout"><strong>Zacht doelaantal:</strong> round(${formatNumber(plan.decision.publicBagResidentialAddressProxies)} / 75) = ${plan.decision.publicContainers} openbare bakken. Met negen bestaande openbare bakken betekent dat 25 nieuwe; inclusief twee private bakken zijn er ${plan.decision.totalPhysicalContainers} fysiek. Het gemiddelde is ${formatNumber(recommended.averageHouseholdsPerPublicContainer, 1)}.</p>
      <p>Iedere nieuwe locatie krijgt in het model 60–90 adressen; bestaande openbare locaties krijgen geen kunstmatig minimum. Als 75 als harde bovengrens wordt bedoeld, is 35 openbaar en 37 fysiek alleen de rekenkundige ondergrens. Een 26-locatielijst en maximum-75-toewijzing zijn niet doorgerekend.</p>
    </section>
    <section>
      <h2>Effect ten opzichte van het gemeentelijke concept</h2>
      <div class="grid">
        ${chartRegion('Vergelijkingsgrafiek', comparisonChart())}
        <div><p><strong>+4 openbare containers</strong> ten opzichte van de 21 als restafval gedocumenteerde nieuwe voorstellen.</p>
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
      <p class="callout warning"><strong>Interpretatie:</strong> de hoofdvergelijking is een één-op-één modeltoewijzing binnen de 60–90-band. Zij voorspelt niet welke van de drie met een afvalpas toegankelijke bakken bewoners feitelijk kiezen. De winst combineert bovendien andere locaties met vier extra openbare bakken.</p>
    </section>
    <section><h2>Dezelfde afstandskleuren als de repository</h2>
      ${chartRegion('Grafiek met afstandsbanden', distanceBandChart())}
      <p>Advies inclusief beide privélocaties: ${formatNumber(totalBands.within_100)} groen, ${formatNumber(totalBands.between_100_125)} geel, ${formatNumber(totalBands.between_125_150)} oranje, ${formatNumber(totalBands.between_150_275)} rood, ${formatNumber(totalBands.over_275)} donkerrood en ${formatNumber(totalBands.unreachable)} grijs/onbereikbaar.</p>
    </section>
    <section><h2>Belasting van de 25 nieuwe locaties</h2>
      ${chartRegion('Grafiek met modelbelasting per nieuwe locatie', loadChart())}
      <p>De lichtblauwe zone is de gekozen modelband 60–90; de stippellijn markeert het zachte doel 75. Dit is een BAG-adresproxy, geen gemeten afvalvolume of bewezen fysieke bakcapaciteit.</p>
    </section>
    <section>
      <h2>Nieuwe zoekzones</h2>
      <p>Vier zones zijn groen en 21 oranje in de bureauscreen. Het zijn netwerkankers voor dienstverlening, geen exacte bouw- of graafpinnen.</p>
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
      <p>Beide openbare scenario’s gebruiken uitsluitend diezelfde OSM-matrix voor 2.572 adressen. Alleen de zeven private rijen op de kaart behouden hun eerder opgeslagen OSRM-route; zij tellen niet mee in de scenariovergelijking.</p>
      <p>De volledige eindselectie vergelijkt alle 26 vastgelegde toevoegingskandidaten onder dezelfde capaciteitseisen. ${selection.removedSearchAnchorId} vervalt; de nummer twee (${selection.runnerUpRemovedId} laten vervallen) is ${formatNumber(selection.runnerUpAdditionalDistanceM, 1)} modelmeter langer. De voorafgaande kandidaatzoekgang blijft een vastgelegde invoer en is geen wereldwijd optimaliteitsbewijs.</p>
    </section>
    <section>
      <h2>Kaart</h2>
      <p>Een donker vierkant is een bestaande openbare HVC-locatie, een blauwe ruit is een bestaande privélocatie (WH23 of WH24) en een magenta pluscirkel is een nieuw modelanker. Huishoudpunten volgen de zes repositorykleuren.</p>
      <div class="map" tabindex="0" role="region" aria-label="Overzichtskaart; op een smal scherm horizontaal te verschuiven">${mapSvg}</div>
    </section>
    <section>
      <h2>Bouwbaarheid en vervolgstappen</h2>
      <p class="callout warning"><strong>Geen plaatsingsbesluit op deze pins.</strong> Orthofoto, BGT, OSM en gemeentelijke stukken zijn bureauscreens. Zij bewijzen geen eigendom, kabel-/leidingvrij volume, boomwortelvrijheid, actuele parkeerdruk, draaicurve, draagkracht of vrije hijslijn.</p>
      <ol>
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
        <li><a href="capacity-plan.json">Plan en bronhashes</a> · <a href="private-access-leave-one-out.json">volledige eindselectie</a></li>
        <li><a href="household-assignment.json">2.579 unieke toewijzingen</a> · <a href="locations.geojson">GeoJSON</a></li>
      </ul>
    </section>
  </main>
  <footer>Onderzoeksadvies · 14 augustus 2026 · geen civieltechnische vrijgave</footer>
</body>
</html>`;

writeFileSync(outputUrl, html);
const verification = readFileSync(outputUrl, 'utf8');
for (const expected of ['WH23 en WH24', '25 nieuwe openbare', 'dichtstbijzijnde geselecteerde', '#15803d', '#eab308', '#f97316', '#dc2626', '#7f1d1d', 'M157', 'magenta pluscirkel']) {
  if (!verification.includes(expected)) throw new Error(`Standalone report is missing ${expected}.`);
}
console.log(JSON.stringify({ output: outputUrl.pathname, bytes: Buffer.byteLength(verification), locations: plan.locations.length, status: 'verified' }, null, 2));
