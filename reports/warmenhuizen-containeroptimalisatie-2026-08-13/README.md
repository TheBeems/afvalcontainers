# Warmenhuizen containeroptimalisatie

Dit dossier onderzoekt een adresgewogen netwerk van ondergrondse restafvalcontainers voor Warmenhuizen. In de gecorrigeerde variant blijven alle 11 bestaande HVC-restlocaties verplicht staan en worden alleen aanvullende zoekzones geoptimaliseerd.

## Hoofdproducten

- `warmenhuizen-containeroptimalisatie.html`: zelfstandig interactief eindrapport met conclusies, grafieken, bronnen en een tabel van alle 49 modelpunten.
- `fixed-existing-household-coverage-map.html`: zelfstandige offline kaart waarop alle 2.579 BAG-woonfunctie-adressen dezelfde afstandskleuren krijgen als in de repo.
- `fixed-existing-household-coverage-map.svg`: statische schaalbare versie van de huishoudkaart.
- `fixed-existing-recommended-search-zones.geojson`: kaartlaag met 11 vaste HVC-punten en 38 aanvullende analytische zoekankers.
- `fixed-existing-route-optimization.json`: reproduceerbare scenario-, afstands- en capaciteitsuitkomsten.
- `fixed-existing-household-coverage-225.json`: per adres de gekozen locatie, loopafstand, afstandsstatus en modelroute.
- `fixed-existing-input-audit.md`: audit van de vaste bestaande invoer, inclusief privétoegang van WH23 en WH24.
- `hvc-vehicle-requirements.md`: primaire bronnen uit Schagen en andere HVC-gemeenten, plus duidelijk gemarkeerde niet-HVC vergelijkingsmaten.
- `data-quality-audit.md`: onafhankelijke eindaudit van de gecorrigeerde vaste-invoervariant en de resterende beslisvoorwaarden.

De oudere bestanden `recommended-locations.json`, `recommended-search-zones.geojson` en `search-zones-overview.svg` horen bij de oorspronkelijke vrije 43-nodevariant. Zij blijven bewaard als reproduceerbare tussenscreen en mogen niet als het gecorrigeerde advies worden gelezen.

## Gecorrigeerde beslisstatus

- Vaste invoer: 11 bestaande HVC-restlocaties, waarvan 9 openbaar en WH23/WH24 alleen voor hun zeven geconfigureerde privé-adressen.
- Bij een modelmaximum van 225 meter zijn 38 aanvullende zoekankers gevonden: 49 locaties/modelpunten in het scenario, waarvan alleen de 11 bestaande HVC-punten al fysiek zijn.
- De aanvullende packing-ondergrens is 28; inclusief de 11 verplichte locaties ligt het modelminimum dus tussen 39 en 49 locaties. Een exact globaal optimum is niet bewezen.
- Gemiddelde modelafstand is 110,4 meter, P95 194,9 meter en maximum 224,5 meter.
- Op de vaste 49 locaties zijn exact 49 bakken haalbaar bij maximaal 100 adres-equivalenten per bak en 51 bij 75. Dit is geen exploitatieadvies zonder HVC-pas-, tonnage- en vulgraaddata.
- De luchtfoto/BGT-triage van de 38 aanvullingen is 5 groen, 14 oranje en 19 rood.
- De aanvullende coördinaten zijn zoekankers en geen bouwpinnen. Een definitief aantal en een harde 225-metergarantie vereisen een nieuwe optimalisatie op uitsluitend technisch en juridisch goedgekeurde locaties.
- De analyse omvat 2.579 woonfunctie-adressen binnen de gebruikte bebouwde-komgrens; 303 woonfunctie-adressen in de BAG-woonplaats vallen buiten deze scope.

## Reproduceren

```sh
git show 9631171:data/places/warmenhuizen/house-coverage.json \
  | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/optimize-with-fixed-existing.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-household-coverage-map.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-recommended-search-zones.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-artifact.mjs
DATA_ANALYTICS_PLUGIN_ROOT=/pad/naar/data-analytics-plugin \
  node reports/warmenhuizen-containeroptimalisatie-2026-08-13/package-report.mjs \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/artifact.json \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/warmenhuizen-containeroptimalisatie.html
```

Voor de laatste stap is de `build-report`-module uit de data-analytics-plugin nodig. Het reeds gegenereerde HTML-rapport is zelfstandig te openen en heeft die plugin niet nodig.

Het optimalisatiescript reconstrueert een voetgangersgraaf uit historisch opgeslagen OSRM-routegeometrieën. Dit is reproduceerbaar, maar geen vervanging voor een actuele volledige routeberekening of een toegankelijkheidsnetwerk voor rolstoel en rollator.
