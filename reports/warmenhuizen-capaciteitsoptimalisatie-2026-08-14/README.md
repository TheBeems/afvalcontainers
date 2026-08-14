# Capaciteitsgestuurde verdeling ondergrondse restcontainers Warmenhuizen

Datum analyse: 14 augustus 2026
Status: zelfstandig onderzoeksadvies; zoekzones, geen uitvoeringsontwerp

## Advies in het kort

Mijn capaciteitsminimale voorstel bestaat uit **36 fysieke restcontainers**:

- alle **11 bestaande containers blijven exact staan**;
- **WH24 is openbaar**, conform de expliciete scenarioaanname;
- **WH23 blijft privé** voor de drie adressen uit de bestaande allowlist;
- bij de tien openbare bestaande containers komen **25 nieuwe openbare containers**;
- de openbare vraag van 2.576 BAG-woonadresproxies wordt dus over 35 openbare containers verdeeld: gemiddeld **73,6 adressen per container**;
- iedere nieuwe locatie krijgt in de modeltoewijzing **60 tot en met 90 adressen**. Dat is de gekozen interpretatie van “ongeveer 75”.

De rekenkundige ondergrens is exact:

`ceil(2.576 / 75) = 35 openbare containers`

Omdat tien bestaande containers openbaar zijn, zijn minimaal **25 nieuwe openbare containers** nodig. Met de ene private container WH23 komt het totaal op **36**. Dit ondergrensbewijs zegt alleen iets over aantallen; de locaties en toewijzing zijn daarna op loopafstand gekozen.

De [interactieve overzichtskaart](overview-map.html) en [statische SVG-kaart](overview-map.svg) gebruiken exact de bestaande repositorykleuren:

- groen: 0–100 m;
- geel: 100–125 m;
- oranje: 125–150 m;
- rood: 150–275 m;
- donkerrood: meer dan 275 m;
- grijs: geen route.

De 275 meter is **geen selectie- of haalbaarheidsgrens**. De kleur blijft zichtbaar als kwaliteits- en gelijkheidsindicator.

## Uitkomst en vergelijking

| Maatstaf | Gemeentelijke 21 nieuwe restlocaties | Dit voorstel | Verschil |
|---|---:|---:|---:|
| Bestaand openbaar | 10 | 10 | 0 |
| Nieuw openbaar | 21 | 25 | +4 |
| Openbare locaties | 31 | 35 | +4 |
| Totaal incl. WH23 privé | 32 | 36 | +4 |
| Gemiddelde openbare belasting | 83,10 | 73,60 | −9,50 |
| Gemiddelde loopafstand | 178,7 m | 141,6 m | −37,1 m |
| P95-loopafstand | 371,2 m | 288,5 m | −82,7 m |
| Openbare adressen boven 275 m | 397 | 157 | −240 |
| Totale eenrichtingsloopafstand | 460.436,9 m | 364.802,2 m | −20,77% |

De vergelijking gebruikt voor beide scenario’s hetzelfde voetgangersnetwerk, dezelfde 2.576 openbare adressen en dezelfde 60–90-band. Zij is daardoor een zuivere modelvergelijking. De gemeentelijke variant telt de **21 werkelijk als restafval gedocumenteerde voorstellen**: twintig ondergrondse locaties en WH01 semi-ondergronds. WH26, WH27, WH31 en WH32 zijn in het bewonersboekje GFE-toevoegingen; WH26 en WH27 hebben al een bestaande restcontainer. WH35 is niet gevonden in de gemeentelijke publicaties en is niet meegeteld.

Over alle 2.579 adressen, inclusief de drie private WH23-adressen, is de gemiddelde afstand 141,65 m. De kaartverdeling is 905 groen, 343 geel, 330 oranje, 844 rood, 157 donkerrood en nul onbereikbaar.

## Voorgestelde 25 nieuwe zoekzones

Een `WH`-ID verwijst naar een gemeentelijk conceptpunt. Een `M`-ID is een zelfstandig analytisch zoekanker uit de kandidaatpool. De coördinaten zijn **service-ankers voor herberekening, geen graaf- of bouwpinnen**. Een oranje zone vraagt een lokale verschuiving of heeft een onopgelost objectconflict; ook groen is nog niet bouwrijp.

