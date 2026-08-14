# Capaciteitsgestuurde verdeling ondergrondse restcontainers Warmenhuizen

Datum analyse: 14 augustus 2026

Status: zelfstandig onderzoeksadvies; zoekzones, geen uitvoeringsontwerp

## Advies in het kort

De besloten servicevariant bestaat uit **37 fysieke restcontainers**:

- alle **11 bestaande containers blijven exact staan**;
- **WH24 wordt openbaar** op expliciete scenario-instructie; alleen **WH23 blijft privé** voor drie adressen uit de repository-allowlist;
- bij de tien bestaande openbare containers komen **26 nieuwe openbare zoekzones**;
- WH02 wordt vervangen door M055, WH30 door M056 en M082 wordt toegevoegd;
- M027, M044 en M094 blijven behouden;
- de openbare vraag van 2.576 BAG-woonadresproxies wordt over 36 openbare containers verdeeld: gemiddeld **71,6 adressen per openbare container**;
- iedere nieuwe locatie krijgt in de modeltoewijzing **60 tot en met 90 adressen**.

De rekenkundige tellingen bij 75 zijn:

- zacht gemiddelde: `round(2.576 / 75) = 34 openbare containers`;
- maximaal 75: `ceil(2.576 / 75) = 35 openbare containers`.

De gekozen servicevariant gebruikt **36 openbare locaties**, één meer dan de rekenkundige minimumtelling bij maximaal 75. Dat is de expliciete keuze om M094 te behouden en M082 toe te voegen; het is geen claim dat een 36e openbare locatie capaciteitstechnisch noodzakelijk is.

De [interactieve overzichtskaart](overview-map.html) en [statische SVG-kaart](overview-map.svg) gebruiken de repositorykleuren:

- groen: 0–100 m;
- geel: meer dan 100 tot en met 125 m;
- oranje: meer dan 125 tot en met 150 m;
- rood: meer dan 150 tot en met 275 m;
- donkerrood: meer dan 275 m;
- grijs: geen route.

Binnen dit model is 275 meter **geen selectie- of haalbaarheidsgrens**. De kleur blijft zichtbaar als kwaliteits- en gelijkheidsindicator.

## Uitkomst en vergelijking

### Exclusieve capaciteitsgebalanceerde toewijzing

| Maatstaf | Gemeentelijke 21 nieuwe restlocaties | Dit voorstel | Verschil |
|---|---:|---:|---:|
| Bestaand openbaar | 10 | 10 | 0 |
| Nieuw openbaar | 21 | 26 | +5 |
| Openbare locaties | 31 | 36 | +5 |
| Totaal inclusief WH23 privé | 32 | 37 | +5 |
| Gemiddelde openbare belasting | 83,10 | 71,56 | −11,54 |
| Gemiddelde modelafstand | 178,7 m | 134,1 m | −44,6 m |
| P95-modelafstand | 371,2 m | 261,4 m | −109,8 m |
| Openbare adressen boven 275 m | 397 | 88 | −309 |
| Totale eenrichtingsmodelafstand | 460.436,9 m | 345.441,9 m | −24,98% |

Dit is een verplichte één-op-één-toewijzing binnen de gekozen 60–90-band. Zij vergelijkt de capaciteitseis consistent, maar voorspelt niet welke bak bewoners feitelijk gebruiken. Het advies gebruikt bovendien vijf openbare locaties meer; de winst combineert dus locatiekeuze en extra capaciteit.

De gemeentelijke variant telt de **21 als restafval gedocumenteerde voorstellen**: twintig ondergrondse locaties en WH01 semi-ondergronds. WH26, WH27, WH31 en WH32 zijn in het bewonersboekje GFE-toevoegingen; WH26 en WH27 hebben al een bestaande restcontainer. WH35 is niet in de gemeentelijke publicaties bevestigd en is niet meegeteld.

### Gevoeligheid: ieder adres kiest de dichtstbijzijnde openbare locatie

De gemeentelijke uitleg vermeldt toegang tot de drie dichtstbijzijnde bakken. Zonder feitelijk gebruiks- en vulgraadgedrag kan dat niet exact worden nagebootst. Als optimistische gevoeligheid is daarom ook gerekend zonder capaciteitsbalans, waarbij ieder adres de dichtstbijzijnde geselecteerde openbare locatie kiest. Het verschil tussen beide scenariominima is geen onder- of bovengrens voor werkelijk bewonersgedrag:

| Maatstaf | Gemeente | Dit voorstel | Verschil |
|---|---:|---:|---:|
| Gemiddelde modelafstand | 165,1 m | 128,8 m | −36,4 m |
| P95-modelafstand | 321,9 m | 240,4 m | −81,5 m |
| Openbare adressen boven 275 m | 282 | 62 | −220 |
| Totale eenrichtingsmodelafstand | 425.417,1 m | 331.721,0 m | −22,02% |

Over alle 2.579 adressen, inclusief de drie private WH23-adressen, is de capaciteitsgebalanceerde gemiddelde modelafstand 134,1 m. De kaartverdeling is 942 groen, 353 geel, 360 oranje, 836 rood, 88 donkerrood en nul onbereikbaar.

## Effect van de besloten locatieaanpassingen

De referentie is dezelfde WH24-openbare situatie met de vorige 25 nieuwe zoekzones. De besloten variant verlaagt de totale modelafstand met 19.360,3 m, het gemiddelde met 7,5 m en de P95 met 27,1 m. Het aantal openbare adressen boven 275 m daalt van 157 naar 88.

| Focusgebied | Gemiddeld vóór | Gemiddeld na | Boven 275 m vóór | Boven 275 m na |
|---|---:|---:|---:|---:|
| De Fuik | 259,2 m | 159,5 m | 16 | 2 |
| Dorpsstraat, Fabrieksstraat en ’t Eiland | 211,8 m | 171,7 m | 67 | 20 |
| Oostelijke woonwijk | 120,2 m | 110,3 m | 7 | 0 |

- **M055** ligt circa 140 m noordelijk van WH02 en 144 m van M027. Het punt ligt in de eerder geadviseerde zoekrichting, maar de exacte pin is nog niet opnieuw gescreend.
- **M082** ligt nabij Fabrieksstraat 33 en circa 39 m van de eerder oranje beoordeelde zone Fabrieksstraat 29. Onderzoek de noord-/oostelijke grasrand. De kortere M147-pin bij ’t Eiland 2 blijft fysiek rood beoordeeld.
- **M056** ligt circa 68 m oostelijk van WH30, bij Dorsvlegel/Schoffel/Strekel. Deze verschuiving is alleen logisch als M082 de zuidwestelijke functie overneemt.
- **M044** blijft met 90 adressen volledig benut. Zonder M044 loopt WH24 tot 90 adressen op en stijgt de totale modelafstand.
- **M094** blijft behouden. Ten opzichte van de gelijk-aantalvariant zonder M094 daalt het gemiddelde nog 1,7 m en zijn er vier adressen minder boven 275 m.

## Voorgestelde 26 nieuwe zoekzones

Een `WH`-ID verwijst naar een gemeentelijk conceptpunt. Een `M`-ID is een zelfstandig analytisch zoekanker uit de kandidaatpool. De coördinaten zijn **service-ankers voor herberekening, geen graaf- of bouwpinnen**. Oranje vraagt een lokale verschuiving of heeft een onopgelost objectconflict; ook groen is nog niet bouwrijp.

