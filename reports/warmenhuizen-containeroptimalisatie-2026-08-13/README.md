# Warmenhuizen containeroptimalisatie

Dit dossier onderzoekt vanaf nul hoe een adresgewogen netwerk van ondergrondse restafvalcontainers voor Warmenhuizen eruit kan zien. De hoofdconclusie is een ontwerpmaximum van 225 meter, met 275 meter alleen als gemotiveerd uitzonderingsplafond.

## Hoofdproducten

- `warmenhuizen-containeroptimalisatie.html`: zelfstandig, interactief eindrapport met grafieken, bronnen, aannames en alle 43 zoekzones.
- `search-zones-overview.svg`: schaalvaste overzichtskaart van het wegennet en de 8/14/21-luchtfototriage.
- `recommended-search-zones.geojson`: kaartlaag met de 43 exacte analytische ankers, capaciteitsscenario's, eigendomsscreen, luchtfoto-oordeel en lokaal vervolgadvies.
- `hvc-vehicle-requirements.md`: primaire bronnen uit Schagen en andere HVC-gemeenten, plus duidelijk gemarkeerde niet-HVC vergelijkingsmaten.
- `data-quality-audit.md`: onafhankelijke QA en resterende beslisvoorwaarden.

## Beslisstatus

- De afstandsoptimalisatie vindt 43 ankers bij een modelmaximum van 225 meter; de reproduceerbare ondergrens is 31 sites.
- Een capaciteitsmodel voor deze vaste ankers vindt 45 bakken bij maximaal 100 adres-equivalenten per bak en 48 bij 75.
- De luchtfoto/BGT-triage is 8 groen, 14 oranje en 21 rood.
- De 43 coördinaten zijn daarom zoekankers en geen bouwpinnen. Een definitief aantal en een harde 225-metergarantie vereisen een nieuwe optimalisatie op uitsluitend technisch en juridisch goedgekeurde locaties.
- De analyse omvat 2.579 woonfunctie-adressen binnen de gebruikte bebouwde-komgrens; 303 woonfunctie-adressen in de BAG-woonplaats vallen buiten deze scope.

## Reproduceren

```sh
git show 9631171:data/places/warmenhuizen/house-coverage.json \
  | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/optimize-route-graph.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/enrich-distance-sites.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-artifact.mjs
DATA_ANALYTICS_PLUGIN_ROOT=/pad/naar/data-analytics-plugin \
  node reports/warmenhuizen-containeroptimalisatie-2026-08-13/package-report.mjs \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/artifact.json \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/warmenhuizen-containeroptimalisatie.html
```

Voor de laatste stap is de `build-report`-module uit de data-analytics-plugin nodig. Het reeds gegenereerde HTML-rapport is zelfstandig te openen en heeft die plugin niet nodig.

Het optimalisatiescript reconstrueert een voetgangersgraaf uit historisch opgeslagen OSRM-routegeometrieën. Dit is reproduceerbaar, maar geen vervanging voor een actuele volledige routeberekening of een toegankelijkheidsnetwerk voor rolstoel en rollator.
