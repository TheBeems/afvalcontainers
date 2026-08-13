# Onafhankelijke data-quality-audit Warmenhuizen

Auditdatum: 13 augustus 2026
Doel: beoordelen of de analyse al besluitrijp is voor een uitspraak over maximaal 225 meter, 43 locaties en 45/48 fysieke containers.
Beoordeelde hoofdbronnen: de actuele Warmenhuizen-dekking in `data/places/warmenhuizen`, de analysebestanden in deze rapportmap, de twee luchtfoto-audits en de openbare eigendoms- en HVC-bronnotitie.

## Eindoordeel

**Niet besluitrijp als lijst met exacte plaatsingslocaties.** De nulmeting is numeriek betrouwbaar en de rekenkundige totalen van de 43-sitevariant en de twee capaciteitsscenario's zijn intern consistent. De hoofdconclusie wordt echter door drie zaken geblokkeerd:

1. de luchtfoto-audit beoordeelt van de 43 analytische ankers slechts 8 als groen, 14 als oranje en 21 als rood;
2. de 43 ankers zijn inmiddels reproduceerbaar, maar de per-adres-toewijzing en de exactheidsbewijzen voor 45/48 bakken zijn nog niet uit bewaarde solvercode te herhalen;
3. de analyse betreft 2.579 woonadressen binnen de bebouwde-kompolygoon, niet alle woonadressen of alle inwoners van Warmenhuizen.

De verdedigbare conclusie is daarom: **225 meter is een bruikbare ontwerpambitie en 43 sites met 45 of 48 bakken is een analytisch scenario op vaste netwerkankers, maar het definitieve aantal en de exacte bouwpinnen zijn nog niet vastgesteld.** Eerst is een nieuwe optimalisatie nodig op uitsluitend visueel en technisch haalbare bouwpinnen, gevolgd door exacte routering vanaf alle adressen.

## Korte hertoets na regeneratie

De op 13 augustus 2026 bijgewerkte analyse lost de belangrijkste reproduceerbaarheids- en publicatiefouten op:

- `optimize-route-graph.mjs` is syntactisch geldig, leest het vastgelegde historische routesnapshot uit commit `9631171` en schrijft een deterministische set-coveruitkomst. Alle 2.579 actuele adres-ID's zijn in dat snapshot aanwezig.
- Het 225-meterscenario in `route-graph-optimization.json` bevat 43 ankers en een geldige packing-ondergrens van 31. De **43 node/coördinaattuples zijn als verzameling exact gelijk aan het TSV-bestand**: geen ontbrekende of extra ankers. Alleen de volgorde verschilt bij de paren sites 7/8, 29/30 en 33/34; dit verandert de set of de uitkomst niet.
- Alle acht frontierwaarden in `artifact.json` komen exact overeen met `route-graph-optimization.json`.
- De huidige afstandsbanden zijn hersteld naar **113 voor 200-225 m** en **217 voor 225-275 m**; beide huidige en voorgestelde bandtotalen sommeren tot 2.579.
- Het geregenereerde artifact bevat 43 sites, 45 bakken bij 100 en 48 bij 75 adres-equivalenten, en de luchtfotosamenvatting 8 groen / 14 oranje / 21 rood. De oude adviesgetallen 53/59 komen niet meer voor.
- `build-artifact.mjs` en `optimize-route-graph.mjs` slagen voor de syntaxcheck. De officiële artifactvalidator accepteert het geregenereerde artifact als geldig.
- De capaciteitstekst begrenst 45/48 nu expliciet tot de **vaste modelmatrix**, noemt ontbrekende passen/tonnage/vulgraad en eist herberekening vóór een investeringsbesluit.
- De hoofdtekst noemt de 43 punten consequent onderzoeksankers, geen bouwpinnen of bouwbesluit, en maakt zichtbaar dat 21 rode ankers moeten worden vervangen en opnieuw gerouteerd.

**Hertoetsconclusie:** de geregenereerde rapportbuild is publiceerbaar als onderzoeksrapport. De eerdere technische publicatieblokkades zijn opgelost. Het blijft nadrukkelijk geen besluitrijpe lijst met 43 fysieke locaties; die inhoudelijke beperking is nu correct in het rapport opgenomen.

Twee reproduceerbaarheidsdetails blijven open maar blokkeren deze onderzoeksrapportage niet: het routescript genereert nog niet de TSV-lasten/percentielen en het bewaarde capaciteitssamenvattingsbestand bevat geen solvercode of per-adres-flow waarmee de geclaimde minimale 45/48 zelfstandig opnieuw kan worden bewezen. Ook zijn de frontierwaarden in `build-artifact.mjs` nog handmatig gespiegeld in plaats van rechtstreeks uit `route-graph-optimization.json` gelezen.

