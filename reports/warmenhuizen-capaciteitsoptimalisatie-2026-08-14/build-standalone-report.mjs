#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('capacity-plan.json', reportDirectory), 'utf8'));
const screening = JSON.parse(readFileSync(new URL('location-screening.json', reportDirectory), 'utf8'));
const mapSvg = readFileSync(new URL('overview-map.svg', reportDirectory), 'utf8')
  .replace(/^<\?xml[^>]*>\s*/u, '');
const outputUrl = new URL('warmenhuizen-capaciteitsplan.html', reportDirectory);

const recommended = plan.recommendedScenario;
const municipal = plan.municipalConceptComparison;
const newLocations = screening.locations.filter(({ role }) => role === 'new');
const existingLocations = screening.locations.filter(({ role }) => role !== 'new');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function comparisonChart() {
  const rows = [
    { label: 'Gemiddeld', municipal: municipal.distance.averageWalkingDistanceM, recommended: recommended.distance.averageWalkingDistanceM },
    { label: 'P95', municipal: municipal.distance.p95WalkingDistanceM, recommended: recommended.distance.p95WalkingDistanceM }
  ];
  const width = 760;
  const height = 330;
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
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Vergelijking gemiddelde en P95-loopafstand">
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#cbd5e1"/>
    ${bars}
    <rect x="250" y="300" width="16" height="10" rx="2" fill="#94a3b8"/><text x="274" y="309">Gemeente</text>
    <rect x="390" y="300" width="16" height="10" rx="2" fill="#2563eb"/><text x="414" y="309">Advies</text>
  </svg>`;
}

function distanceBandChart() {
  const bands = [
    ['0–100', 'within_100', '#15803d'],
    ['100–125', 'between_100_125', '#eab308'],
    ['125–150', 'between_125_150', '#f97316'],
    ['150–275', 'between_150_275', '#dc2626'],
    ['>275', 'over_275', '#7f1d1d']
  ];
  const width = 800;
  const maximum = Math.max(...bands.flatMap(([, key]) => [
    municipal.distance.distanceBands[key],
    recommended.distance.distanceBands[key]
  ]));
  const rowHeight = 58;
  const barMaximumWidth = 510;
  const rows = bands.map(([label, key, color], index) => {
    const y = 45 + index * rowHeight;
    const municipalValue = municipal.distance.distanceBands[key];
    const recommendedValue = recommended.distance.distanceBands[key];
    return `<text x="78" y="${y + 7}" text-anchor="end" font-weight="700">${label} m</text>
      <rect x="95" y="${y - 15}" width="${municipalValue / maximum * barMaximumWidth}" height="18" rx="3" fill="#cbd5e1"/>
      <rect x="95" y="${y + 7}" width="${recommendedValue / maximum * barMaximumWidth}" height="18" rx="3" fill="${color}"/>
      <text x="${110 + municipalValue / maximum * barMaximumWidth}" y="${y - 1}">${formatNumber(municipalValue)}</text>
      <text x="${110 + recommendedValue / maximum * barMaximumWidth}" y="${y + 22}">${formatNumber(recommendedValue)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} 365" role="img" aria-label="Afstandsbanden gemeente en advies">
    ${rows}
    <rect x="235" y="340" width="16" height="10" rx="2" fill="#cbd5e1"/><text x="259" y="349">Gemeente</text>
    <rect x="385" y="340" width="16" height="10" rx="2" fill="#2563eb"/><text x="409" y="349">Advies, in repo-bandkleur</text>
  </svg>`;
}

function loadChart() {
  const width = 860;
  const height = 360;
  const plot = { x: 50, y: 35, width: 780, height: 240 };
  const gap = 4;
  const barWidth = (plot.width - gap * (newLocations.length - 1)) / newLocations.length;
  const bars = newLocations.map((location, index) => {
    const barHeight = location.assignedHouseholds / 100 * plot.height;
    const x = plot.x + index * (barWidth + gap);
    return `<rect x="${x}" y="${plot.y + plot.height - barHeight}" width="${barWidth}" height="${barHeight}" rx="2" fill="${location.rating === 'green' ? '#0f766e' : '#2563eb'}">
      <title>${escapeHtml(location.id)}: ${location.assignedHouseholds} adressen</title></rect>
      <text transform="translate(${x + barWidth / 2} ${plot.y + plot.height + 12}) rotate(65)" font-size="9">${escapeHtml(location.id)}</text>`;
  }).join('');
  const targetY = plot.y + plot.height - 75 / 100 * plot.height;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Belasting van de 25 nieuwe locaties">
    <rect x="${plot.x}" y="${plot.y + plot.height - 90 / 100 * plot.height}" width="${plot.width}" height="${(90 - 60) / 100 * plot.height}" fill="#dbeafe" opacity=".55"/>
    <line x1="${plot.x}" y1="${targetY}" x2="${plot.x + plot.width}" y2="${targetY}" stroke="#0f172a" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="${plot.x + plot.width - 4}" y="${targetY - 7}" text-anchor="end" font-weight="700">doel 75</text>
    ${bars}
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#94a3b8"/>
  </svg>`;
}