| ID | Referentie | Bron | WGS84 | Adressen | Desk-screen |
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
| M020 | Zigt 28 | eigen zoekanker | 52.716920, 4.743720 | 90 | oranje |
| M093 | ’t Lange Weidje 1A | eigen zoekanker | 52.726556, 4.746074 | 90 | oranje |
| WH13 | Alingterp 2 | gemeentelijk concept | 52.723362, 4.735266 | 88 | oranje |
| M041 | Langedijker 18 | eigen zoekanker | 52.723875, 4.742236 | 90 | oranje |
| M134 | Baljuw 14 | eigen zoekanker | 52.725800, 4.751622 | 72 | oranje |
| M018 | Vierhuizen 5 | eigen zoekanker | 52.725945, 4.737197 | 61 | oranje |
| M100 | Beuninge 31 | eigen zoekanker | 52.720683, 4.729095 | 84 | groen |
| M024 | Oudewal 29 | eigen zoekanker | 52.719566, 4.729399 | 60 | oranje |
| M051 | Zigt 2 | eigen zoekanker | 52.718515, 4.745162 | 73 | oranje |
| WH30 | Molenaarweg 1 | gemeentelijk concept | 52.717790, 4.739241 | 90 | oranje |
| WH02 | Dorpsstraat 13 | gemeentelijk concept | 52.727742, 4.739284 | 60 | oranje |
| M045 | Krankhoorn 37 | eigen zoekanker | 52.721945, 4.735407 | 73 | oranje |
| WH12 | De Negen Geerzen 29 | gemeentelijk concept | 52.722146, 4.746440 | 60 | groen |
| M094 | De Baan 13 | eigen zoekanker | 52.725563, 4.741046 | 60 | oranje |
| M104 | Wonge 36 | eigen zoekanker | 52.721757, 4.728283 | 65 | oranje |
| M157 | Dergmeerweg 65 | eigen zoekanker | 52.728540, 4.743329 | 87 | oranje |

Er blijven zeven gemeentelijke conceptzones over: WH02, WH10, WH12, WH13, WH18, WH19 en WH30. De andere achttien zijn zelfstandige zoekzones. Door WH24 openbaar te maken kon één van de twee bijna samenvallende Dergmeerweg-ankers vervallen. Een volledige capaciteitsmatching van de vijf beste verwijderingsvarianten kiest het schrappen van M154 en behouden van M157; de omgekeerde keuze geeft 1.207,6 m meer totale loopafstand.

De volledige machinaal leesbare lijst staat in [locations.tsv](locations.tsv) en [locations.geojson](locations.geojson). [location-screening.json](location-screening.json) bevat de gebruikte objectafstanden en belastingen.

## Bestaande locaties en belasting

| ID | Toegang | Adressen | Opmerking |
|---|---|---:|---|
| WH03 | openbaar | 70 | blijft exact staan |
| WH05 | openbaar | 90 | blijft exact staan |
| WH06 | openbaar | 60 | nabij water/obstakels; bestaand gegeven |
| WH08 | openbaar | 51 | blijft exact staan |
| WH14 | openbaar | 84 | blijft exact staan |
| WH24 | **openbaar** | 44 | gewijzigd op expliciete scenarioaanname |
| WH26 | openbaar | 90 | korte gevelafstand in BGT, maar bestaand |
| WH27 | openbaar | 90 | bestaande restcontainer; gemeentelijke toevoeging is GFE |
| WH33 | openbaar | 89 | blijft exact staan |
| WH34 | openbaar | 31 | blijft exact staan; geen kunstmatige minimumlast |
| WH23 | privé | 3 | alleen Pastoor Willemsestraat 9, 131 en 224 |

Ik leg aan bestaande locaties geen minimum van 60 op. Dat zou huishoudens kunstmatig langs een dichterbij gelegen container sturen om een bestaande bak “vol” te rekenen. Het maximum van 90 geldt in deze beleidsgevoeligheid wel voor alle openbare bakken.

## Vertaling van het onderzoek

Het opgegeven artikel is Nevrlý et al., *Location of municipal waste containers: Trade-off between criteria*, Journal of Cleaner Production 278 (2021), 123445, DOI 10.1016/j.jclepro.2020.123445. De publiek bereikbare uitgeverspreview bevestigt een multi-objective mixed-integer linear model met vier conflicterende criteria:

1. volumegewogen loopafstand;
2. aantal inzamelpunten;
3. aanschafkosten van containers;
4. servicetijd van het inzamelvoertuig.