## Dataset en korrel

- De nulmeting heeft als korrel één BAG-adres waarvan het gekoppelde verblijfsobject `woonfunctie` bevat.
- Binnen de gebruikte BRT-bebouwde-kompolygoon zijn 2.579 adressen opgenomen. Van de 2.882 woonfunctie-adressen in de BAG-woonplaats zijn 303 adressen uitgesloten: **10,5%**.
- Een adres heeft gewicht 1. Het model gebruikt geen bewonersaantal, mobiliteitsbeperking, actief HVC-aansluitrecht, afvalvolume of vulgraad.
- Een modelsiteregel is een netwerkanker, niet een ingemeten containerbouwvlak. De 43 sitelasten tellen op tot 2.579 adressen.
- Het referentienetwerk met 33 rest-/semi-restlocaties bestaat uit **11 als bestaand gemarkeerde en 22 als nieuw gemarkeerde locaties**; twee bestaande locaties zijn privé voor Angelapark. Het is dus een plan-/repovariant en niet zonder meer de fysieke huidige situatie.

## Uitgevoerde controles

- herberekening van aantallen, gemiddelde, percentielen en cumulatieve afstandsbanden uit `house-coverage.json`;
- optelling en domeincontrole van de 43 TSV-siteregels, unieke sitenummers, netwerkknopen, lasten en maxima;
- reconciliatie van `capacitated-solution.json`, `recommended-locations.json` en `artifact.json`;
- onafhankelijke telling van positieve eigendomshits en OSM-voertuigfilters;
- consolidatie van beide luchtfoto-audits en visuele steekproef op sites 1, 4, 24 en 31;
- controle van scope, modelbeperkingen, bewijsbestanden en rapportformuleringen.

## Cijfers die wel zijn bevestigd

| Onderdeel | Bevestigde uitkomst | QA-oordeel |
|---|---:|---|
| Opgenomen woonadressen | 2.579 | klopt |
| Afstandsbanden nulmeting | 943 / 349 / 332 / 803 / 152 / 0 | som is 2.579 |
| Gemiddelde nulmeting | 137,275 m, afgerond 137,3 m | klopt |
| P50 / P90 / P95 / P99 | 124,8 / 248,8 / 283,2 / 363,3 m | klopt |
| Maximum nulmeting | 447,5 m | klopt |
| Boven 275 m | 152 adressen, 5,9% | klopt |
| 43-sitebestand | 43 unieke sites en knopen; lasten sommen tot 2.579 | klopt intern |
| Ongecapaciteerd gewogen gemiddelde | 117,523 m, afgerond 117,5 m | herleidbaar uit TSV |
| Ongecapaciteerd maximum | 224,5 m | herleidbaar uit TSV |
| Capaciteitsscenario 100 | 45 bakken; extra bak op sites 1 en 9 | totalen kloppen intern |
| Capaciteitsscenario 75 | 48 bakken; twee extra op site 1 en één extra op sites 4, 9 en 10 | totalen kloppen intern |
| Eigendomsscreen | 40 exacte positieve Gemeente Schagen-hits; 41 met een gemeentelijk eigendomsperceel binnen 25 m | reproduceerbaar |
| Grove OSM-screen | 40 netwerkankers binnen 8 m van een als voertuigroute gefilterde OSM-lijn | reproduceerbaar, maar geen HVC-bewijs |
| Luchtfoto-oordeel | 8 groen, 14 oranje, 21 rood | klopt over beide deelbestanden |

De cumulatieve banden in de capaciteitsscenario's zijn eveneens rekenkundig geldig. Bij 100 aansluit-equivalenten per bak zijn dat 960 binnen 100 m, 1.795 binnen 150 m, 2.428 binnen 200 m en alle 2.579 binnen 225 m. Bij 75 zijn dat 921, 1.707, 2.358 en 2.579.

## Blokkerende bevindingen

### 1. De 43 ankers vormen geen uitvoerbare 43-locatielijst

**Ernst: kritiek. Vertrouwen: hoog.**

