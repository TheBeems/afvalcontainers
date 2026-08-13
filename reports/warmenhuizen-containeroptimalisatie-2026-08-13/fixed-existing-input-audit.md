# Audit vaste bestaande restafvalinvoer

Datum: 13 augustus 2026

Scope: uitsluitend de huidige repositorydata; geen nieuwe live HVC-controle.

## Conclusie

Voor een constrained optimalisatie waarin **alle reeds aanwezige HVC-restvoorzieningen behouden moeten blijven**, is de reproduceerbare vaste invoer **11 locaties en 11 in de repository afzonderlijk geïdentificeerde bestaande restcontainers**. Daarvan zijn 9 algemeen toegankelijk in het datamodel en 2 uitsluitend toegankelijk voor de vastgelegde Angelapark-adressen. Er zijn geen bestaande `semi-rest`-stromen.

Dit is een scenario-aanname, geen vastgesteld behoudsbesluit: de repository definieert `existing` wel operationeel als een bestaande rest-/semi-reststroom die tegen HVC-locaties wordt geaudit, maar documenteert niet dat zo'n locatie blijvend moet worden behouden.

| ID | Adres | Coördinaat (lat, lon) | Bestaande restbak in repo | HVC-ID | Toegang |
|---|---|---:|---:|---:|---|
| WH03 | Rietzangerstraat 17 | 52.727210, 4.741939 | 1 | 80799 | algemeen |
| WH05 | Kuipersven 36 | 52.726883, 4.748476 | 1 | 81617 | algemeen |
| WH06 | Soeverein 2 | 52.727578, 4.750383 | 1 | 81653 | algemeen |
| WH08 | Dorpsstraat 89 | 52.725435, 4.739056 | 1 | 81580 | algemeen |
| WH14 | Doorbraak 23 | 52.722411, 4.740981 | 1 | 81206 | algemeen |
| WH23 | Molenaarsweg 7 | 52.720329, 4.738551 | 1 | 80365 | privé Angelapark: alleen Pastoor Willemsestraat 9, 131 en 224 |
| WH24 | Pastoor Willemsestraat 80 | 52.720753, 4.740240 | 1 | 80428 | privé Angelapark: alleen Pastoor Willemsestraat 80, 82, 84 en 86 |
| WH26 | Regelhaalder 42 | 52.718557, 4.741484 | 1 | 80299 | algemeen; daarnaast `gfe:new` |
| WH27 | Zigt 97 | 52.718151, 4.743409 | 1 | 80552 | algemeen; daarnaast `gfe:new` |
| WH33 | Zuiderkruis 36 | 52.729898, 4.748450 | 1 | 81782 | algemeen |
| WH34 | Poolster 25 | 52.730485, 4.750576 | 1 | 81783 | algemeen |

Bronregels per record: `data/places/warmenhuizen/container-locations.json:29-40,56-67,70-81,97-108,176-187,294-315,318-339,355-370,373-388,456-481`.

## Exacte modelinvoer

- Fixeer alle 11 coördinaten als bestaande fysieke restlocaties als behoud inderdaad een harde randvoorwaarde is.
- Geef iedere locatie initieel minimaal één vaste restbak: ieder record bevat één `rest:existing`-stroom en één uniek `hvcContainerId`.
- Laat de 9 locaties zonder `access` voor de algemene vraag meedingen.
- Houd WH23 en WH24 fysiek vast, maar laat ze uitsluitend vraag bedienen die overeenkomt met hun `access.allowedAddresses`. Ze mogen dus niet als openbare dekking voor de rest van Warmenhuizen worden gebruikt (`data/places/warmenhuizen/container-locations.json:306-315,330-339`). De generator past precies deze privétoegang per adres toe (`scripts/generator/house-coverage.mjs:722-731`; `docs/data-pipeline.md:56-58`).
- Modelleer de `gfe:new`-stromen op WH26 en WH27 niet als bestaande restcapaciteit. De bestaande reststroom op diezelfde pin blijft wel vast.

## Volledige status- en afvalstroominventaris

De 35 locatierecords bevatten 37 unieke typestromen:

