
# Loopafstanden naar aangekondigde ondergrondse restafvalcontainers in de gemeente Schagen

Website te bezoeken op: https://thebeems.github.io/afvalcontainers/

## Inleiding
Deze website is ontwikkeld om per dorpskern van de gemeente Schagen inzicht te geven in de daadwerkelijke loopafstanden die inwoners moeten afleggen naar de aangekondigde ondergrondse afvalcontainers. Het doel is om bewustwording te creëren over de toegankelijkheid van de containers en om containerplannen op basis van loopafstand te kunnen vergelijken.

Deze repository bevat Warmenhuizen en Tuitjenhorn als voorbeeldkernen, maar kan makkelijk worden uitgebreid naar de dorpskernen Dirkshorn, Sint Maarten, Waarland, Burgerbrug, Oudesluis en Schagerbrug. De code is zo opgezet dat andere dorpskernen kunnen worden toegevoegd via het plaatsmanifest en eigen JSON-datasets.

## Context
De gemeente Schagen hanteert in haar aangekondigde plannen voor ondergrondse restafvalcontainers een maximale afstand van 275 meter tot een container. Echter baseert de gemeente zich vaak op een afstand hemelsbreed gemeten en niet de daadwerkelijke loopafstand. Uit officiële evaluaties in andere gemeenten blijkt dat de ervaren loopafstand een grote invloed heeft op de tevredenheid van bewoners:

- **Onder 100 meter:** relatief hoge acceptatie, weinig klachten.
- **100–150 meter:** lichte tot matige weerstand.
- **150–275 meter:** duidelijk verhoogde kans op klachten en actieve participatie.
- **Meer dan 275 meter:** grote kans op weerstand, vooral bij ouderen of minder mobiele bewoners.

Deze bevindingen komen uit onderzoeken in gemeenten zoals Woerden, Zeist, Nijmegen en Wageningen en vormen de context voor de analyses in deze repository.