| ID | Referentie | Bron | WGS84 | Adressen | Bureauscreen |
|---|---|---|---|---:|---|
| WH18 | Schelphoek Noord 48 | gemeentelijk concept | 52.721767, 4.731634 | 90 | groen |
| M044 | ’t Jaerlinger 16 | eigen zoekanker | 52.719859, 4.739785 | 90 | oranje |
| M016 | Pastoorsgroet 1 | eigen zoekanker | 52.723078, 4.744687 | 70 | oranje |
| M101 | Dorpsstraat 106 | eigen zoekanker | 52.722612, 4.737705 | 90 | oranje |
| M004 | Dorusakker 9 | eigen zoekanker | 52.720997, 4.727394 | 63 | oranje |
| M149 | De Cres 1 | eigen zoekanker | 52.716315, 4.731552 | 60 | oranje |
| M027 | Hartendorp 4 | eigen zoekanker | 52.727713, 4.738602 | 60 | oranje |
| WH19 | Zwartepad 32 | gemeentelijk concept | 52.720963, 4.733820 | 90 | oranje |
| WH10 | De Baan 27 | gemeentelijk concept | 52.725356, 4.743320 | 61 | groen |
| M020 | Zigt 28 | eigen zoekanker | 52.716920, 4.743720 | 71 | oranje |
| M093 | ’t Lange Weidje 1A | eigen zoekanker | 52.726556, 4.746074 | 90 | oranje |
| WH13 | Alingterp 2 | gemeentelijk concept | 52.723362, 4.735266 | 83 | oranje |
| M041 | Langedijker 18 | eigen zoekanker | 52.723875, 4.742236 | 90 | oranje |
| M134 | Baljuw 14 | eigen zoekanker | 52.725800, 4.751622 | 72 | oranje |
| M018 | Vierhuizen 5 | eigen zoekanker | 52.725945, 4.737197 | 63 | oranje |
| M100 | Beuninge 31 | eigen zoekanker | 52.720683, 4.729095 | 81 | groen |
| M024 | Oudewal 29 | eigen zoekanker | 52.719566, 4.729399 | 60 | oranje |
| M051 | Zigt 2 | eigen zoekanker | 52.718515, 4.745162 | 60 | oranje |
| M056 | nabij Dorsvlegel 36 | eigen zoekanker | 52.717717, 4.740247 | 73 | niet gescreend |
| M055 | nabij De Fuik 25 | eigen zoekanker | 52.728988, 4.738982 | 60 | niet gescreend |
| M045 | Krankhoorn 37 | eigen zoekanker | 52.721945, 4.735407 | 60 | oranje |
| WH12 | De Negen Geerzen 29 | gemeentelijk concept | 52.722146, 4.746440 | 60 | groen |
| M094 | De Baan 13 | eigen zoekanker | 52.725563, 4.741046 | 60 | oranje |
| M104 | Wonge 36 | eigen zoekanker | 52.721757, 4.728283 | 65 | oranje |
| M157 | Dergmeerweg 65 | eigen zoekanker | 52.728540, 4.743329 | 87 | oranje |
| M082 | nabij Fabrieksstraat 33 | eigen zoekanker | 52.718686, 4.738095 | 90 | niet gescreend |

Vijf gemeentelijke conceptzones blijven over: WH10, WH12, WH13, WH18 en WH19. De andere 21 zijn zelfstandige zoekzones. De [eerdere leave-one-out-evaluatie](private-access-leave-one-out.json) documenteert de 25-zone-baseline; de actuele selectie volgt uit de hierboven beschreven, expliciet gekozen locatievarianten.

[locations.tsv](locations.tsv) en [locations.geojson](locations.geojson) bevatten de uiteindelijke locaties en lasten. [location-screening.json](location-screening.json) markeert M055, M056 en M082 expliciet als nog niet integraal gescreend; modelbelastingen staan alleen in de uitvoerbestanden.

## Bestaande locaties en belasting

| ID | Toegang | Adressen | Opmerking |
|---|---|---:|---|
| WH03 | openbaar | 67 | blijft exact staan |
| WH05 | openbaar | 90 | blijft exact staan |
| WH06 | openbaar | 60 | nabij water/obstakels; bestaand gegeven |
| WH08 | openbaar | 52 | blijft exact staan |
| WH14 | openbaar | 84 | blijft exact staan |
| WH24 | **openbaar** | 24 | toegang gewijzigd op expliciete scenario-instructie |
| WH26 | openbaar | 90 | korte gevelafstand in BGT, maar bestaand |
| WH27 | openbaar | 90 | bestaande restcontainer; gemeentelijke toevoeging is GFE |
| WH33 | openbaar | 89 | blijft exact staan |
| WH34 | openbaar | 31 | blijft exact staan; geen kunstmatige minimumlast |
| WH23 | privé | 3 | alleen Pastoor Willemsestraat 9, 131 en 224 |

Aan bestaande openbare locaties is geen minimum van 60 opgelegd. Het maximum van 90 geldt wel voor alle openbare bakken in deze modelgevoeligheid.

## Vertaling van het onderzoek

Het opgegeven artikel is Nevrlý et al., *Location of municipal waste containers: Trade-off between criteria*, Journal of Cleaner Production 278 (2021), 123445, DOI 10.1016/j.jclepro.2020.123445. De casus betreft plasticafval. De multi-objective methode is hier aangepast aan restafval; dat is een methodische vertaling, geen één-op-één overname van operationele parameters.

De auteurs modelleren vier conflicterende criteria:

1. volumegewogen loopafstand;
2. aantal inzamelpunten;
3. aanschafkosten van containers;
4. servicetijd van het inzamelvoertuig.

