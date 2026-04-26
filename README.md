
# Loopafstanden naar ondergrondse restafvalcontainers in Warmenhuizen

Website te bezoeken op: https://thebeems.github.io/afvalcontainers/

## Inleiding
Deze website is ontwikkeld om inzicht te geven in de daadwerkelijke loopafstanden die inwoners van Warmenhuizen moeten afleggen naar de [aangekondigde](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen) ondergrondse afvalcontainers. Het doel is om bewustwording te creëren over de toegankelijkheid van de containers.

## Context
De gemeente Schagen hanteert in haar plan voor Warmenhuizen een maximale afstand van 275 meter tot een container. Echter baseert de gemeente zich op een afstand hemelsbreed gemeten en niet de daadwerkelijke loopafstand! Verder geeft de gemeente aan dat in "uitzonderlijke gevallen de afstand iets groter kan zijn", maar in deze analyse blijkt dat een aanzienlijk deel van de bewoners meer dan 275 meter moet lopen. Uit officiële evaluaties in andere gemeenten blijkt echter dat de ervaren loopafstand een grote invloed heeft op de tevredenheid van bewoners:

- **Onder 100 meter:** relatief hoge acceptatie, weinig klachten.
- **100–150 meter:** lichte tot matige weerstand.
- **150–275 meter:** duidelijk verhoogde kans op klachten en actieve participatie.
- **Meer dan 275 meter:** grote kans op weerstand, vooral bij ouderen of minder mobiele bewoners.

Deze bevindingen komen uit onderzoeken in gemeenten zoals Woerden, Zeist, Nijmegen en Wageningen en tonen sterke overeenkomsten met de situatie in Warmenhuizen.

## Bronnen
- Evaluatie Woerden: [Omgekeerd inzamelen in Woerden](https://vang-hha.nl/publish/pages/106165/omgekeerd_inzamelen_woerden_2014.pdf)
- Evaluatie Zeist: [Adviesnota RMN Zeist](https://zeist.raadsinformatie.nl/document/7330194/1/01-19RV006_Omgekeerd_inzamelen_afval_-_Bijlage_1_Adviesnota_RMN_omgekeerd_inzamelen_Zeist)
- Evaluatie Nijmegen: [Loopafstanden Nijmegen](https://nijmegen.bestuurlijkeinformatie.nl/Document/View/e23597f6-57b4-4904-8ebd-75554a6d0645)
- Gemeentelijk plan Schagen: [Plaatsing ondergrondse restafvalcontainers Warmenhuizen](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen)

## Methode
De loopafstanden zijn berekend met behulp van OpenStreetMap (OSM) data:

- **Routes:** Kortste looproute van elk woonadres naar de dichtstbijzijnde container.
- **Visualisatie:** Kleuren geven de afstandscategorieën aan.
  - Groen: 0–100 meter
  - Geel: 100–125 meter
  - Oranje: 125–150 meter
  - Rood: 150–275 meter
  - Donkerrood: >275 meter
- **Fallback:** Hemelsbrede afstand wordt weergegeven als een route niet beschikbaar is.
- **Data:** Analyse gebaseerd op 3.615 adressen en 25 containerlocaties in Warmenhuizen volgens [Bewonersboekje Warmenhuizen](https://www.schagen.nl/sites/default/files/2026-04/bewonersboekje-warmenhuizen.pdf)

## Bevindingen
De batchanalyse van Warmenhuizen laat de volgende verdeling zien:

| Afstand | Aantal adressen | Percentage | Kleur op kaart |
|----------|----------------|-----------|----------------|
| 0–100 m | 767 | 21,2% | Groen |
| 100–125 m | 375 | 10,4% | Geel |
| 125–150 m | 354 | 9,8% | Oranje |
| 150–275 m | 943 | 26,1% | Rood |
| >275 m | 1.176 | 32,5% | Donkerrood |

**Conclusie:** Meer dan de helft van de inwoners woont verder dan 150 meter van een container. Dit is de zone waarin de kans op bezwaar of weerstand volgens officiële onderzoeken significant toeneemt.

## Gebruik van de website
- Klik op een container om de hemelsbrede straal en looproutes te bekijken.
- Zoom in tot niveau 16 om individuele huizen te tonen.
- De kleuren geven in één oogopslag de toegankelijkheid en potentiële probleemzones aan.

## Development

```sh
npm run check
npm run build
npm run serve
```

Open `http://127.0.0.1:8000/` after `npm run serve`.

## Data

- `data/container-locations.json` is the editable container source.
- `data/house-coverage.json` is generated coverage output with distance bands, top-3 container rankings, and stored route geometry.
- Browser code reads committed JSON data for container data, coverage, rankings, distance bands, and summary statistics.
- When stored route geometry is missing or invalid for a selected house/container pair, the map may fetch live OSRM route geometry as a visual fallback only.
- Distance bands are based on walking distance: green `0-100 m`, yellow `100-125 m`, orange `125-150 m`, red `150-275 m`, dark red `>275 m`, and gray when no route is available.

Smoke-test the generator without touching committed coverage data:

```sh
npm run generate:smoke
```

Regenerate the full coverage dataset only when intended:

```sh
node scripts/generate-house-coverage.mjs
```

The full generator calls PDOK BAG APIs and OSRM routing services.
It also stores simplified route geometry for the 3 nearest containers per address, so a full run can take a long time.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`, build `dist/`, and deploy that artifact to GitHub Pages.