De volledige betaalde dertien pagina’s waren niet legaal openbaar beschikbaar. Voor de exacte modelstructuur zijn daarom ook de openbare primaire auteursbronnen gebruikt: de volledige voorganger uit 2019, de VUT-masterthesis uit 2020 en de eerste-auteursproefschriftcontext. Die bronnen laten onder meer capaciteits-, frequentie- en benuttingsrestricties zien.

Voor Warmenhuizen is de methode als volgt aangepast:

- de elf bestaande locaties zijn vooraf geopend en kunnen niet sluiten of verplaatsen;
- ieder BAG-woonadres wordt binair aan precies één toegankelijke container toegewezen; vraag wordt niet gesplitst;
- “75 huishoudens” is als adresproxycapaciteit gemodelleerd, niet als liter- of kilogramcapaciteit;
- echte voetgangersnetwerkafstand vervangt hemelsbrede afstand;
- WH23 heeft uitsluitend allowlist-randen; WH24 heeft na de scenarioaanpassing openbare randen;
- eerst wordt het minimumaantal nieuwe bakken bepaald, daarna de totale loopafstand;
- P95, maximum en afstandskleuren worden apart gerapporteerd om uitschieters niet te verbergen.

Het resultaat is een capacitated facility-location/p-median-variant. De capaciteitsmatching voor de gekozen locaties is deterministisch en tot 0,01 m auction-epsilon opgelost. De locatiekeuze gebruikt een BGT-bewuste greedy/medoïde lokale zoekgang en een volledige leave-one-out-herberekening na de WH24-wijziging. Dit is de **beste gevonden lokale oplossing**, geen bewijs van mondiaal MILP-optimum.

De studie bevat geen universele 275-meterregel. De 200-metergrens en benuttingspercentages uit de onderliggende Tábor-casus zijn casus-/rekentechnische instellingen en zijn niet als norm geïmporteerd.

## Loopafstand en uitschieters

Het minimaliseren van het minimumaantal bakken en de somafstand laat bewust nog 157 openbare adressen boven 275 m. De grootste groepen liggen aan Dorpsstraat, Fabrieksstraat, De Fuik, Oostwal, Oudevaart en Oudewal. De langste berekende route is Debbemeerweg 39 naar M149: 776 m. Daarna volgen onder meer Oudewal 59–75 en Oudevaart 67.

Dit is geen fout ten opzichte van de opdracht: 275 m is geen harde grens en extra dunbezette bakken zouden de gemiddelde belasting onder het gekozen 75-doel drukken. Voor een bestuurlijke gelijkheidsvariant adviseer ik wel één aanvullende bouwbare corridorzone rond **Oudevaart 67–89/Oudewal 59–75** afzonderlijk te onderzoeken. Die variant moet opnieuw met capaciteit worden doorgerekend; de exacte huidige pinnen daar zijn nog niet bouwkundig vrijgegeven.

## Openbare-data- en locatiecontrole

De bureauscreen combineert:

- BAG-woonfunctieobjecten als huishoudproxy;
- de BGT voor wegdelen, groen/open terrein, panden, water, bomen en vaste objecten;
- PDOK-luchtfoto RGB 2026. Dit is een orthofoto, geen satellietbeeld;
- OpenStreetMap/Overpass voor het voetgangersnetwerk en een indicatie van voertuigbereikbaarheid;
- BRK-perceelgrenzen en de provinciale grootgrondgebruiksscreen als eerste eigendomssignaal;
- gemeentelijke situatietekeningen, formele criteria en LIOR;
- HHNK-leggers, bomenbeleid, AHN en bodemkaarten als vervolglagen.

Geen van deze bronnen bewijst zelfstandig bouwbaarheid. De BGT toont geen kabels, leidingen, wortelvolume, actuele parkeerdruk, juridische titel, draaicurve of kraan-/stempelbelasting. De provinciale eigendomslaag is geen kadastrale recherche. De luchtfoto is een tijdsopname.

Voor iedere nieuwe zone is vóór een plaatsingsbesluit nodig:

1. exacte openbare zoekruimte en eigendom/recht vastleggen;
2. veldinmeting van gevel, bomen, water, zicht, parkeren en toegankelijkheid;
3. KLIC-orientatieverzoek, zo nodig proefsleuven en later een graafmelding;
4. bodem-, grondwater-, draagkracht- en afwateringstoets;
5. HHNK-toets bij water en waterkeringen;
6. HVC-voertuigmal: aanrijden zonder onveilig achteruitrijden, aslast, stempels, vrije hijslijn en niet over geparkeerde auto’s hijsen;
7. na iedere verschuiving opnieuw alle looproutes en belastingen berekenen.

