# Warmenhuizen containeroptimalisatie

Dit dossier onderzoekt een adresgewogen netwerk van ondergrondse restafvalcontainers voor Warmenhuizen. Alle 11 bestaande HVC-restlocaties blijven verplicht staan. Naast de reproduceerbare basisvariant bevat het dossier nu een afzonderlijke, door de gebruiker bijgestelde afstandssensitiviteit.

## Hoofdproducten

- `warmenhuizen-containeroptimalisatie.html`: zelfstandig interactief eindrapport met conclusies, grafieken, bronnen en een tabel van alle 49 modelpunten.
- `adjusted-fixed-existing-household-coverage-map.html`: actuele zelfstandige offline kaart van de bijgestelde 46-puntsvariant, met alle 2.579 BAG-woonfunctie-adressen in de afstandskleuren van de repo.
- `adjusted-fixed-existing-household-coverage-map.svg`: statische schaalbare versie van die bijgestelde huishoudkaart.
- `adjusted-fixed-existing-household-coverage-225.json`: per adres de routegraafafstand, indicatieve BAG-toegangssensitiviteit, kleurstatus en modelroute.
- `adjusted-fixed-existing-route-optimization.json`: scenario-aannames, expliciete graafbruggen en samenvattende uitkomsten van de bijstelling.
- `adjusted-fixed-existing-225-sites.tsv`: de 35 actieve aanvullende ankers met stabiele A-labels.
- `fixed-existing-household-coverage-map.html` en `.svg`: eerdere basiskaart met 49 punten, bewaard voor vergelijking.
- `fixed-existing-recommended-search-zones.geojson`: kaartlaag met 11 vaste HVC-punten en 38 aanvullende analytische zoekankers.
- `fixed-existing-route-optimization.json`: reproduceerbare scenario-, afstands- en capaciteitsuitkomsten.
- `fixed-existing-household-coverage-225.json`: per adres de gekozen locatie, loopafstand, afstandsstatus en modelroute.
- `fixed-existing-input-audit.md`: audit van de vaste bestaande invoer, inclusief privétoegang van WH23 en WH24.
- `hvc-vehicle-requirements.md`: primaire bronnen uit Schagen en andere HVC-gemeenten, plus duidelijk gemarkeerde niet-HVC vergelijkingsmaten.
- `data-quality-audit.md`: onafhankelijke eindaudit van de gecorrigeerde vaste-invoervariant en de resterende beslisvoorwaarden.

De bestanden `fixed-existing-*` vormen de eerdere vaste-bestaande basisvariant. De nog oudere bestanden `recommended-locations.json`, `recommended-search-zones.geojson` en `search-zones-overview.svg` horen bij de oorspronkelijke vrije 43-nodevariant. Beide blijven bewaard voor reproduceerbaarheid en mogen niet als de bijgestelde kaart worden gelezen.

## Bijgestelde huishoudkaart

- De kaart bevat 11 bestaande HVC-locaties en 35 aanvullende onderzoeksankers: 46 modelpunten totaal. De labels blijven stabiel; A4, A8 en A24 zijn bewust vervallen en de overige A-nummers zijn niet hernummerd.
- WH24 is uitsluitend in deze gebruikersscenario-overname als openbaar gemodelleerd. Alleen WH23 blijft privé voor de geconfigureerde adres-allowlist; de brondata in `container-locations.json` zijn niet aangepast.
- A36 is circa 60 meter noord/noordoost verplaatst. A13 is vervangen door een onbevestigd randanker en is uitdrukkelijk geen goedgekeurde openbare bouwpin.
- De routegraafkern blijft voor alle 2.579 adressen op maximaal 224,5 meter. De eerlijker gekleurde indicatieve afstand telt ook de hemelsbrede BAG-punt-naar-historische-routesnapbenadering mee: gemiddeld 123,9 meter, P95 208,8 meter en maximaal 263,5 meter.
- Daardoor liggen 50 adressen boven het ontwerpdoel van 225 meter, maar geen adres boven 275 meter. De zes kaartbanden tellen 931 / 389 / 410 / 849 / 0 / 0 adressen.
- Dit is een gevoeligheidskaart en geen nieuw bewezen optimum, capaciteitsadvies of plaatsingsbesluit. De toegevoegde korte routeverbindingen, A13, A36, gemeentelijke grond en HVC-bereikbaarheid moeten in het veld en met actuele routing worden bevestigd.

## Basisvariant ter vergelijking

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
git show 9631171:data/places/warmenhuizen/house-coverage.json \
  | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-adjusted-fixed-existing-research.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/validate-adjusted-fixed-existing-output.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/generate-adjusted-fixed-existing-household-coverage-map.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-artifact.mjs
DATA_ANALYTICS_PLUGIN_ROOT=/pad/naar/data-analytics-plugin \
  node reports/warmenhuizen-containeroptimalisatie-2026-08-13/package-report.mjs \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/artifact.json \
  reports/warmenhuizen-containeroptimalisatie-2026-08-13/warmenhuizen-containeroptimalisatie.html
```

Voor de laatste stap is de `build-report`-module uit de data-analytics-plugin nodig. Het reeds gegenereerde HTML-rapport is zelfstandig te openen en heeft die plugin niet nodig.

Het optimalisatiescript reconstrueert een voetgangersgraaf uit historisch opgeslagen OSRM-routegeometrieën. Dit is reproduceerbaar, maar geen vervanging voor een actuele volledige routeberekening of een toegankelijkheidsnetwerk voor rolstoel en rollator.