function locationRows(locations) {
  return locations.map((location) => `<tr>
    <td><strong>${escapeHtml(location.id)}</strong></td>
    <td>${escapeHtml(location.address)}</td>
    <td>${location.source === 'municipal-concept' ? 'gemeentelijk concept' : location.role === 'new' ? 'eigen zoekanker' : location.role === 'existing-private' ? 'bestaand privé' : 'bestaand openbaar'}</td>
    <td class="number">${location.assignedHouseholds}</td>
    <td><span class="tag ${escapeHtml(location.rating.split('-')[0])}">${escapeHtml(location.rating)}</span></td>
    <td class="coord">${formatNumber(location.lat, 6)}, ${formatNumber(location.lon, 6)}</td>
  </tr>`).join('');
}

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
    h1 { margin:0 0 14px; max-width:850px; font-size:clamp(30px,5vw,52px); line-height:1.05; letter-spacing:-.035em; }
    h2 { margin:0 0 18px; font-size:27px; letter-spacing:-.02em; }
    h3 { margin-top:26px; }
    header p { max-width:800px; margin:0; color:#dbeafe; font-size:18px; }
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
    .table-wrap { overflow:auto; max-height:620px; border:1px solid var(--line); border-radius:10px; }
    .tag { display:inline-block; padding:2px 7px; border-radius:999px; background:#fed7aa; color:#9a3412; font-size:11px; font-weight:700; }
    .tag.green { background:#dcfce7; color:#166534; } .tag.private { background:#f3e8ff; color:#6b21a8; } .tag.fixed { background:#e2e8f0; color:#334155; }
    .chart { width:100%; height:auto; overflow:visible; } .chart text { fill:#334155; font-family:inherit; font-size:12px; }
    .map { overflow:auto; border:1px solid var(--line); border-radius:12px; background:white; }
    .map svg { display:block; width:100%; height:auto; min-width:680px; }
    a { color:#1d4ed8; } li+li { margin-top:7px; }
    .source-list { columns:2; column-gap:36px; }
    .source-list li { break-inside:avoid; margin-bottom:8px; }
    footer { color:#64748b; text-align:center; padding:20px; }
    @media(max-width:800px){ .cards,.grid{grid-template-columns:1fr 1fr}.source-list{columns:1}section{padding:20px} }
    @media(max-width:520px){ .cards,.grid{grid-template-columns:1fr} }
    @media print { body{background:white} header{background:#0f172a} section{break-inside:avoid;box-shadow:none}.table-wrap{max-height:none}.map svg{min-width:0} }
  </style>
</head>
<body>
  <header><div>
    <h1>Capaciteitsplan Warmenhuizen</h1>
    <p>Circa 75 huishoudens per restcontainer · alle 11 bestaande locaties behouden · WH24 openbaar · loopafstand als allocatiecriterium</p>
    <div class="cards">
      <div class="card"><strong>36</strong><span>fysieke containers totaal</span></div>
      <div class="card"><strong>25</strong><span>nieuwe openbare zoekzones</span></div>
      <div class="card"><strong>73,6</strong><span>adressen per openbare bak gemiddeld</span></div>
      <div class="card"><strong>141,6 m</strong><span>gemiddelde openbare loopafstand</span></div>
    </div>
  </div></header>
  <main>
    <section>
      <h2>Advies</h2>
      <p class="lead">Behoud alle elf bestaande containers exact. Maak WH24 openbaar en houd alleen WH23 privé voor Pastoor Willemsestraat 9, 131 en 224. Plaats 25 nieuwe openbare containers, zodat 2.576 openbare BAG-woonadresproxies over 35 openbare bakken worden verdeeld.</p>
      <p class="callout"><strong>Ondergrens:</strong> ceil(2.576 / 75) = 35 openbare bakken. Met tien bestaande openbare bakken zijn 25 nieuwe nodig. Inclusief WH23 privé zijn dat 36 fysieke bakken.</p>
      <p>Iedere nieuwe locatie krijgt 60–90 adressen; bestaande locaties krijgen geen kunstmatig minimum. De 275 meter is alleen een kwaliteitskleur, geen harde restrictie.</p>
    </section>
    <section>
      <h2>Effect ten opzichte van het gemeentelijke concept</h2>
      <div class="grid">
        <div>${comparisonChart()}</div>
        <div><p><strong>+4 openbare containers</strong> ten opzichte van de 21 als restafval gedocumenteerde nieuwe voorstellen.</p>
          <ul>
            <li>${formatNumber(plan.comparison.totalWalkingDistanceReductionPercent,2)}% minder totale loopafstand</li>
            <li>${formatNumber(plan.comparison.averageWalkingDistanceReductionM,1)} m lager gemiddelde</li>
            <li>${formatNumber(plan.comparison.p95WalkingDistanceReductionM,1)} m lagere P95</li>
            <li>${formatNumber(plan.comparison.over275Reduction)} minder adressen boven 275 m</li>
          </ul>
          <p>In de gemeentelijke publicatie zijn WH26, WH27, WH31 en WH32 GFE-toevoegingen; alleen 20 ondergrondse restpunten en WH01 semi-rest tellen als nieuwe restcapaciteit. WH35 is niet publiek bevestigd.</p></div>
      </div>
    </section>
    <section><h2>Dezelfde afstandskleuren als de repository</h2>${distanceBandChart()}
      <p>Advies inclusief WH23: 905 groen, 343 geel, 330 oranje, 844 rood, 157 donkerrood en nul grijs/onbereikbaar.</p>
    </section>
    <section><h2>Belasting van de 25 nieuwe locaties</h2>${loadChart()}
      <p>De lichtblauwe zone is de beleidsband 60–90; de stippellijn markeert 75. De gemiddelde openbare belasting is 73,6.</p>
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
      <h2>Onderzoeksmethode</h2>
      <p>Nevrlý et al. modelleren vier conflicterende criteria: volumegewogen loopafstand, aantal inzamelpunten, aanschafkosten en voertuigservicetijd. Er volgt geen universele 275-metergrens uit het onderzoek. Voor Warmenhuizen zijn de bestaande locaties vooraf geopend, huishoudens ondeelbaar en afstanden over een voetgangersnetwerk gemeten.</p>
      <p>De 75 is een beleidsmatige BAG-adresproxy, geen fysieke liter- of kilogramcapaciteit. Lokale afvalvolumes, vulgraden, ledigingsfrequenties, kosten en HVC-servicetijden zijn niet openbaar beschikbaar. De locatiezoekgang is BGT-bewust en lokaal; de capaciteitsmatching is deterministisch met een eind-epsilon van 0,01 m. Dit is de beste gevonden lokale oplossing, geen mondiaal optimaliteitsbewijs.</p>
      <p>Toen WH24 openbaar werd, zijn de mogelijke vervangingen opnieuw vergeleken. M154 bij Dergmeerweg 52 vervalt en M157 bij Dergmeerweg 65 blijft; omgekeerd stijgt de totale afstand met 1.207,6 m.</p>
    </section>
    <section>
      <h2>Kaart</h2>
      <p>Groen vierkant is bestaand openbaar, paars is WH23 privé en blauw is een nieuwe zoekzone. Huishoudpunten volgen de zes repositorykleuren.</p>
      <div class="map">${mapSvg}</div>
    </section>
    <section>
      <h2>Bouwbaarheid en vervolgstappen</h2>
      <p class="callout warning"><strong>Geen plaatsingsbesluit op deze pins.</strong> Orthofoto, BGT, OSM en perceellagen zijn bureauscreens. Zij bewijzen geen eigendom, kabel-/leidingvrij volume, boomwortelvrijheid, actuele parkeerdruk, draaicurve, draagkracht of vrije hijslijn.</p>
      <ol>
        <li>Leg openbare ruimte, eigendom en rechten juridisch vast.</li>
        <li>Meet gevel, bomen, water, zicht, parkeren en toegankelijkheid ter plaatse in.</li>
        <li>Doe een KLIC-orientatieverzoek, zo nodig proefsleuven en later een graafmelding.</li>
        <li>Toets bodem, grondwater, afwatering, HHNK-leggers en boomwortels.</li>
        <li>Laat HVC swept path, aslast, stempels, stoppositie en vrije hijslijn goedkeuren.</li>
        <li>Herbereken routes en lasten na iedere materiële verschuiving.</li>
      </ol>
    </section>
    <section>
      <h2>Afstandsuitschieters en groei</h2>
      <p>157 openbare adressen blijven boven 275 m. De grootste groepen liggen aan Dorpsstraat, Fabrieksstraat, De Fuik, Oostwal, Oudevaart en Oudewal; het maximum is 776 m voor Debbemeerweg 39. Een optionele gelijkheidsvariant kan een extra corridorzone rond Oudevaart 67–89 onderzoeken, met een lagere gemiddelde bakbelasting als bewuste prijs.</p>
      <p>Dergmeerweg noemt 88 toekomstige woningen: reserveer ten minste twee aanvullende bakken en heroptimaliseer zodra een gezaghebbende adressenlijst beschikbaar is. Controleer voor Landsheer eerst welke van de 153 woningen al in de BAG-snapshot zitten.</p>
    </section>
    <section>
      <h2>Bronnen en bestanden</h2>
      <ul class="source-list">
        <li><a href="https://www.sciencedirect.com/science/article/pii/S0959652620334909">Nevrlý et al. (2021)</a></li>
        <li><a href="https://www.cetjournal.it/index.php/cet/article/view/CET1976093">Openbare MILP-voorganger (2019)</a></li>
        <li><a href="https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3">VUT-masterthesis (2020)</a></li>
        <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen">Gemeentelijke conceptlocaties</a></li>
        <li><a href="https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html">Formele locatiecriteria</a></li>
        <li><a href="https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&amp;lang=nl">PDOK BAG</a></li>
        <li><a href="https://api.pdok.nl/lv/bgt/ogc/v1?f=html&amp;lang=nl">PDOK BGT</a></li>
        <li><a href="https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-">PDOK orthofoto RGB</a></li>
        <li><a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a></li>
        <li><a href="capacity-plan.json">Volledig plan en bronhashes</a></li>
        <li><a href="household-assignment.json">2.579 unieke toewijzingen</a></li>
        <li><a href="locations.geojson">GeoJSON-locaties</a></li>
      </ul>
    </section>
  </main>
  <footer>Onderzoeksadvies · 14 augustus 2026 · geen civieltechnische vrijgave</footer>
</body>
</html>`;

writeFileSync(outputUrl, html);
const verification = readFileSync(outputUrl, 'utf8');
for (const expected of ['WH24', '25 nieuwe openbare', '#15803d', '#eab308', '#f97316', '#dc2626', '#7f1d1d', '#64748b', 'M157']) {
  if (!verification.includes(expected)) throw new Error(`Standalone report is missing ${expected}.`);
}
console.log(JSON.stringify({ output: outputUrl.pathname, bytes: Buffer.byteLength(verification), locations: screening.locations.length, status: 'verified' }, null, 2));