## Groei en tijdshorizon

De 2.579 adressen zijn de BAG-woonfunctieproxies binnen de gebruikte bebouwde-komscope op de vastgelegde momentopname. Van 2.882 woonfunctieadressen in de bredere BAG-woonplaats vallen 303 buiten die scope.

De gemeentelijke projectpagina voor Dergmeerweg noemt 88 woningen. Die zijn niet blind boven op deze momentopname gezet, omdat zonder definitieve adressenlijst dubbeltelling mogelijk is. Reserveer daar ruimtelijk ten minste **twee extra bakken** en heroptimaliseer zodra de adressen authoritative beschikbaar zijn. Voor de 153 woningen van Landsheer moet eerst worden vastgesteld welke al in de BAG-snapshot zaten.

## Reproduceerbaarheid

1. `node build-wh24-public-column.mjs`
2. `node build-capacity-plan.mjs`
3. `node ../warmenhuizen-containeroptimalisatie-2026-08-13/generate-fixed-existing-household-coverage-map.mjs --input=household-assignment.json --svg-output=overview-map.svg --html-output=overview-map.html`
4. `node validate-capacity-plan.mjs`

[capacity-plan.json](capacity-plan.json) bevat de beslisregels, scenariovergelijking, locatiebelasting en SHA-256-bronhashes. [household-assignment.json](household-assignment.json) bevat voor ieder adres exact één container, afstand en kleurband. De scripts weigeren onder meer verschoven bestaande coördinaten, dubbele of ontbrekende adressen, een niet-openbare WH24, een algemene WH23-toewijzing en lasten buiten de gekozen band.

## Bronnen

Wetenschap:

- [Nevrlý et al. (2021), uitgeverspagina](https://www.sciencedirect.com/science/article/pii/S0959652620334909)
- [Nevrlý et al. (2019), openbare voorganger en MILP](https://www.cetjournal.it/index.php/cet/article/view/CET1976093)
- [Khýr (2020), openbare VUT-masterthesis](https://dspace.vut.cz/items/14a2150d-8034-4989-aff8-36ffac9bb5e3)
- [Nevrlý (2020), openbare proefschriftcontext](https://dspace.vut.cz/items/92b2a265-204a-4278-9afa-55e98f75b932)

Gemeente en beleid:

- [Gemeentelijke conceptlocaties Warmenhuizen](https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen)
- [Bewonersboekje met 25 conceptbladen](https://www.schagen.nl/sites/default/files/2026-04/bewonersboekje-warmenhuizen.pdf)
- [Formele locatiecriteria Schagen, 17 februari 2026](https://zoek.officielebekendmakingen.nl/gmb-2026-70811.html)
- [Schagen LIOR deel 2, november 2023](https://www.schagen.nl/sites/default/files/2023-11/Leidraad%20inrichting%20openbare%20ruimte%20%20-%20deel%202%20-%20versie%20nov.pdf)
- [Dergmeerweg](https://www.schagen.nl/dergmeerweg)
- [Nieuwbouwwijk Landsheer](https://www.schagen.nl/nieuwbouwwijk-landsheer)
- [Toekomstige ontsluiting Warmenhuizen-Zuid](https://www.schagen.nl/ontsluiting-warmenhuizen-zuid)

Geodata en uitvoering:

- [PDOK BAG OGC API](https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&lang=nl)
- [PDOK BGT OGC API](https://api.pdok.nl/lv/bgt/ogc/v1?f=html&lang=nl)
- [PDOK luchtfoto RGB](https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-)
- [PDOK BRK Kadastrale Kaart](https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1?f=html&lang=nl)
- [Provincie Noord-Holland BRK-grootgrondgebruik](https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1)
- [Kadaster KLIC](https://www.kadaster.nl/producten/woning/klic-melding)
- [HHNK Legger Wateren](https://www.hhnk.nl/legger-wateren)
- [HHNK Legger Waterkeringen](https://www.hhnk.nl/legger-waterkeringen)
- [Schagen bomenbeleid](https://www.schagen.nl/beleid-en-visie-bomen)
- [AHN](https://www.ahn.nl/ahn-viewer)
- [OpenStreetMap-auteursrecht en licentie](https://www.openstreetmap.org/copyright)
- [OSRM API-documentatie](https://project-osrm.org/docs/v5.24.0/api/)