De eerste desktop-eigendomsscreen noemt 35 punten voorkeurszoekpunt, maar de latere en informatievere luchtfoto/BGT-screen beoordeelt **21 van de 43 exacte ankers als rood**. Bij meerdere rode punten wordt een verschuiving van 55 tot 120 meter of een volledig andere zone geadviseerd. Voorbeelden zijn Leuneweg, Dorpsstraat 140, Oostwal 63, Oudewal 1, Torenvenplein en Baljuw.

Een dergelijke verschuiving kan de dekking van adressen veranderen en het maximum van 225 meter doorbreken. De huidige tekst gebruikt de marge van 225 naar 250/275 meter als uitvoeringsbuffer, maar dat is niet verenigbaar met een harde belofte van maximaal 225 meter. Een verschoven pin moet opnieuw worden gerouteerd; een afstandsmarge buiten 225 meter bewijst geen 225-meterdekking.

**Vereiste correctie:** presenteer de 43 coördinaten uitsluitend als afstandsoptimale onderzoeksankers. Neem de 8/14/21-verdeling zichtbaar op. Bouw een nieuwe kandidaatset van concrete, kansrijke bouwpinnen en optimaliseer/rerouteer opnieuw onder de grond-, HVC-, water-, boom-, parkeer- en toegankelijkheidsrestricties. Geef pas daarna een definitief locatie- en bakaantal.

### 2. De ankers zijn nu reproduceerbaar; de capaciteitsbewijzen nog niet volledig

**Status na hertoets: grotendeels opgelost. Restrisico: middel. Vertrouwen: hoog.**

`optimize-route-graph.mjs` reproduceert nu de routegraaf, de acht frontierintervallen en de 43 geselecteerde ankers. De 43 node/coördinaattuples zijn setgewijs exact gelijk aan `distance-optimal-sites.tsv`. Het script reproduceert echter nog niet de TSV-lasten, gemiddelde/P95/max per site, de ongecapaciteerde adres-toewijzing of `capacitated-solution.json`. Ook ontbreken de min-cost-flow-toewijzingen en machineleesbare infeasibility-certificaten voor 45/48.

De aanwezige `scenario-results.json` blijft een ander, ouder model. Dat bestand geeft voor 225 meter 56 sites, vier ongedekte adressen en een maximum van 455,4 meter. De bijbehorende `walking-matrix.json` heeft ten opzichte van opgeslagen routes een mediane ratio van 0,846, een gemiddelde absolute fout van 29,9 meter en een P95 absolute fout van 80,9 meter. Deze bestanden bewijzen het latere 43-siteantwoord niet en blijven zonder label verwarrend; `route-graph-optimization.json` is nu de relevante frontierbron.

De uitspraken dat alle 43 mogelijke één-extra-bakvarianten bij capaciteit 100 en duizenden varianten bij capaciteit 75 exact infeasible zijn, blijven plausibel maar zijn in de huidige map niet onafhankelijk controleerbaar. De rapporttekst beperkt deze cijfers nu wel correct tot de vaste modelmatrix en noemt ze geen definitief exploitatieaantal.

**Aanbevolen vervolgstap:** laat het routescript ook de TSV en globale metriektoewijzing genereren; bewaar daarnaast de capaciteits-solvercode, beide per-adresflows en infeasibility-controles. Markeer de oudere 38/56-sitebestanden als exploratief. De huidige formulering “exact voor de vaste modelmatrix” is voldoende afgebakend voor het onderzoeksrapport, maar de exacte minimumclaim blijft een niet-herhaalbaar bewijs totdat de solver is gearchiveerd.

### 3. “Alle inwoners van Warmenhuizen” valt buiten de gemodelleerde scope

**Ernst: hoog. Vertrouwen: hoog.**

De analyse omvat 2.579 adressen binnen de bebouwde kom en sluit 303 woonfunctie-adressen in de BAG-woonplaats uit. Daarnaast is per adres, niet per inwoner, geoptimaliseerd. Daarmee is Pareto-efficiëntie voor alle inwoners niet onderzocht. Ook ontbreekt een aparte toegankelijke-routegraaf voor rolstoel, rollator, veilige oversteek en obstakelvrije stoep.

**Vereiste correctie:** formuleer alle uitkomsten als geldig voor woonadressen binnen de gehanteerde bebouwde-komgrens. Rapporteer voor de 303 uitgesloten adressen expliciet welk inzamelregime of maatwerk geldt. Gebruik “adresgewogen” in plaats van “voor alle inwoners”, of voeg bewoners-/aansluitgewichten en een toegankelijkheidsmodel toe.

### 4. 224,5/224,9 meter is een netwerkmodeluitkomst, geen bewezen werkelijke deur-tot-containerafstand