## Bronnen
- Evaluatie Woerden: [Omgekeerd inzamelen in Woerden](https://vang-hha.nl/publish/pages/106165/omgekeerd_inzamelen_woerden_2014.pdf)
- Evaluatie Zeist: [Adviesnota RMN Zeist](https://zeist.raadsinformatie.nl/document/7330194/1/01-19RV006_Omgekeerd_inzamelen_afval_-_Bijlage_1_Adviesnota_RMN_omgekeerd_inzamelen_Zeist)
- Evaluatie Nijmegen: [Loopafstanden Nijmegen](https://nijmegen.bestuurlijkeinformatie.nl/Document/View/e23597f6-57b4-4904-8ebd-75554a6d0645)
- Gemeentelijk plan Schagen: [Plaatsing ondergrondse restafvalcontainers Warmenhuizen](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen)
- Bebouwde-komgrens: [PDOK BRT TOP10NL plaats_multivlak](https://api.pdok.nl/brt/top10nl/ogc/v1/collections/plaats_multivlak?f=html)

## Methode
De loopafstanden worden per dorpskern berekend met behulp van OpenStreetMap (OSM) data:

- **Routes:** Kortste looproute van elk woonadres binnen de bebouwde kom naar de dichtstbijzijnde container.
- **Visualisatie:** Kleuren geven de afstandscategorieën aan.
  - Groen: 0–100 meter
  - Geel: 100–125 meter
  - Oranje: 125–150 meter
  - Rood: 150–275 meter
  - Donkerrood: >275 meter
- **Fallback:** Hemelsbrede afstand wordt weergegeven als een route niet beschikbaar is.
- **Data:** Adressen komen uit PDOK BAG, de bebouwde-komgrens uit PDOK BRT TOP10NL en routes uit OSRM op basis van OSM.

## Voorbeeldanalyse Warmenhuizen
De batchanalyse van Warmenhuizen laat de volgende verdeling zien:

| Afstand | Aantal adressen | Percentage | Kleur op kaart |
|----------|----------------|-----------|----------------|
| 0–100 m | 986 | 34,4% | Groen |
| 100–125 m | 374 | 13,0% | Geel |
| 125–150 m | 353 | 12,3% | Oranje |
| 150–275 m | 901 | 31,4% | Rood |
| >275 m | 254 | 8,9% | Donkerrood |

**Conclusie:** 1.155 adressen (40,3%) binnen de bebouwde kom liggen verder dan 150 meter van een container. Dit is de zone waarin de kans op bezwaar of weerstand volgens officiële onderzoeken significant toeneemt.

## Gebruik van de website
- Klik op een container om de hemelsbrede straal te bekijken en klik op een huispunt of zoek je adres om de looproutes te bekijken.
- Zoom in tot niveau 16 om individuele huizen te tonen.
- De kleuren geven in één oogopslag de toegankelijkheid en potentiële probleemzones aan.

## Development

```sh
npm run check
npm run build
npm run serve
```

Open `http://127.0.0.1:8000/` after `npm run serve`.

## Repository structure

- `src/index.html` contains the fixed page structure.
- `src/styles.css` is the CSS entrypoint and imports focused CSS modules from `src/styles/`.
- `src/app/main.js` is the Vite browser entrypoint. Feature code lives in `src/app/domain/`, `src/app/map/`, `src/app/services/`, and `src/app/ui/`.
- `src/shared/` contains pure helpers and constants reused by the browser app and Node scripts.
- `scripts/build-site.mjs`, `scripts/validate-data.mjs`, and `scripts/generate-house-coverage.mjs` remain the public CLI entrypoints; their implementation modules live under `scripts/build/`, `scripts/validation/`, and `scripts/generator/`.

## Data

- `data/places.json` is the manifest for configured villages, their map defaults, data paths, source URL, and container ID prefix.
- `data/places/warmenhuizen/container-locations.json` is the editable Warmenhuizen container source.
- `data/places/warmenhuizen/house-coverage.json` is the legacy generated Warmenhuizen coverage cache used by scripts and route reuse; it is not copied to `dist/`.
- `data/places/warmenhuizen/coverage-summary.json`, `house-map.json`, `address-index.compact.json`, and `house-details/*.json` are generated browser runtime data split from the coverage cache.
- `data/places/tuitjenhorn/` contains the same dataset types for Tuitjenhorn.
- Browser code initially reads only active-place container data, coverage summary, and house marker data. Address indexes and house route details are lazy-loaded.
- When stored route geometry is missing or invalid for a selected house/container pair, the map may fetch live OSRM route geometry as a visual fallback only.
- Distance bands are based on walking distance: green `0-100 m`, yellow `100-125 m`, orange `125-150 m`, red `150-275 m`, dark red `>275 m`, and gray when no route is available.

## Dorpskern toevoegen

Voeg voor een nieuwe dorpskern een eigen item toe aan `data/places.json`. Gebruik een stabiele `id` in kebab-case, een duidelijke `name`, een unieke `containerIdPrefix`, kaartinstellingen en paden naar de runtime JSON-bestanden voor die kern:

- `container-locations.json`: handmatig beheerde containerlocaties.
- `coverage-summary.json`: samenvatting en metadata voor de analyse.
- `house-map.json`: compacte huizenlaag voor kaartmarkers.
- `address-index.compact.json`: compacte lazy zoekindex voor adressen.
- `house-details/`: lazy straatgebundelde detailbestanden met maximaal 75 adressen per bestand.

Maak daarna de map `data/places/<plaats-id>/` aan en voeg daar minimaal `container-locations.json` toe. Container-ID's moeten de opgegeven prefix gebruiken, bijvoorbeeld `WH01` voor Warmenhuizen of `TH01` voor Tuitjenhorn. Zie de aankondiging voor jouw dorp op de website van de gemeente Schagen.

Genereer vervolgens de analyse en zoekindex:

```sh
node scripts/generate-house-coverage.mjs --place=<plaats-id>
npm run generate:coverage-split
npm run check
```

De generator gebruikt de plaats uit `data/places.json`, haalt adressen en de bebouwde-komgrens op via PDOK, berekent loopafstanden via OSRM, schrijft de legacy coverage-cache en splitst die naar de browserdata. Commit de brondata en gegenereerde JSON-bestanden voor de dorpskern; commit geen `dist/` output.

Smoke-test the generator without touching committed coverage data:

```sh
npm run generate:smoke
```

Regenerate the full coverage dataset only when intended:

```sh
node scripts/generate-house-coverage.mjs --place=warmenhuizen
```

The full generator calls PDOK BAG, PDOK BRT TOP10NL, and OSRM routing services.
It batches OSRM distance-table requests and stores the 3 nearest containers per address.
Route geometry is skipped by default; the map fetches missing route lines through live OSRM fallback when an address is selected.
Use `--include-route-geometries` only when you intentionally want to prefetch and store simplified route geometry for the 3 nearest containers per address.
After a route-geometry run with route cache keys, unchanged route geometries are reused automatically; use `--refresh-routes` to force a full route refresh.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`, build `dist/`, and deploy that artifact to GitHub Pages.