Voor Warmenhuizen is de methode als volgt aangepast:

- de elf bestaande locaties zijn vooraf geopend en kunnen niet sluiten of verplaatsen;
- WH24 is in dit beslisscenario openbaar; alleen de private allowlist van WH23 blijft intact;
- ieder openbaar BAG-woonadres wordt binair aan precies één openbare container toegewezen;
- 75 is een zachte BAG-adresproxy, geen liter- of kilogramcapaciteit;
- de gekozen **modelband** voor nieuwe locaties is 60–90; dit is geen formele gemeentelijke beleidsband;
- afstand wordt geschat over een lokale bidirectionele OpenStreetMap-voetgangersgraaf;
- P95, maximum en afstandskleuren worden apart gerapporteerd.

De eerdere kalibratie van die lokale graaf tegen de opgeslagen routeringsdata had een gemiddelde absolute afwijking van 29,9 m en een P95 absolute afwijking van 80,9 m. Afstanden zijn daarom vergelijkbare modeluitkomsten, niet veldnauwkeurige claims. De vaste-locatietoewijzing is reproduceerbaar; de expliciet gekozen locaties en de voorafgaande BGT-bewuste kandidaatzoekgang zijn scenario-invoer. Dit is geen bewijs van een mondiaal optimaal facility-locationmodel.

De vergelijking tussen gemeente en advies gebruikt uitsluitend de lokale OSM-matrix voor dezelfde 2.576 openbare adressen. Alleen de drie private WH23-rijen op de kaart en in het totaal over 2.579 adressen behouden hun eerder opgeslagen OSRM-route uit `existing-11-household-coverage.json`; die rijen beïnvloeden de scenariovergelijking niet.

De gemeentelijke publicatie met circa 75–100 huishoudens en locatiecriteria geldt voor Hoep Noord/Zuid & Centrum en wordt hier alleen als **gemeentelijk precedent** gebruikt. Binnen dit rapport is 275 m een rapportageband; de Warmenhuizenpagina noemt circa 275 m wel als gemeentelijk streven met mogelijke uitzonderingen.

## Loopafstand en uitschieters

De capaciteitsgebalanceerde modeltoewijzing laat 88 openbare adressen boven 275 m. De model-P95 is 261,4 m en de langste route is 776 m bij Debbemeerweg 39. Door de routemodelafwijking moeten absolute grensgevallen rond 275 m terughoudend worden gelezen.

Een bestuurlijke gelijkheidsvariant kan één aanvullende bouwbare corridorzone rond **Oudevaart 67–89/Oudewal 59–75** onderzoeken. Dat is een bewuste extra-capaciteitsvariant en moet opnieuw integraal worden doorgerekend.

## Openbare-data- en locatiecontrole

De vastgelegde bureauscreen gebruikt BAG, BGT, PDOK-orthofoto RGB 2026, OpenStreetMap, gemeentelijke conceptbladen, de Schagen-LIOR en het gemeentelijke criteria-precedent. Een orthofoto is geen satellietbeeld. Geen van deze bronnen bewijst zelfstandig bouwbaarheid.

BRK-recherche, HHNK-leggers, AHN, bodemgegevens en KLIC zijn **vervolgcontroles**, geen reeds uitgevoerde integrale vrijgave. Voor iedere nieuwe zone is vóór een plaatsingsbesluit nodig:

1. exacte openbare zoekruimte en eigendom/recht vastleggen;
2. veldinmeting van gevel, bomen, water, zicht, parkeren en toegankelijkheid;
3. KLIC-orientatieverzoek, zo nodig proefsleuven en later een graafmelding;
4. bodem-, grondwater-, draagkracht- en afwateringstoets;
5. HHNK-toets bij water en waterkeringen;
6. HVC-voertuigmal, aslast, stempels, stoppositie en vrije hijslijn;
7. na iedere verschuiving alle routes en lasten opnieuw berekenen.

De 25 aanwezige orthofoto-JPEG’s in `orthophoto/` zijn ongewijzigde PDOK-uitsneden uit de eerdere selectie. Het HTML-contactblad toont de 23 behouden zoekankers en legt met CSS een rood doelkruis op het exacte rekenanker; die overlay verandert de bronbestanden niet. Voor M055, M056 en M082 moet nog een actuele uitsnede en integrale screening worden toegevoegd.

## Scope, groei en tijdshorizon

