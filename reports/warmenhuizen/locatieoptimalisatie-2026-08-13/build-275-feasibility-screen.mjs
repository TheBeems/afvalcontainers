#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const aerialBgt = JSON.parse(readFileSync(new URL('aerial-bgt-screen-275.json', reportDirectory), 'utf8'));
const ownership = JSON.parse(readFileSync(new URL('ownership-screen-275.json', reportDirectory), 'utf8'));

const assessments = {
  'model-275-01': ['rood', 'De Fuik 10', 'Pin midden in smalle rijbaan; erven 1,1 m, gevels 5,9/6,0 m en parkeren 11 m.', 'Zoek noord/west een bredere openbare rand en herbereken.'],
  'model-275-02': ['rood', 'Oostwal 79', 'Kruising met voetpaden 2,6/3,3 m, inritten 4,8/5,9 m en gevel 10,6 m.', 'Zoek zuidelijk buiten inritten en zichtdriehoek.'],
  'model-275-03': ['rood', 'Veilingweg 37', 'Zijwegaansluiting; fietspaden 4,1/4,2 m, bordpaal 5,5 m, gevel 13,9 m en water 14 m.', 'Verplaats dieper Hartendorp in en herbereken.'],
  'model-275-04': ['rood', 'De Hoge Werf 2', 'Exact op voetpad; lichtmast 3 m, water 8,7 m, gevel 9,5 m; rijbaan circa 19,8 m weg.', 'Nieuwe voertuigbereikbare zoekzone nodig.'],
  'model-275-05': ['oranje', 'Baljuw 37', 'Parkeren 1,9 m, voetpad/inritten 3,5–4,1 m, lichtmast 4,9 m, bomen vanaf 7,8 m en water 11,7 m.', 'Onderzoek 5–10 m verschuiving naar grasrand.'],
  'model-275-06': ['rood', 'De Baan 33', 'T-aansluiting; lichtmast 3 m, droge sloot 5,8 m, boom 7,1 m en afsluitpaal 8,1 m.', 'Gebruik liever de eerder groen beoordeelde WH10-zone circa 64 m westelijk en herbereken.'],
  'model-275-07': ['rood', 'Veilingweg 70D', 'Actief parkeerterrein/erf; geen gemeentelijk perceel binnen 25 m en BAG-snap 92,9 m.', 'Zoek 20–40 m noord/oost aan openbare Veilingweg-rand.'],
  'model-275-08': ['rood', 'De Huisweid 17', 'Besloten erfcluster; erf 2,3 m, gevels 5,4/9,4 m en smalle interne toegang; geen gemeentelijk perceel binnen 25 m.', 'Zoek buiten het erf aan openbare weg.'],
  'model-275-09': ['oranje', 'Wiekeland 7', 'Wegkop; tweede rijbaan 1,2 m, voetpad 3,8 m, gras 3,9 m, boom 5,0 m en lichtmast 5,1 m.', 'Onderzoek 4–6 m oost/noordoost.'],
  'model-275-10': ['rood', 'Posthoorn 25', 'Complexe fiets-/voetkruising; fietspaden 2,1/3,5 m, voetpad 2,5 m, bordpalen 5,1/5,8 m en boom 6,9 m.', 'Zoek 15–30 m westelijk en herbereken.'],
  'model-275-11': ['rood', 'Vijfven 7', 'Exact op fietspad; rijbaan 3,3 m, boom 5,0 m en water 6,1 m.', 'Zoek aan de woonstraat, niet in de fiets-/watercorridor.'],
  'model-275-12': ['oranje', 'De Negen Geerzen 29', 'Rijbaan; voetpad 2,1 m, erf 3,9 m, gevel en parkeren 7,8 m; brede groenzone zichtbaar.', 'Onderzoek 5–8 m oost/noordoost.'],
  'model-275-13': ['rood', 'Dorpsstraat 110A', 'Druk verblijfs-/parkeergebied; parkeren 2,3/3,2 m, boom 5,8 m en veel afsluitpalen vanaf 6,8 m.', 'Alleen mogelijk met expliciete parkeerplaatsconversie.'],
  'model-275-14': ['oranje', 'Goudsboer 3', 'Smalle straat; voetpad 1,4 m, lichtmast 3,7 m, bomen 5,4/5,5 m, parkeren 6,5 m en gevel 9,7 m.', 'Onderzoek 8–12 m west/noordwest aan speelgroenrand.'],
  'model-275-15': ['rood', 'Gaspad 2', 'Erf/voetpad; voetpad 0,6 m, gevels 3,9/4,3 m en rijbaan 4,6 m; pin niet op gemeentelijk perceel.', 'Zoek 15–25 m west/zuidwest naar bredere openbare berm.'],
  'model-275-16': ['rood', 'Zwartepad 44', 'Rijbaan en verkeerseiland 1,2 m; lichtmast 6,3 m, bomen 6,4–8,4 m en water 14,2 m.', 'Zoek 15–30 m verder aan recht straatdeel.'],
  'model-275-17': ['groen', 'De Camper 1', 'Pin op rijbaan, maar bruikbare verharde pleinhoek zichtbaar; parkeren 3,6 m, inrit 4,4 m en gevel 11,5 m.', 'Onderzoek 8–15 m noordwest, buiten parkeer- en hijszone.'],
  'model-275-18': ['oranje', 'Fabrieksstraat 29', 'Kruising; groen 4,3/4,5 m, lichtmast 6 m, voetpad 7 m, droge sloot 7,8 m en gevel 11,1 m.', 'Onderzoek noord/oostelijke grasrand.'],
  'model-275-19': ['oranje', 'De Cres 14', 'Wegkruising; parkeren 3,2 m, voetpad 7,4 m, lichtmast 9,8 m, afsluitpaal 10,9 m, gevel 11,3 m en kast 11,5 m.', 'Onderzoek 8–15 m noordoost.'],
  'model-275-20': ['rood', 'Zigt 26', 'Zeer krappe woonbocht; inrit 2,9 m, boom 4,5 m, lichtmast 5,3 m, gevel 6,7 m en kast 7,1 m.', 'Geen overtuigend lokaal alternatief; vervang zoekzone.'],
  'model-275-21': ['oranje', 'Oudevaart 42A', 'Groene rand aanwezig, maar bordpaal 2,5 m, boom 3,8 m, inrit 4,6 m, voetpad 4,9 m en droge sloot 8,6 m.', 'Onderzoek 8–15 m in open randvak.'],
  'model-275-22': ['groen', 'Oudevaart 89', 'Exacte pin conflicteert met fietspad op 2,2 m, maar zijweg-/parkeerrand is zichtbaar.', 'Onderzoek 10–20 m oost/zuidoost en laat HVC uitsluitend vanaf de zijweg bedienen.'],
  'model-275-23': ['rood', 'Debbemeerweg 39', 'Exact op fietspad/kruising; inritten 1,5 m, bordpaal 2,7 m, rijbaan 4,5 m, lichtmasten 4,9/5,6 m en water 6,6 m.', 'Vervang door een nieuwe zoekzone.']
};

