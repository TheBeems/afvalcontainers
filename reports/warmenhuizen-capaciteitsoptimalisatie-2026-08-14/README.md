# Capaciteitsgestuurde verdeling ondergrondse restcontainers Warmenhuizen

Datum analyse: 14 augustus 2026

Status: zelfstandig onderzoeksadvies; zoekzones, geen uitvoeringsontwerp

## Advies in het kort

Het op circa 75 huishoudens gestuurde voorstel bestaat uit **36 fysieke restcontainers**:

- alle **11 bestaande containers blijven exact staan**, met behoud van hun bestaande toegangsrechten;
- **WH23 en WH24 blijven privé** voor samen zeven adressen uit de repository-allowlists;
- bij de negen bestaande openbare containers komen **25 nieuwe openbare containers**;
- de openbare vraag van 2.572 BAG-woonadresproxies wordt over 34 openbare containers verdeeld: gemiddeld **75,6 adressen per openbare container**;
- iedere nieuwe locatie krijgt in de modeltoewijzing **60 tot en met 90 adressen**.

“Ongeveer 75” is hier een **zacht gemiddelde**:

`round(2.572 / 75) = 34 openbare containers`

Met negen bestaande openbare containers betekent dit 25 nieuwe. Inclusief de twee private containers komt het fysieke totaal op 36. Als 75 als harde bovengrens wordt bedoeld, geeft `ceil(2.572 / 75)` een rekenkundige ondergrens van 35 openbare containers, dus **26 nieuwe en 37 fysiek totaal**. Voor die telling zijn geen 26 locaties geselecteerd en is geen maximum-75-toewijzing doorgerekend.

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
| Bestaand openbaar | 9 | 9 | 0 |
| Nieuw openbaar | 21 | 25 | +4 |
| Openbare locaties | 30 | 34 | +4 |
| Totaal inclusief twee private locaties | 32 | 36 | +4 |
| Gemiddelde openbare belasting | 85,73 | 75,65 | −10,09 |
| Gemiddelde modelafstand | 186,5 m | 143,2 m | −43,3 m |
| P95-modelafstand | 407,7 m | 301,6 m | −106,1 m |
| Openbare adressen boven 275 m | 472 | 176 | −296 |
| Totale eenrichtingsmodelafstand | 479.676,2 m | 368.271,7 m | −23,22% |

Dit is een verplichte één-op-één-toewijzing binnen de gekozen 60–90-band. Zij vergelijkt de capaciteitseis consistent, maar voorspelt niet welke bak bewoners feitelijk gebruiken. Het advies gebruikt bovendien vier openbare locaties meer; de winst combineert dus locatiekeuze en extra capaciteit.

De gemeentelijke variant telt de **21 als restafval gedocumenteerde voorstellen**: twintig ondergrondse locaties en WH01 semi-ondergronds. WH26, WH27, WH31 en WH32 zijn in het bewonersboekje GFE-toevoegingen; WH26 en WH27 hebben al een bestaande restcontainer. WH35 is niet in de gemeentelijke publicaties bevestigd en is niet meegeteld.

### Gevoeligheid: ieder adres kiest de dichtstbijzijnde openbare locatie

De gemeentelijke uitleg vermeldt toegang tot de drie dichtstbijzijnde bakken. Zonder feitelijk gebruiks- en vulgraadgedrag kan dat niet exact worden nagebootst. Als optimistische gevoeligheid is daarom ook gerekend zonder capaciteitsbalans, waarbij ieder adres de dichtstbijzijnde geselecteerde openbare locatie kiest. Het verschil tussen beide scenariominima is geen onder- of bovengrens voor werkelijk bewonersgedrag:

| Maatstaf | Gemeente | Dit voorstel | Verschil |
|---|---:|---:|---:|
| Gemiddelde modelafstand | 165,9 m | 136,9 m | −29,0 m |
| P95-modelafstand | 326,5 m | 280,0 m | −46,5 m |
| Openbare adressen boven 275 m | 286 | 132 | −154 |
| Totale eenrichtingsmodelafstand | 426.730,0 m | 352.031,3 m | −17,50% |

Over alle 2.579 adressen, inclusief de zeven private adressen, is de capaciteitsgebalanceerde gemiddelde modelafstand 143,1 m. De kaartverdeling is 902 groen, 337 geel, 332 oranje, 832 rood, 176 donkerrood en nul onbereikbaar.

