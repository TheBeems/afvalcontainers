# Loopafstanden naar aangekondigde ondergrondse restafvalcontainers in de gemeente Schagen

Website te bezoeken op: https://thebeems.github.io/afvalcontainers/

## Inleiding
Deze website is ontwikkeld om per dorpskern van de gemeente Schagen inzicht te geven in de daadwerkelijke loopafstanden die inwoners moeten afleggen naar de aangekondigde ondergrondse restafvalcontainers. Het doel is om de toegankelijkheid van de containers controleerbaar te maken en containerplannen op basis van werkelijke loopafstand te kunnen vergelijken.

Deze repository bevat Warmenhuizen en Tuitjenhorn als voorbeeldkernen, maar kan makkelijk worden uitgebreid naar de dorpskernen Dirkshorn, Sint Maarten, Waarland, Burgerbrug, Oudesluis en Schagerbrug. De code is zo opgezet dat andere dorpskernen kunnen worden toegevoegd via het plaatsmanifest en eigen JSON-datasets.

## Context
De gemeente Schagen kondigt voor Warmenhuizen, Tuitjenhorn en andere dorpskernen ondergrondse restafvalcontainers aan. Binnen de bebouwde kom verdwijnt de grijze restafvalbak bij grondgebonden woningen en moeten bewoners hun restafval naar een ondergrondse container brengen. De gemeente stelt daarbij: “U loopt maximaal ongeveer 275 meter naar een container. In uitzonderlijke gevallen kan de afstand iets groter zijn.” Bewoners krijgen met hun afvalpas toegang tot de drie dichtstbijzijnde containers.

Deze website toetst niet alleen de afstand hemelsbreed, maar vooral de daadwerkelijke loopafstand via wegen en paden. Dat is belangrijk, omdat officiële evaluaties uit andere gemeenten laten zien dat de tevredenheid van bewoners sterk samenhangt met de afstand en moeite die het kost om restafval weg te brengen.

Uit de gevonden onderzoeken komt geen enkel landelijk exact correlatiecijfer naar voren. Gemeenten meten tevredenheid, afstand en bezwaren namelijk op verschillende manieren. De richting is echter opvallend consistent: hoe groter de feitelijke of ervaren loopafstand, hoe lager de tevredenheid en hoe groter de kans op klachten over het systeem.

## Waarom loopafstand ertoe doet
De afstand naar een restafvalcontainer is niet alleen een technische plaatsingsnorm. Voor bewoners is het een dagelijkse gebruiksvoorwaarde. Vooral in dorpen en laagbouwwijken is de verandering groot, omdat bewoners van restafval aan huis naar restafval wegbrengen gaan. De onderzoeken laten steeds dezelfde praktische bezwaren zien:

- **Afstand en fysieke belasting:** bewoners vinden het vervelend of lastig om met restafvalzakken te lopen, vooral ouderen, minder mobiele bewoners en gezinnen met zwaar afval zoals luiers of kattenbakvulling.
- **Verlies van service:** de overgang van een grijze bak aan huis naar een verzamelcontainer voelt voor veel bewoners als een duidelijke achteruitgang in gemak.
- **Volle of vieze containers:** volle containers, storingen, bijplaatsingen en zwerfafval verlagen de tevredenheid sterk.
- **Locatiekeuze en inspraak:** bewoners accepteren containers minder goed wanneer locaties als onlogisch, onveilig of slecht bereikbaar worden ervaren.
- **Kwetsbare groepen:** meerdere evaluaties noemen zorgen over bewoners die slecht ter been zijn of afhankelijk worden van hulp van anderen.

Daarom gebruikt deze website afstandscategorieën die niet alleen aansluiten bij de gemeentelijke norm van ongeveer 275 meter, maar ook bij de zones waarin andere gemeenten duidelijke verschillen in tevredenheid zagen.

## Afstandscategorieën
De kaart gebruikt vijf afstandscategorieën op basis van werkelijke loopafstand:

| Afstand | Betekenis in deze analyse | Kleur op kaart |
|----------|---------------------------|----------------|
| 0–100 m | Laag risico op afstandsklachten. In meerdere onderzoeken blijft tevredenheid relatief hoog wanneer containers dichtbij staan. | Groen |
| 100–125 m | Overgangszone. De afstand is nog beperkt, maar de route en bereikbaarheid worden belangrijker. | Geel |
| 125–150 m | Waarschuwingszone. Rond deze grens hanteerden sommige gemeenten juist een maximale norm om draagvlak te behouden. | Oranje |
| 150–275 m | Verhoogde kans op ontevredenheid. Dit valt binnen de Schagense norm, maar in evaluaties nemen klachten over afstand en gemak hier duidelijk toe. | Rood |
| >275 m | Boven de door Schagen genoemde richtafstand. Deze adressen vragen extra aandacht, zeker wanneer het om werkelijke loopafstand gaat. | Donkerrood |