De 2.579 adressen zijn de BAG-woonfunctieproxies uit de momentopname van 13 augustus 2026 binnen de vastgelegde BRT-bebouwde-komgrens van 1 juli 2025. Van 2.882 woonfunctieadressen in de bredere BAG-woonplaats vallen 303 buiten die scope. Of zij apart moeten worden bediend blijft een beleidskeuze; het model bewijst niet dat zij geen voorziening nodig hebben.

De gemeentelijke projectpagina voor Dergmeerweg noemt 88 woningen. Zonder definitieve adressenlijst kan blind optellen dubbeltellen. Reserveer ruimte voor **één of twee** aanvullende bakken, afhankelijk van netto nieuwe BAG-adressen, ruimtelijke spreiding, afvalvolume en bestaande reserve, en heroptimaliseer daarna. Voor de 153 woningen van Landsheer moet eerst worden vastgesteld welke al in de BAG-snapshot zaten.

## Reproduceerbaarheid

Voer vanuit deze rapportmap de lokale buildketen uit:

1. `node build-wh24-public-column.mjs`
2. `node build-capacity-plan.mjs`
3. `node ../warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-household-coverage-map.mjs --input=household-assignment.json --svg-output=overview-map.svg --html-output=overview-map.html`
4. `node build-orthophoto-contact-sheet.mjs`
5. `node build-standalone-report.mjs`
6. `node build-artifact.mjs`
7. `node validate-capacity-plan.mjs`

Stap 1 herbouwt de WH24-afstandskolom uit dezelfde vastgelegde OSM-graaf. De keten herbouwt daarna de WH24-openbare baseline, de gekozen locatievariant, gevoeligheden, toewijzingen, locatiebestanden, kaarten en rapportartefacten. [private-access-leave-one-out.json](private-access-leave-one-out.json) blijft de historische 25-zone-baseline documenteren. De upstream kandidaatzoekgang en het ophalen van BGT/orthofoto worden niet opnieuw uitgevoerd. `generatedAt`-waarden veranderen bij een herbouw.

[capacity-plan.json](capacity-plan.json) bevat de beslisregels, twee vergelijkingsinterpretaties, locatiebelasting en SHA-256-bronhashes. [household-assignment.json](household-assignment.json) bevat voor ieder adres exact één container, modelafstand en kleurband.

## Bronnen

Wetenschap:

- [Nevrlý et al. (2021), uitgeverspagina](https://www.sciencedirect.com/science/article/pii/S0959652620334909)
- [Nevrlý et al. (2019), openbare voorganger en MILP](https://www.cetjournal.it/index.php/cet/article/view/CET1976093)
- [Khýr (2020), openbare VUT-masterthesis](https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3)
- [Nevrlý (2020), openbare proefschriftcontext](https://dspace.vut.cz/items/92b2a265-204a-4278-9afa-55e98f75b932)

Gemeente en beleid:

- [Gemeentelijke conceptlocaties Warmenhuizen](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen)
- [Bewonersboekje met 25 conceptbladen](https://www.schagen.nl/sites/default/files/2026-04/bewonersboekje-warmenhuizen.pdf)
- [Gemeentelijk locatiecriteria-precedent, 17 februari 2026](https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html)
- [Schagen LIOR deel 2, november 2023](https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf)
- [Dergmeerweg](https://www.schagen.nl/dergmeerweg)
- [Nieuwbouwwijk Landsheer](https://www.schagen.nl/nieuwbouwwijk-landsheer)

Geodata en uitvoering:

- [PDOK BAG OGC API](https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&lang=nl)
- [PDOK BGT OGC API](https://api.pdok.nl/lv/bgt/ogc/v1?f=html&lang=nl)
- [PDOK luchtfoto RGB](https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-)
- [PDOK BRK Kadastrale Kaart](https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1?f=html&lang=nl)
- [Kadaster KLIC](https://www.kadaster.nl/producten/woning/klic-melding)
- [HHNK Legger Wateren](https://www.hhnk.nl/legger-wateren)
- [HHNK Legger Waterkeringen](https://www.hhnk.nl/legger-waterkeringen)
- [AHN](https://www.ahn.nl/ahn-viewer)
- [OpenStreetMap-auteursrecht en licentie](https://www.openstreetmap.org/copyright)
- [OSRM API-documentatie](https://project-osrm.org/docs/v5.24.0/api/)
