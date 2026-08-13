# Warmenhuizen – verdeling van ondergrondse restcontainers

Peildatum openbare bronnen: 14 augustus 2026. Dit dossier maakt drie interpretaties van “uitgaan van de bestaande 11” expliciet:

1. de huidige elf repositorylocaties behouden;
2. precies elf assets theoretisch vrij herverdelen;
3. de elf behouden en aanvullen tot de gemeentelijke service-intentie van maximaal ongeveer 275 meter.

## Hoofdconclusie

Precies elf assets zijn onvoldoende voor dorpsbrede dekking rond 275 meter. De huidige elf laten in het gebruikte historische routemodel 1.291 van 2.579 BAG-woonadresproxies boven 275 meter. In een afzonderlijke lokale OSM-berekening blijven bij vrije herverdeling van precies elf punten 1.125 adressen boven 275 meter. Dat tweede getal is door de andere routebasis geen numeriek gemeten verbetering ten opzichte van de nulmeting; beide scenario’s missen de service-intentie ruimschoots.

Voor ruimtelijke reservering komt de behoudvariant uit op ongeveer 34 locaties: elf bestaand plus 23 aanvullende zoekzones. Het aantoonbare modelinterval is 29–34 totaal. Dit is geen bouwplan: van de 23 exacte rekenankers zijn er in de PDOK-luchtfoto/BGT-bureauscreen 2 groen, 7 oranje en 14 rood. De rode ankers moeten materieel worden verplaatst en daarna opnieuw worden gerouteerd.

“Locatie”, “asset” en “fysieke bak” zijn niet hetzelfde. Als de vraag letterlijk elf fysieke bakken bedoelt, ontbreekt een betrouwbare capaciteitstoets. Zelfs de uitsluitend illustratieve grenzen van 100 en 75 adresproxies per bak vragen nominaal minimaal 26 respectievelijk 35 bakken; de dichtstbijzijnde-toewijzing van het exact-11-scenario vraagt door lokale piekbelasting 33 respectievelijk 40 bakken. Zonder afvalvolume, bakvolume, vulgraad en ledigingsregime is dit geen operationeel advies.

Het onderzoek van Nevrlý et al. optimaliseert volumegewogen loopafstand, aantal inzamelpunten, servicetijd van het inzamelvoertuig en aanschafkosten. Lokale afvalvolumes, HVC-servicetijden en integrale kosten ontbreken openbaar. Het dossier is daarom een scenariostudie en geen bewezen viercriteria-optimum.

## Resultaten openen

- [`warmenhuizen-containeroptimalisatie.html`](warmenhuizen-containeroptimalisatie.html) — primair, zelfvoorzienend onderzoeksrapport.
- [`existing-11-household-coverage-map.html`](existing-11-household-coverage-map.html) — interactieve nulmeting met de huidige elf locaties.
- [`exact-11-reallocation-map.html`](exact-11-reallocation-map.html) — theoretische herverdeling van precies elf assets.
- [`recommended-275-household-coverage-map.html`](recommended-275-household-coverage-map.html) — ruimtelijke behoeftekaart: elf behouden plus 23 zoekzones.
- [`recommended-275-search-zones.geojson`](recommended-275-search-zones.geojson) — GIS-uitwisseling van dezelfde 34 punten.

De kaarten gebruiken de repositorykleuren: groen ≤100 m, geel 100–125 m, oranje 125–150 m, rood 150–275 m, donkerrood >275 m en grijs zonder route. Iedere huishoudregel in de scenario-JSON bevat bovendien de drie dichtstbijzijnde toegankelijke locaties; de kaart toont alleen nummer één.

## Kernbestanden

- `artifact.json` — canonieke rapportmanifestatie en datasets.
- `existing-11-household-coverage.json` — huishoudtoewijzing voor de huidige elf.
- `exact-11-reallocation.json` — reproduceerbare lokale exact-11-zoekuitkomst.
- `walking-matrix.json` — vastgelegde OSM-loopafstandsmatrix voor 2.579 adressen en 207 kandidaatrecords op 186 unieke coördinaten.
- `fixed-existing-household-coverage-275.json` — huishoudtoewijzing voor elf plus 23 zoekzones.
- `fixed-existing-route-optimization.json` — afstandsdrempelgevoeligheid en onder-/bovengrenzen.
- `hvc-existing-audit-2026-08-14.json` — live dry-run tegen de publieke adresafhankelijke HVC-respons.
- `aerial-bgt-screen-275.json` en `aerial-275/` — 2026 PDOK-luchtfoto’s en BGT-objectafstanden.
- `ownership-screen-275.json` — openbare provinciale BRK-grootgrondgebruiksscreen.
- `feasibility-screen-275.json` — locatiespecifieke groene/oranje/rode bureaubeoordeling.

## Reproduceren

De behoudscenario’s gebruiken een historische routegeometriesnapshot omdat de actuele compacte dekking geen routegeometrieën bevat:

```sh
git show 9631171:data/places/warmenhuizen/house-coverage.json \
  | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/optimize-with-fixed-existing.mjs --supplemental-only
```

De exact-11-uitkomst wordt opnieuw berekend en controleert de lokale loopmatrix met SHA-256:

```sh
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-exact-11-reallocation.mjs
```

Genereer de drie kaarten met `generate-fixed-existing-household-coverage-map.mjs` en de juiste `--input`, `--svg-output` en `--html-output` opties. Bouw daarna het rapport:

```sh
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-artifact.mjs
node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-portable-report.mjs
```

De lokale rapportbouwer gebruikt de canonieke Data Analytics-builder, SVG-extractor en desktop-/mobielverificator. Hij past één gerichte reader-CSS-correctie toe: de sticky bovenbalk gebruikt de breedte van het inhoudsblok in plaats van scrollbar-gevoelige `100vw`. Tabellen houden hun eigen horizontale scrollgedrag.

`walking-matrix.json` is vastgelegd zodat de exact-11-selectie uit een schone checkout opnieuw kan worden berekend. Het script controleert zowel die matrix als de gebruikte BAG-dekking met SHA-256. De 207 kandidaatrecords bevatten 186 unieke coördinaten; dubbele coördinaten kunnen verschillende herkomstlabels hebben. De oorspronkelijke OSM-download- en kandidaatpoolconstructie blijven momentopnamen van openbare bronnen, maar de gerapporteerde selectie en metriek zijn met de vastgelegde matrix reproduceerbaar.

## Besluitgrens

Geen aanvullend punt in dit dossier is uitvoeringsgereed. Een definitieve locatieset vereist minimaal veldinmeting, volledige eigendoms-/rechtencontrole, KLIC, bodem- en wateronderzoek, boom-/parkeer-/verkeersanalyse, een HVC-voertuigmal en herroutering na iedere verplaatsing. Daarna kan de viercriteria-MILP met echte volume-, tijd- en kostendata worden opgelost.
