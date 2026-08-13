# Ontwikkelen en testen

## Vereisten

- Node.js 24 of hoger
- npm
- Python 3 voor `npm run serve`

Installeer de vastgelegde dependencies met:

```sh
npm ci
```

## Dagelijkse controle

```sh
npm run check
```

Deze opdracht voert achtereenvolgens uit:

1. syntaxcontroles voor JavaScript;
2. Node-unittests;
3. het opnieuw splitsen van bestaande `house-coverage.json`-caches;
4. validatie van plaats-, container- en analysedata;
5. een schone productiebuild naar `dist/`.

De opdracht gebruikt geen PDOK- of OSRM-netwerkverzoeken. De coverage-split hoort bij ongewijzigde brondata idempotent te zijn.

## Lokaal bekijken

```sh
npm run build
npm run serve
```

Open <http://127.0.0.1:8000/>. `npm run check` bevat al een build; na een succesvolle check is een afzonderlijke `npm run build` dus niet nodig.

## Playwright

Installeer Chromium eenmalig:

```sh
npx playwright install --with-deps chromium
```

Voer daarna de browsertests uit:

```sh
npm run test:e2e
```

Playwright bouwt en serveert de statische site zelf. Aanvullende modi:

```sh
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:report
```

## Generator-smoketest

```sh
npm run generate:smoke
```

Deze opdracht analyseert tien adressen en schrijft naar `/tmp/house-coverage.json`. Hij wijzigt geen gecommitteerde coverage-data, maar gebruikt wel de externe PDOK- en OSRM-diensten.

Alle generatoropties zijn zichtbaar met:

```sh
node scripts/generate-house-coverage.mjs --help
```

Voer een volledige generatie alleen uit wanneer de dataset bewust moet worden vernieuwd. Zie [Genereren en deployen](deployment.md).

## Overige scripts

| Opdracht | Doel |
|---|---|
| `npm run check:data` | Alleen JSON- en datasetsamenhang valideren |
| `npm run check:syntax` | Alleen syntaxcontroles uitvoeren |
| `npm run check:unit` | Alleen Node-unittests uitvoeren |
| `npm run generate:coverage-split` | Bestaande volledige caches naar browserdata splitsen |
| `npm run generate:address-indexes` | Adresindexen genereren |
| `npm run generate:story-images` | Responsieve story-afbeeldingen genereren |
| `npm run generate:survey-pdf` | `docs/papieren-enquete.pdf` uit HTML genereren |
| `npm run perf:compare` | Initiële laadprestaties vergelijken |

## Repositorystructuur

- `src/index.html`: vaste paginatemplate.
- `src/styles.css`: CSS-entrypoint; componentstijlen staan in `src/styles/`.
- `src/app/main.js`: browserentrypoint.
- `src/app/domain/`: plaatsdata, containeropslag en rangschikking.
- `src/app/map/`: Leaflet-opbouw en kaartcontrols.
- `src/app/services/`: live routes en Tally-integratie.
- `src/app/ui/`: kaart- en interfacecomponenten.
- `src/shared/`: pure helpers en domeinconstanten voor browser en scripts.
- `scripts/generator/`: implementatie van de coverage-generator.
- `scripts/validation/`: datavalidatie.
- `scripts/build/`: Vite- en statische-sitebuild.
- `tests/unit/`: Node-unittests.
- `tests/e2e/`: Playwright-browsertests.

## Wijzigingsregels voor data

- Bewerk `container-locations.json` handmatig of via de containereditor.
- Bewerk gegenereerde coverage-bestanden niet handmatig, behalve bij een bewuste mechanische migratie.
- Commit `dist/` niet.
- Run bij routinewijzigingen minimaal `npm run check`.
- Run na generatorwijzigingen ook `npm run generate:smoke` en controleer de samenvatting.