| Type/status | Aantal stromen | Betekenis voor restoptimalisatie |
|---|---:|---|
| `rest:existing` | 11 | vaste invoer in het behoudscenario |
| `rest:new` | 21 | plan-/repokandidaat, niet bestaand en niet automatisch vast |
| `semi-rest:new` | 1 (WH01) | telt mee als restvoorziening, maar is niet bestaand (`container-locations.json:2-13`) |
| `gfe:new` | 4 | geen restvoorziening; WH26/WH27 zijn gemengd en WH31/WH32 GFE-only |
| `semi-rest:existing` | 0 | geen |

Daarmee zijn er 33 rest-/semi-restlocaties: 11 `existing` en 22 `new`. De 22 nieuwe zijn WH01, WH02, WH04, WH07, WH09-WH13, WH15-WH22, WH25, WH28-WH30 en WH35. WH31 en WH32 zijn de twee GFE-only locaties (`container-locations.json:430-453`).

GFE-only hoort **buiten de doel- en dekkingsfunctie van een rest-/semi-restoptimalisatie**. Dit is expliciet gedocumenteerd: alleen `rest` en `semi-rest` tellen mee, terwijl GFE-only uitsluitend zichtbaar blijft op de kaart (`docs/data-pipeline.md:56-58`; `docs/adding-a-place.md:50`). WH31/WH32 hoeven dus niet als restlocatie te worden gefixeerd. Eventuele civieltechnische of portefeuillebeperkingen door geplande GFE-bakken zijn een afzonderlijke exogene randvoorwaarde.

## Betekenis van `existing` en `new`

Wat wel hard is vastgelegd:

- de toegestane labels zijn `new` = “Nieuw” en `existing` = “Bestaand” (`src/shared/containers.js:7-10`);
- `rest` en `semi-rest` vormen samen de restafvaltypen (`src/shared/containers.js:45-51`);
- de HVC-audit selecteert exact stromen met `status === "existing"` én type `rest`/`semi-rest`, en audit deze tegen HVC-locaties (`scripts/audit-hvc-existing-containers.mjs:63-70,171-175,729-735`);
- bij een zekere match schrijft die audit HVC-coördinaten, HVC-ID en `hvc import (exacte locatie)` terug (`scripts/audit-hvc-existing-containers.mjs:623-640`). Alle 11 records hierboven hebben die HVC-ID en nauwkeurigheidsmarkering.

Wat niet is gedocumenteerd:

- geen schema- of methodedocument definieert de peildatum van `existing`, de formele bron voor `new`, of dat `existing` gelijkstaat aan “blijvend”, “eigendom HVC”, “openbaar beschikbaar” of “niet verplaatsbaar”;
- `docs/data-pipeline.md:58` zegt alleen dat zowel nieuwe als bestaande restafvalcontainers kunnen meetellen;
- er is geen veld voor `retain`, `retire`, buitengebruikstelling, capaciteit, volume of aantal bakken van hetzelfde type op één pin.

Daarom moet vóór een besluitrijpe optimalisatie bij gemeente/HVC worden bevestigd welke van deze 11 nog actief zijn en daadwerkelijk behouden moeten blijven.

## Ambiguïteit over fysieke aantallen

De beste repo-interne telling is **11 bestaande fysieke restbakken**: 11 bestaande reststromen met 11 verschillende HVC-container-ID's. Toch is dit niet hetzelfde als een terrein-inventarisatie:

- `countRestafvalContainers` telt locatierecords met een reststroom, niet het aantal afzonderlijke bakken (`src/shared/containers.js:236-258`);
- de validator verbiedt twee stromen van hetzelfde type binnen één locatierecord (`scripts/validation/data.mjs:177-193`), zodat twee co-gelokaliseerde restbakken niet als twee `rest`-stromen kunnen worden vastgelegd;
- de kaart toont bij een gemengd record alleen het aantal unieke typen (`src/app/ui/container-marker.js:37-42`).

Gebruik dus voor de eerste constrained run één vaste restbak per HVC-ID, maar label dit als **11 in de repo geïdentificeerde bakken**. Vraag HVC vóór capaciteitsbesluiten om een actueel assetbestand met per HVC-ID status, volume, aantal inwerpopeningen, toegankelijkheid en eventuele co-gelokaliseerde bakken.