## Voorgestelde 25 nieuwe zoekzones

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
| WH10 | De Baan 27 | gemeentelijk concept | 52.725356, 4.743320 | 62 | groen |
| M020 | Zigt 28 | eigen zoekanker | 52.716920, 4.743720 | 90 | oranje |
| M093 | ’t Lange Weidje 1A | eigen zoekanker | 52.726556, 4.746074 | 90 | oranje |
| WH13 | Alingterp 2 | gemeentelijk concept | 52.723362, 4.735266 | 90 | oranje |
| M041 | Langedijker 18 | eigen zoekanker | 52.723875, 4.742236 | 90 | oranje |
| M134 | Baljuw 14 | eigen zoekanker | 52.725800, 4.751622 | 72 | oranje |
| M018 | Vierhuizen 5 | eigen zoekanker | 52.725945, 4.737197 | 62 | oranje |
| M100 | Beuninge 31 | eigen zoekanker | 52.720683, 4.729095 | 85 | groen |
| M024 | Oudewal 29 | eigen zoekanker | 52.719566, 4.729399 | 60 | oranje |
| M051 | Zigt 2 | eigen zoekanker | 52.718515, 4.745162 | 86 | oranje |
| WH30 | Molenaarweg 1 | gemeentelijk concept | 52.717790, 4.739241 | 90 | oranje |
| WH02 | Dorpsstraat 13 | gemeentelijk concept | 52.727742, 4.739284 | 60 | oranje |
| M045 | Krankhoorn 37 | eigen zoekanker | 52.721945, 4.735407 | 88 | oranje |
| WH12 | De Negen Geerzen 29 | gemeentelijk concept | 52.722146, 4.746440 | 60 | groen |
| M094 | De Baan 13 | eigen zoekanker | 52.725563, 4.741046 | 60 | oranje |
| M104 | Wonge 36 | eigen zoekanker | 52.721757, 4.728283 | 65 | oranje |
| M157 | Dergmeerweg 65 | eigen zoekanker | 52.728540, 4.743329 | 87 | oranje |

Zeven gemeentelijke conceptzones blijven over: WH02, WH10, WH12, WH13, WH18, WH19 en WH30. De andere achttien zijn zelfstandige zoekzones. De vastgelegde pool bevatte deze 25 plus M154 bij Dergmeerweg 52. [De volledige capaciteitsgebonden leave-one-out-evaluatie](private-access-leave-one-out.json) vergelijkt alle 26 mogelijke afvallers. M154 verwijderen is het beste; M157 verwijderen geeft 1.207,6 m meer totale modelafstand.

[locations.tsv](locations.tsv) en [locations.geojson](locations.geojson) bevatten de uiteindelijke locaties en lasten. [location-screening.json](location-screening.json) is uitsluitend de beoordeelde fysieke voorselectie; modelbelastingen staan bewust alleen in de uitvoerbestanden.

## Bestaande locaties en belasting

| ID | Toegang | Adressen | Opmerking |
|---|---|---:|---|
| WH03 | openbaar | 70 | blijft exact staan |
| WH05 | openbaar | 90 | blijft exact staan |
| WH06 | openbaar | 60 | nabij water/obstakels; bestaand gegeven |
| WH08 | openbaar | 52 | blijft exact staan |
| WH14 | openbaar | 90 | blijft exact staan |
| WH26 | openbaar | 90 | korte gevelafstand in BGT, maar bestaand |
| WH27 | openbaar | 90 | bestaande restcontainer; gemeentelijke toevoeging is GFE |
| WH33 | openbaar | 89 | blijft exact staan |
| WH34 | openbaar | 31 | blijft exact staan; geen kunstmatige minimumlast |
| WH23 | privé | 3 | alleen Pastoor Willemsestraat 9, 131 en 224 |
| WH24 | privé | 4 | alleen Pastoor Willemsestraat 80, 82, 84 en 86 |

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
- de private allowlists van WH23 en WH24 blijven intact;
- ieder openbaar BAG-woonadres wordt binair aan precies één openbare container toegewezen;
- 75 is een zachte BAG-adresproxy, geen liter- of kilogramcapaciteit;
- de gekozen **modelband** voor nieuwe locaties is 60–90; dit is geen formele gemeentelijke beleidsband;
- afstand wordt geschat over een lokale bidirectionele OpenStreetMap-voetgangersgraaf;
- P95, maximum en afstandskleuren worden apart gerapporteerd.