const aerialById = new Map(aerialBgt.sites.map((site) => [site.id, site]));
const ownershipById = new Map(ownership.sites.map((site) => [site.id, site]));
const sites = Object.entries(assessments).map(([id, [rating, referenceAddress, finding, followUp]]) => {
  const aerial = aerialById.get(id);
  const parcel = ownershipById.get(id);
  if (!aerial || !parcel) throw new Error(`Missing source screen for ${id}`);
  return {
    id,
    rating,
    referenceAddress,
    latitude: aerial.latitude,
    longitude: aerial.longitude,
    exactMunicipal: parcel.exactMunicipal,
    exactMunicipalParcels: parcel.exactMunicipalParcels,
    municipalParcelWithin25M: parcel.municipalParcelWithin25M,
    aerialImage: aerial.aerialImage,
    aerialSourceUrl: aerial.aerialSourceUrl,
    finding,
    followUp
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  method: 'Manual desk screen of the exact analytical anchor and immediate surroundings using PDOK 2026 orthophotography, BGT objects within 20 m and the provincial public BRK large-owner layer.',
  interpretation: {
    groen: 'A credible nearby search zone is visible; still requires all field, ownership, KLIC, safety and HVC checks.',
    oranje: 'A local alternative may exist but at least one decisive terrain or vehicle check is unresolved.',
    rood: 'The exact anchor and immediate surroundings are not credible; materially relocate and rerun all walking assignments.'
  },
  limitation: 'This is not a build approval. The exact model anchors are route-network nodes, often in carriageway or cycleway. Every move changes distances and must be rerouted.',
  sources: {
    aerialBgt: 'aerial-bgt-screen-275.json',
    ownership: 'ownership-screen-275.json'
  },
  counts: Object.fromEntries(['groen', 'oranje', 'rood'].map((rating) => [rating, sites.filter((site) => site.rating === rating).length])),
  sites
};

writeFileSync(new URL('feasibility-screen-275.json', reportDirectory), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.counts, null, 2));
