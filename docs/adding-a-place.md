# Dorpskern toevoegen

De applicatie onderscheidt geconfigureerde en publiceerbare dorpen:

- Een **geconfigureerd dorp** staat in `data/places.json` en is beschikbaar in de containereditor.
- Een **publiceerbaar dorp** heeft daarnaast alle runtime-data en verschijnt automatisch in kaartkeuze, navigatie, analyses en sitemap.

## 1. Plaatsmanifest

Controleer eerst of het dorp al in `data/places.json` staat. Voeg anders een object toe met minimaal:

```json
{
  "id": "voorbeeld-dorp",
  "name": "Voorbeeld Dorp",
  "containerIdPrefix": "VD",
  "map": {
    "center": [52.7000, 4.7000],
    "zoom": 16
  },
  "sourceUrl": "https://www.schagen.nl/...",
  "seo": {
    "slug": "voorbeeld-dorp",
    "title": "Werkelijke loopafstand naar restafvalcontainers in Voorbeeld Dorp",
    "description": "Bekijk per adres ...",
    "ogDescription": "Interactieve kaart ..."
  }
}
```

Gebruik een stabiele `id` in kebab-case en een unieke hoofdletterprefix. Container-ID's bestaan uit deze prefix en twee cijfers, bijvoorbeeld `VD01`.

De standaardpaden worden automatisch afgeleid van `data/places/<plaats-id>/`; voeg alleen een `paths`-object toe als daarvan bewust wordt afgeweken.

## 2. Containerlocaties

Maak `data/places/<plaats-id>/container-locations.json`. Dit bestand is de handmatig beheerde brondata.

De eenvoudigste manier om een bestand voor te bereiden is de containereditor:

1. Open de kaart.
2. Klik rechtsboven op de knop met het potlood.
3. Kies `Containerdataset voor dorp`.
4. Klik op `Nieuwe container` en daarna op de kaart.
5. Vul ID, adres of omschrijving, afvalstromen en statussen in.
6. Houd een bestaande marker ingedrukt om hem te ontgrendelen en te verslepen.
7. Klik op `Download JSON`.
8. Bewaar de download als `data/places/<plaats-id>/container-locations.json`.

Een dorp zonder bestaande containerdata start in de editor met een lege lijst. GFE-only containers verschijnen op de kaart maar tellen niet mee voor restafval-loopafstanden. Leg privétoegang expliciet vast met `access.allowedAddresses`.

## 3. Coverage genereren

```sh
node scripts/generate-house-coverage.mjs --place=<plaats-id>
```

De generator gebruikt externe PDOK- en OSRM-diensten en kan geruime tijd duren. Standaard schrijft hij:

- `house-coverage.json`;
- `coverage-summary.json`;
- `house-map.json`;
- `address-index.compact.json`;
- `house-details/*.json`.

Routegeometrie wordt standaard niet vooraf opgehaald. Gebruik alleen wanneer dat bewust gewenst is:

```sh
node scripts/generate-house-coverage.mjs --place=<plaats-id> --include-route-geometries
```

Bij zo'n run worden ongewijzigde geometrieën met dezelfde routecachesleutel hergebruikt. `--refresh-routes` negeert de cache en impliceert `--include-route-geometries`.

Zie [Databronnen en berekening](data-pipeline.md) voor het exacte algoritme en de beperkingen.

## 4. Controleren

```sh
npm run check
```

Controleer daarna minimaal:

- of de aantallen en analysegrens plausibel zijn;
- of alle verwachte rest-/semi-restcontainers meetellen;
- of privécontainers alleen voor toegestane adressen kandidaat zijn;
- of het dorp op de gebouwde kaart en analysepagina verschijnt;
- of zoeken en lazy detaildata werken.

## 5. Committen

Commit voor het nieuwe dorp:

- de aanpassing aan `data/places.json`, indien nodig;
- `container-locations.json`;
- `house-coverage.json`;
- `coverage-summary.json`;
- `house-map.json`;
- `address-index.compact.json`;
- `house-details/`.

Commit geen `dist/`.

## 6. Handmatige GitHub Action

Als de coverage later via `.github/workflows/generate-house-coverage.yml` moet kunnen worden vernieuwd, voeg het plaats-ID toe aan de `workflow_dispatch`-keuzelijst. Dit staat los van publiceerbaarheid: de gewone build publiceert ieder dorp met complete runtime-data automatisch.