**Ernst: hoog. Vertrouwen: hoog.**

Vier referentiepunten hebben een BAG-naar-netwerksnap groter dan 50 meter: site 19 (68,4 m), 26 (70,7 m), 42 (61,4 m) en 43 (92,9 m). Site 43 heeft in het TSV zelfs 0,0 meter modelafstand voor zijn ene adres, terwijl de referentiesnap 92,9 meter is. Site 42 rapporteert 224,5 meter modelafstand bij 61,4 meter referentiesnap. Dit toont dat de headline niet als werkelijke deur-tot-bakafstand mag worden gelezen.

De sitecoördinaten liggen bovendien vaak op een rijbaan-, voetpad- of erfnetwerklijn. Een bouwbare pin moet zijdelings worden verplaatst, waarna begin-/eindconnectoren en de werkelijk toegankelijke looproute opnieuw moeten worden berekend.

**Vereiste correctie:** noem 224,5 en 224,9 meter “modelmatige netwerkafstand vóór terreincorrectie”. Laat de vier grote snaps handmatig valideren en routeer uiteindelijk vanuit het BAG-adrespunt naar de exacte bouwpin met expliciete connectoren. Een 225-meterbelofte is pas geldig als ook die volledige route onder 225 meter blijft.

### 5. Rapportartifact en generator zijn hersteld

**Status na hertoets: opgelost. Vertrouwen: hoog.**

De eerste audit trof een artifact met 53/59 en een niet-gedefinieerde variabele `headlineMetrics`. Na regeneratie zijn die fouten verdwenen. Het artifact bevat 45/48, de scripts zijn syntactisch geldig en de artifactvalidator rapporteert `ok: true`.

**Geen verdere blokkade:** controleer alleen nog dat de uiteindelijke HTML uit exact dit gevalideerde artifact is gebouwd.

## Overige vereiste correcties

### Huidige afstandsbanden zijn gecorrigeerd

**Status na hertoets: opgelost. Vertrouwen: hoog.**

De eerste versie gebruikte 178 adressen in 200-225 meter en 152 in 225-275 meter. De geregenereerde build gebruikt nu de herberekende waarden:

| Afstandsband | Correct huidig aantal |
|---|---:|
| 0-100 m | 943 |
| 100-150 m | 681 |
| 150-200 m | 473 |
| 200-225 m | **113** |
| 225-275 m | **217** |
| boven 275 m | 152 |

De bandtotalen sluiten nu inhoudelijk én rekenkundig aan op de 2.579 bronhuizen.

### 45/48 zijn scenario's op aansluit-equivalenten, geen gemeten afvalcapaciteit

**Ernst: middel. Vertrouwen: hoog.**

De twee uitkomsten gebruiken ieder BAG-adres als één actief aansluit-equivalent en veronderstellen een maximum van respectievelijk 100 of 75 per bak. Zij gebruiken geen pasbestand, bewonersaantal, kilogrammen, vulgraad, ledigingsfrequentie of seizoenspiek. De formulering moet daarom zijn: **45 bakken bij de aanname van 100 adressen; 48 bij de aanname van 75 adressen, beide uitsluitend op de vaste 43 modelankers.**

De kolom `assignedAddresses` is de ongecapaciteerde dichtstbijzijnde last en niet de uiteindelijke capacitated toewijzing. Zo heeft site 4 een ongecapaciteerde last van 119 maar in het 100-scenario één bak; dat kan alleen doordat adressen in de flowoplossing worden herverdeeld. Zonder uiteindelijke per-siteflow is de tabel makkelijk verkeerd te lezen.

**Vereiste correctie:** hernoem de kolom naar “ongecapaciteerde dichtstbijzijnde adressen” en voeg de echte toegewezen last per scenario toe, of laat de kolom weg bij het capaciteitsadvies.

### Eigendomsscreen is positief bewijs, geen plaatsingsrecht

**Ernst: middel. Vertrouwen: hoog.**

De aantallen 40 en 41 kloppen. Alle 40 exacte Gemeente Schagen-hits hebben in de bron het rechtstype “Eigendom (recht van)”; site 40 heeft gemeentelijke eigendomspercelen binnen 25 meter. Toch zegt de provinciale grootgrondgebruikerslaag niets over actuele gebruiksfunctie, beheergrens, privaatrechtelijke belemmeringen, vergunning of toestemming. Sites 36 en 43 hebben geen gemeentelijke hit binnen 25 meter.