De eerdere kalibratie van die lokale graaf tegen de opgeslagen routeringsdata had een gemiddelde absolute afwijking van 29,9 m en een P95 absolute afwijking van 80,9 m. Afstanden zijn daarom vergelijkbare modeluitkomsten, niet veldnauwkeurige claims. De volledige eindselectie uit de vastgelegde 26-pool is reproduceerbaar; de voorafgaande BGT-bewuste kandidaatzoekgang blijft een beoordeelde input. Dit is geen bewijs van een mondiaal optimaal facility-locationmodel.

De vergelijking tussen gemeente en advies gebruikt uitsluitend de lokale OSM-matrix voor dezelfde 2.572 openbare adressen. Alleen de zeven private rijen op de kaart en in het totaal over 2.579 adressen behouden hun eerder opgeslagen OSRM-route uit `existing-11-household-coverage.json`; die rijen beïnvloeden de scenariovergelijking niet.

De gemeentelijke publicatie met circa 75–100 huishoudens en locatiecriteria geldt voor Hoep Noord/Zuid & Centrum en wordt hier alleen als **gemeentelijk precedent** gebruikt. Binnen dit rapport is 275 m een rapportageband; de Warmenhuizenpagina noemt circa 275 m wel als gemeentelijk streven met mogelijke uitzonderingen.

## Loopafstand en uitschieters

De capaciteitsgebalanceerde modeltoewijzing laat 176 openbare adressen boven 275 m. De model-P95 is 301,6 m en de langste route is 776 m bij Debbemeerweg 39. Door de routemodelafwijking moeten absolute grensgevallen rond 275 m terughoudend worden gelezen.

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

De 25 huidige orthofoto-JPEG’s in `orthophoto/` zijn ongewijzigde PDOK-uitsneden. Het HTML-contactblad legt met CSS een rood doelkruis op het exacte rekenanker; die overlay verandert de bronbestanden niet.

## Scope, groei en tijdshorizon

De 2.579 adressen zijn de BAG-woonfunctieproxies uit de momentopname van 13 augustus 2026 binnen de vastgelegde BRT-bebouwde-komgrens van 1 juli 2025. Van 2.882 woonfunctieadressen in de bredere BAG-woonplaats vallen 303 buiten die scope. Of zij apart moeten worden bediend blijft een beleidskeuze; het model bewijst niet dat zij geen voorziening nodig hebben.

De gemeentelijke projectpagina voor Dergmeerweg noemt 88 woningen. Zonder definitieve adressenlijst kan blind optellen dubbeltellen. Reserveer ruimte voor **één of twee** aanvullende bakken, afhankelijk van netto nieuwe BAG-adressen, ruimtelijke spreiding, afvalvolume en bestaande reserve, en heroptimaliseer daarna. Voor de 153 woningen van Landsheer moet eerst worden vastgesteld welke al in de BAG-snapshot zaten.

## Reproduceerbaarheid

Voer vanuit deze rapportmap de lokale buildketen uit:

1. `node evaluate-private-access-finalists.mjs`
2. `node build-capacity-plan.mjs`
3. `node ../warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-household-coverage-map.mjs --input=household-assignment.json --svg-output=overview-map.svg --html-output=overview-map.html`
4. `node build-orthophoto-contact-sheet.mjs`
5. `node build-standalone-report.mjs`
6. `node build-artifact.mjs`
7. `node validate-capacity-plan.mjs`

Stap 1 vergelijkt alle 26 vastgelegde afvallers en schrijft [private-access-leave-one-out.json](private-access-leave-one-out.json). De keten herbouwt daarna de toewijzingen, locatiebestanden, kaarten en rapportartefacten. [location-screening.json](location-screening.json) en de 26-kandidatenpool zijn beoordeelde inputs; de upstream kandidaatzoekgang en het ophalen van BGT/orthofoto worden niet opnieuw uitgevoerd. `generatedAt`-waarden veranderen bij een herbouw.

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
