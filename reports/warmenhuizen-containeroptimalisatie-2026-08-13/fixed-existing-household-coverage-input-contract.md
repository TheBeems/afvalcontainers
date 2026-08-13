## Inputcontract voor de huishoudendekkingskaart

De generator `generate-fixed-existing-household-coverage-map.mjs` leest standaard `fixed-existing-household-coverage-225.json` uit dezelfde map en schrijft een zelfstandige SVG en HTML. Aanroepen:

```sh
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-household-coverage-map.mjs
```

### Vereist scenario

De voorkeursvorm is:

```json
{
  "maximumWalkingDistanceM": 225,
  "mandatoryExistingIds": ["WH03", "WH05"],
  "selectedSites": [
    {
      "id": "WH03",
      "role": "existing",
      "lat": 52.72721,
      "lon": 4.741939,
      "address": "Rietzangerstraat 17",
      "capacityUnits": 1
    },
    {
      "id": "foot-node-123",
      "role": "additional",
      "lat": 52.72,
      "lon": 4.74,
      "address": "zoekzone bij Voorbeeldstraat 1",
      "capacityUnits": 1
    }
  ],
  "households": [
    {
      "houseId": "BAG-adres-id",
      "walkingDistanceM": 121.4,
      "assignedContainerId": "WH03"
    }
  ]
}
```

Randvoorwaarden:

- `selectedSites` bevat iedere gekozen locatie één keer. Bakken per locatie komen voor de tabel uit de scenario-brede `capacitySensitivity`; markericonen blijven rolsymbolen.
- Elke locatie heeft een stabiel `id`, coördinaten en `role` (`existing` of `additional`). Een bestaand ID in `mandatoryExistingIds` wordt ook zonder expliciete rol als bestaand herkend.
- `households` bevat exact één rij voor elk van de 2.579 adressen in `data/places/warmenhuizen/house-coverage.json`.
- `houseId` moet naar het BAG-adres-ID verwijzen. `walkingDistanceM` is de berekende netwerkafstand; `null` in combinatie met `unreachable: true` betekent geen route.
- De kaart classificeert exact volgens de bestaande repo-grenzen: `≤100`, `>100–≤125`, `>125–≤150`, `>150–≤275`, `>275`, en geen route.

### Ondersteunde compacte vorm

In plaats van `households` mag het resultaat `houseIds`, `walkingDistancesM` en optioneel `assignedContainerIds` als parallelle arrays bevatten. De afstandenarray moet exact even lang zijn als het BAG-huishoudenbestand. Ook geneste velden onder `solution` worden herkend. De concrete optimizeruitvoer mag de equivalente velden `locations`, `houses`, `kind` en `nearestLocationId` gebruiken.

Voor de kolom `Bakken (modelgevoeligheid)` bevat `capacitySensitivity` een haalbare variant voor 100 en voor 75 `capacityPerContainerAddressEquivalents`. Iedere locatie begint in dit model met één bak; `extraContainersByLocation` bevat alleen de extra bakken. Dit zijn BAG-adresequivalenten en geen bestand van actieve afvalpassen, gemeten afvalmassa, aanbiedfrequentie of vulgraad.

Als `selectedSites` ontbreekt, kan `selectedCandidateIds` worden gebruikt. De generator zoekt coördinaten en adresreferenties dan op in `walking-matrix.json` en herkent bestaande repo-containers via `container-locations.json`. Expliciete locaties blijven de voorkeur, omdat dit het scenario controleerbaar en draagbaar maakt.

### Output en interpretatie

- `fixed-existing-household-coverage-map.svg`: statische, schaalbare dossierkaart met ingebedde wegvectoren en tooltips.
- `fixed-existing-household-coverage-map.html`: zelfstandige offline HTML met dezelfde SVG, schakelbare lagen en een locatietabel.
- Bestaande openbare locaties krijgen donkere vierkante markers; bestaande private HVC-locaties blauwe ruitmarkers; aanvullende onderzoekszones paarse ronde markers.
- Markers onderscheiden alleen de locatierol; de capaciteitsgevoeligheid staat in de tabel en tooltip.
- Aanvullende locaties blijven zoekpunten en zijn geen uitvoeringsgerede bouwpinnen.