## Onderzoeksbasis: tevredenheid en loopafstand
Onderstaande onderzoeken vormen de inhoudelijke basis voor de afstandscategorieën en de interpretatie van de kaart. De onderzoeken zijn niet één-op-één vergelijkbaar, maar samen laten ze een duidelijk patroon zien: korte, logische loopafstanden helpen het draagvlak; langere of als lastig ervaren afstanden verlagen de tevredenheid.

| Gemeente / gebied | Type gebied | Bevindingen over tevredenheid en loopafstand | Gehanteerde of besproken afstand | Bron |
|---|---|---|---|---|
| Woerden / Kamerik | Dorps- en wijkpilot | In Kamerik kreeg de proef een laag rapportcijfer. De afstand tot de container was de sterkste voorspeller van algemene tevredenheid. Bewoners die fiets of auto nodig hadden, waren duidelijk minder tevreden dan bewoners die lopend hun afval konden wegbrengen. | In de pilot gemiddeld ongeveer 250 m en maximaal 500 m; later beleid ging richting circa 150 m en maximaal 250 m. | [Omgekeerd inzamelen in Woerden](https://vang-hha.nl/publish/pages/106165/omgekeerd_inzamelen_woerden_2014.pdf) |
| Wageningen | Kleinstedelijk / laagbouw en hoogbouw | Bij laagbouw daalde de waardering voor restafval sterk na de proef. Het wegbrengen van restafval en de afstand naar de verzamelcontainer vielen bij een duidelijke groep bewoners tegen. Hoogbouwbewoners waren minder negatief, omdat zij al meer gewend waren aan verzamelvoorzieningen. | Maximaal 250 m; veel huishoudens zaten binnen 100 m. | [Resultaten het nieuwe inzamelen Wageningen](https://vang-hha.nl/kennisbibliotheek/resultaten-nieuwe/) |
| Nijmegen binnenstad | Stedelijk, maar met concrete afstandscategorieën | Over de loopafstand was een ruime meerderheid tevreden, maar boven 100 m daalde de tevredenheid scherp: bij bewoners die meer dan 100 m moesten lopen was nog maar ongeveer 42% tevreden over de loopafstand. | Feitelijke afstandscategorieën; vooral de grens rond 100 m is relevant. | [Onderzoek ondergrondse restafvalcontainers Nijmegen](https://nijmegen.bestuurlijkeinformatie.nl/Document/View/e23597f6-57b4-4904-8ebd-75554a6d0645) |
| Zeist | Gemeentelijke pilot / omgekeerd inzamelen | Een groot deel van de bewoners vond de afstand acceptabel, maar bewoners die langer onderweg waren of de afstand als te groot ervoeren, rapporteerden vaker moeite met het wegbrengen van restafval. | Maximaal 250 m. | [Adviesnota RMN omgekeerd inzamelen Zeist](https://zeist.raadsinformatie.nl/document/7330194/1/01-19RV006_Omgekeerd_inzamelen_afval_-_Bijlage_1_Adviesnota_RMN_omgekeerd_inzamelen_Zeist) |
| Amersfoort / Nieuwland | Wijkpilot laagbouw | Bij een kortere norm was de acceptatie hoger: ongeveer 70% was tevreden over de gekozen afstand naar de ondergrondse containers. Kritiek ging vooral over praktische uitvoeringspunten zoals ledigingsfrequentie en communicatie. | Maximaal 150 m. | [Resultaten pilot omgekeerd inzamelen Amersfoort](https://vang-hha.nl/kennisbibliotheek/resultaten-pilot-1/) |
| Lisse | Kleinstedelijke gemeente | De afvalinzameling kreeg gemiddeld een voldoende, maar restafval scoorde lager dan andere onderdelen. Bewoners noemden onder meer volle containers, bijplaatsingen en de wens om minder ver te hoeven lopen. | Geen duidelijke vaste norm in het burgeronderzoek; het buitengebied hield restafval aan huis omdat de afstand naar containers te groot was. | [Burgeronderzoek evaluatie afvalbeleid Lisse](https://vang-hha.nl/publish/pages/195170/gemeente-lisse-evaluatie-afvalbeleid_2017-2018-bijlage-2-burgeronderzoek.pdf) |
| Vijfheerenlanden / voormalig Vianen | Kleinstedelijk / meerjarig beleid | In de voormalige gemeente Vianen was veel ontevredenheid over nieuwe restafvalcontainers. Loopafstand, hulpbehoefte en het pas- of tariefsysteem speelden mee in de waardering. | Ongeveer 200 m. | [Tussentijdse evaluatie Waardlanden](https://www.waardlanden.nl/images/Tussentijdse_evaluatie_Strategienota_2021-2025_Waardlanden_def2_copy.pdf) |
| Papendrecht | Kleinstedelijke pilot | Ongeveer de helft van de bewoners was tevreden met omgekeerd inzamelen. In vervolgstukken blijven afstand, draagvlak, communicatie en uitzonderingen voor lastig bereikbare delen belangrijke discussiepunten. | Maximaal 300 m; voor dijkgebied werd maatwerk besproken. | [Evaluatie en voorstel na pilot Papendrecht](https://raad.papendrecht.nl/Documenten/Bijlage-1-Evaluatie-en-voorstel-na-pilot-omgekeerd-inzamelen-Gft-campagne-en-onderzoek-nascheiding.pdf) |
| Hoonhorst / Dalfsen | Dorpse pilot | In de dorpspilot was een ruime meerderheid tevreden over de nieuwe manier van inzamelen. De pilot laat zien dat draagvlak mogelijk is, maar vooral wanneer de uitvoering praktisch werkbaar blijft en bewoners goed worden meegenomen. | In de openbare pilotpassages is geen duidelijke meter-norm gevonden. | [Resultaten afvalbeleid Hoonhorst](https://ris.dalfsen.nl/Vergaderingen/Gemeenteraad/2012/26-november/19%3A30/Afvalbeleid/20121126---6---Afvalbeleid--resultaten-Hoonhorst.pdf) |
| Roosendaal | Stedelijk / restafval op afstand | De evaluatie benoemt dat restafval op afstand draagvlak kan hebben, mits de loopafstand naar de ondergrondse container beperkt blijft. | Geen eenduidige norm in deze samenvatting; de kernbevinding is de voorwaarde van beperkte loopafstand. | [Evaluatie restafval op afstand Roosendaal](https://raad.roosendaal.nl/Vergaderingen/Inspraakbijeenkomst/2019/28-februari/19%3A30/Bijlage-1-Roosendaal-evaluatie-restafval-op-afstand.pdf) |

## Betekenis voor Warmenhuizen en Tuitjenhorn
Voor Warmenhuizen en Tuitjenhorn is vooral de vergelijking met dorpen, laagbouwwijken en kleinstedelijke gemeenten relevant. Daar is de verandering voor bewoners het grootst: de grijze restafvalbak verdwijnt en restafval moet voortaan worden weggebracht.

De belangrijkste les uit de onderzoeken is dat een norm van 275 meter op papier niet automatisch betekent dat de voorziening voor bewoners als bereikbaar of acceptabel wordt ervaren. De werkelijke looproute, het aantal oversteken, de logica van de route, de sociale veiligheid, de kans op volle containers en de fysieke belasting bepalen samen of de afstand redelijk voelt.

Deze website maakt daarom zichtbaar welke adressen binnen de bebouwde kom:

- binnen 100 meter van een container liggen;
- tussen 100 en 150 meter moeten lopen;
- tussen 150 en 275 meter moeten lopen;
- verder dan de door Schagen genoemde richtafstand van ongeveer 275 meter moeten lopen.

Daarmee kan de discussie over de plaatsing van containers concreter worden gevoerd: niet alleen op basis van een kaart met hemelsbrede cirkels, maar op basis van de werkelijke route die bewoners moeten lopen.

## Bronnen

### Gemeente Schagen
- [Plaatsing ondergrondse restafvalcontainers Warmenhuizen](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen)
- [Plaatsing ondergrondse restafvalcontainers Tuitjenhorn](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-tuitjenhorn)

### Tevredenheidsonderzoeken en evaluaties
- [Omgekeerd inzamelen in Woerden](https://vang-hha.nl/publish/pages/106165/omgekeerd_inzamelen_woerden_2014.pdf)
- [Resultaten het nieuwe inzamelen Wageningen](https://vang-hha.nl/kennisbibliotheek/resultaten-nieuwe/)
- [Onderzoek ondergrondse restafvalcontainers Nijmegen](https://nijmegen.bestuurlijkeinformatie.nl/Document/View/e23597f6-57b4-4904-8ebd-75554a6d0645)
- [Adviesnota RMN omgekeerd inzamelen Zeist](https://zeist.raadsinformatie.nl/document/7330194/1/01-19RV006_Omgekeerd_inzamelen_afval_-_Bijlage_1_Adviesnota_RMN_omgekeerd_inzamelen_Zeist)
- [Resultaten pilot omgekeerd inzamelen Amersfoort](https://vang-hha.nl/kennisbibliotheek/resultaten-pilot-1/)
- [Burgeronderzoek evaluatie afvalbeleid Lisse](https://vang-hha.nl/publish/pages/195170/gemeente-lisse-evaluatie-afvalbeleid_2017-2018-bijlage-2-burgeronderzoek.pdf)
- [Tussentijdse evaluatie Waardlanden](https://www.waardlanden.nl/images/Tussentijdse_evaluatie_Strategienota_2021-2025_Waardlanden_def2_copy.pdf)
- [Evaluatie en voorstel na pilot Papendrecht](https://raad.papendrecht.nl/Documenten/Bijlage-1-Evaluatie-en-voorstel-na-pilot-omgekeerd-inzamelen-Gft-campagne-en-onderzoek-nascheiding.pdf)
- [Resultaten afvalbeleid Hoonhorst](https://ris.dalfsen.nl/Vergaderingen/Gemeenteraad/2012/26-november/19%3A30/Afvalbeleid/20121126---6---Afvalbeleid--resultaten-Hoonhorst.pdf)
- [Evaluatie restafval op afstand Roosendaal](https://raad.roosendaal.nl/Vergaderingen/Inspraakbijeenkomst/2019/28-februari/19%3A30/Bijlage-1-Roosendaal-evaluatie-restafval-op-afstand.pdf)

### Data en routebronnen
- [PDOK BAG](https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1)
- [PDOK BRT TOP10NL plaats_multivlak](https://api.pdok.nl/brt/top10nl/ogc/v1/collections/plaats_multivlak?f=html)
- [OpenStreetMap](https://www.openstreetmap.org/)
- [OSRM](https://project-osrm.org/)

## Methode
De loopafstanden worden per dorpskern berekend met behulp van OpenStreetMap (OSM) data:

- **Routes:** kortste looproute van elk woonadres binnen de bebouwde kom naar de dichtstbijzijnde container.
- **Visualisatie:** kleuren geven de afstandscategorieën aan.
  - Groen: 0–100 meter
  - Geel: 100–125 meter
  - Oranje: 125–150 meter
  - Rood: 150–275 meter
  - Donkerrood: >275 meter
- **Fallback:** hemelsbrede afstand wordt weergegeven als een route niet beschikbaar is.
- **Data:** adressen komen uit PDOK BAG, de bebouwde-komgrens uit PDOK BRT TOP10NL en routes uit OSRM op basis van OSM.

## Voorbeeldanalyse Warmenhuizen
De batchanalyse van Warmenhuizen laat de volgende verdeling zien:

| Afstand | Aantal adressen | Percentage | Kleur op kaart |
|----------|----------------|-----------|----------------|
| 0–100 m | 986 | 34,4% | Groen |
| 100–125 m | 374 | 13,0% | Geel |
| 125–150 m | 353 | 12,3% | Oranje |
| 150–275 m | 901 | 31,4% | Rood |
| >275 m | 254 | 8,9% | Donkerrood |

**Conclusie:** 1.155 adressen (40,3%) binnen de bebouwde kom liggen verder dan 150 meter van een container. 254 adressen (8,9%) liggen zelfs boven de door Schagen genoemde richtafstand van ongeveer 275 meter. Juist deze adressen verdienen extra aandacht, omdat evaluaties in andere gemeenten laten zien dat tevredenheid afneemt wanneer de werkelijke of ervaren loopafstand groter wordt.

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

### Playwright

Chromium e2e tests run against the built static site:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

Use `npm run test:e2e:headed` for a headed browser, `npm run test:e2e:ui` for the Playwright UI, and `npm run test:e2e:report` to reopen the HTML report. On WSL2 ARM64, install only Chromium first unless you intentionally need broader browser coverage.

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