**Vereiste correctie:** blijf spreken van een positieve openbare eigendomsscreen. Controleer definitief via actuele kadastrale informatie, gemeentelijk areaalbeheer en locatiebesluit.

### De OSM-afstandsfilter bewijst HVC-bereikbaarheid niet

**Ernst: middel. Vertrouwen: hoog.**

De 8-meterfilter meet afstand tot een OSM-lijn, terwijl de HVC-gekoppelde vergelijkingsbronnen maximaal 5 meter van de zijkant van het voertuig tot het containerhart noemen. Veel ankers liggen op de wegmiddellijn, waardoor een afstand van 0 meter triviaal is. Site 43 wordt bijvoorbeeld via een `service=parking_aisle` zonder expliciete toegangstag als openbare voertuigroute positief beoordeeld, terwijl de luchtfoto hem rood en waarschijnlijk privaat/parkeergebonden noemt.

**Vereiste correctie:** gebruik deze teller niet als haalbaarheids-KPI. Toets een concrete bouwpin aan het wegvlak, de gekozen opstelzijde, maximaal 5 meter kraanbereik, parkeervrije hijslijn, voertuigmal en voorwaarts aan-/wegrijden.

### “Huidig” moet “referentieplan” worden

**Ernst: middel. Vertrouwen: hoog.**

Omdat 22 van de 33 locaties als `new` zijn gemarkeerd, vergelijkt het rapport niet uitsluitend met de huidige fysieke opstelling. Noem dit de “gepubliceerde 33-locatie plan-/repovariant” en vermeld de mix van 11 bestaand, 22 nieuw en twee private bestaande Angelaparklocaties.

## Methodologische formuleringen die veilig zijn

Gebruik bij voorkeur:

- “afstandsheuristische 43-sitekandidaat” in plaats van “Pareto-efficiënte oplossing”;
- “reproduceerbare modelondergrens 31 en gevonden bovengrens 43” in plaats van “43 is het bewezen minimum”;
- “modelmatige netwerkafstand” in plaats van “werkelijke loopafstand” voor de voorgestelde sites;
- “positieve openbare eigendomsscreen” in plaats van “locatie op gemeentegrond”;
- “visueel kansrijke zoekzone” in plaats van “geschikte/HVC-toegankelijke locatie”;
- “45/48 onder de 100-/75-aansluit-equivalentaanname” in plaats van een definitief aantal fysieke bakken.

Een Pareto-claim is pas hard als voor een vastgelegde, fysiek haalbare kandidaatset is aangetoond dat geen alternatief dezelfde of minder sites/bakken gebruikt met voor ieder adres gelijke of kortere afstand en voor minstens één adres een strikt kortere afstand. Dat is nu niet aangetoond.

## Minimale acceptatiecriteria voor publicatie

1. **Gereed:** `build-artifact.mjs` is syntactisch geldig en artifact noemt niet meer 53/59 als advies.
2. **Gereed:** de huidige afstandsbanden zijn 113 en 217 voor 200-225 en 225-275 meter.
3. **Gereed:** het rapport toont prominent 8 groen, 14 oranje en 21 rood en noemt geen 43 exacte bouwlocaties.
4. **Deels gereed:** de routegraaf, frontier en 43 ankers zijn reproduceerbaar; TSV-statistieken en 45/48-flowbewijzen nog niet.
5. **Deels gereed:** de hoofdtekst noemt expliciet 2.579 adressen binnen de bebouwde kom, maar vermeldt de 303 uitgesloten adressen nog niet expliciet.
6. **Open voor een later ontwerpbesluit:** alle gekozen bouwpinnen moeten na terrein/HVC/KLIC-toets exact worden hergerouteerd.
7. **Open voor een later investeringsbesluit:** capaciteit moet worden herberekend met actieve aansluitingen en waar mogelijk afvalvolume/vuldata.

## Aannames en open vragen

- Het is aangenomen dat de twee luchtfoto-audits de laatst uitgevoerde haalbaarheidsscreen zijn; zij zijn inhoudelijk actueler dan de eerdere OSM/eigendomsscore.
- De geclaimde flowberekeningen zijn op interne consistentie gecontroleerd, maar niet opnieuw uitgevoerd omdat solvercode en volledige modelmatrix ontbreken.
- Niet vastgesteld is welk inzamelregime voor de 303 buiten-de-komadressen geldt.
- Niet vastgesteld is of HVC Schagen de in andere HVC-gemeenten terugkerende 5-metergrens en dezelfde voertuigmal in Warmenhuizen gebruikt.
