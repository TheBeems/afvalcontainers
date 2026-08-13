# Eindaudit datakwaliteit: vaste-bestaande variant

Datum: 13 augustus 2026

Status: **intern consistent en reproduceerbaar als onderzoeksmodel; niet besluitrijp als bouw- of exploitatieplan**

Deze audit gaat uitsluitend over de actuele variant waarin alle in de repository als bestaand geïdentificeerde HVC-restlocaties verplicht blijven staan. De eerdere vrije variant met 43 modelankers en de toenmalige capaciteitsgevoeligheden van 45/48 bakken is vervallen en is geen actueel advies.

## Eindoordeel

De actuele brondata, optimizeruitvoer, TSV, per-adresbestand, GeoJSON, huishoudkaart, `artifact.json` en het verpakte HTML-rapport zijn onderling consistent. De hoofdclaims zijn:

| Onderdeel | Gecontroleerde uitkomst |
|---|---:|
| Vaste bestaande locaties | 11: 9 openbaar in het model, 2 privé |
| Private locaties | WH23 en WH24 |
| Aanvullende zoekankers | 38 |
| Totaal in het modelscenario | 49 locaties/modelpunten |
| Afstandsbanden | 1.117 / 407 / 393 / 662 / 0 / 0 |
| Gemiddelde / P95 / maximum | 110,4 / 194,9 / 224,5 meter |
| Bewezen interval voor aantal locaties | 39–49 |
| Capaciteitsgevoeligheid | exact 49 bakken bij 100 en 51 bij 75 adresequivalenten |
| Luchtfoto/BGT aanvullingen | 5 groen / 14 oranje / 19 rood |
| Gemeentegrondscreen aanvullingen | 36 exact positief / 0 alleen binnen 25 m / 2 geen hit binnen 25 m |
| Adressen in model / buiten scope | 2.579 / 303 |

De zes afstandsbanden zijn, in repositoryvolgorde: `within_100`, `between_100_125`, `between_125_150`, `between_150_275`, `over_275` en `unreachable`. De fijnere rapporttabel splitst de rode modelband correct in 574 adressen op 150–200 meter en 88 op 200–225 meter.

## Uitgevoerde controles

- `validate-fixed-existing-output.mjs` slaagt voor 2.579 unieke adressen, 49 unieke locaties, alle afstandsstatussen, private toegang, GeoJSON en beide capaciteitsscenario's.
- De vaste invoer is exact WH03, WH05, WH06, WH08, WH14, WH23, WH24, WH26, WH27, WH33 en WH34. ID, coördinaat en uniek HVC-ID komen overeen met `data/places/warmenhuizen/container-locations.json`.
- WH23 en WH24 zijn de enige private locaties. De dichtstbijzijnde ongecapaciteerde toewijzing gebruikt WH23 voor 0 en WH24 voor 4 adressen. De aparte max-flowcapaciteitstoewijzing gebruikt beide correct voor uitsluitend hun zeven toegestane adressen: 3 bij WH23 en 4 bij WH24. Geen niet-toegestaan adres is toegewezen.
- De 38 TSV-rijen zijn uniek en komen voor ID, coördinaat en routegraafknoop exact overeen met `selectedAdditionalSites`.
- De GeoJSON bevat exact dezelfde 49 ID's en coördinaten als het per-adresbestand: 11 bestaande en 38 aanvullende features. Alleen aanvullingen dragen de eerdere luchtfoto-/grondscreen; bestaande HVC-features bevatten geen overgenomen metadata van de vervallen vrije variant.
- De huishoudkaart bevat 2.579 adrespunten en 49 markers: 9 bestaande openbare, 2 bestaande private en 38 aanvullende. Legenda en kaartkleuren tonen exact 1.117 / 407 / 393 / 662 / 0 / 0. Grensgevallen Helshoek 7 (150,04 m) en Leenman 17 (150,03 m) worden met twee decimalen getoond en staan terecht in de rode band.
- De capaciteitsresultaten wijzen alle 2.579 adressen toe. Bij 100 adresequivalenten is één bak op elk van de 49 modelpunten exact haalbaar. Bij 75 zijn 51 bakken exact nodig, met één extra bak bij WH26 en één bij `model-225-19`. De kaart- en rapportlabels onderscheiden de ongecapaciteerde dichtstbijzijnde toewijzing van deze aparte max-flowherverdeling.
- De luchtfoto/BGT-classificatie van uitsluitend de 38 aanvullingen is onafhankelijk herteld als 5 groen, 14 oranje en 19 rood. De grondscreen is 36 exacte positieve hits, nul uitsluitend-25-meterhits en twee locaties zonder gemeentelijke hit binnen 25 meter (`model-225-04` en `model-225-13`).
- `coverage-summary.json` bevestigt 2.882 woonfunctie-adressen in de BAG-woonplaats, waarvan 2.579 binnen de gebruikte bebouwde-komscope en 303 erbuiten; de actuele plan-/reporeferentie telt 33 rest-/semi-restlocaties.
- Een geïsoleerde run vanaf Git-snapshot `9631171` reproduceerde `fixed-existing-route-optimization.json` en `fixed-existing-household-coverage-225.json` exact, afgezien van het generatietijdstip.
- De actuele hoofdtekst van artifact en HTML bevat geen 43/45/48-cijfers als huidige uitkomst. Het getal 43 komt alleen nog expliciet voor als historische, vervallen vrije modelscreen of als eerder sitenummer.
- Syntaxcontroles voor optimizer, beide kaart-/GeoJSON-generators en artifactbouwer slagen; `git diff --check` meldt geen witruimtefouten.

## Exactheid en beperkingen

De uitkomst **39–49 locaties** is een interval. De packing-ondergrens bewijst dat ten minste 28 aanvullingen naast de 11 verplichte locaties nodig zijn binnen dit model; de heuristiek vindt 38 aanvullingen. Zij bewijst niet dat 49 het globale minimum is.

De uitkomsten **49/51 bakken** zijn wel exact binnen de vastgelegde 49-punts afstandsmatrix, met minimaal één bak per locatie en respectievelijk 100 of 75 adresequivalenten per bak. Zij zijn geen exploitatiebewijs: actieve passen, bewonersaantallen, kilogrammen, volume, vulgraad, ledigingsfrequentie en mogelijke extra bestaande bakken ontbreken.

De routegraaf is gereconstrueerd uit historisch opgeslagen OSRM-geometrieën. Korte snapbenen naar exacte BAG- en containercoördinaten en kenmerken voor rolstoel, rollator, obstakels en veilige oversteken ontbreken. De resultaten zijn daarom geschikt voor vergelijkende zoekzoneanalyse, niet voor civieltechnische maatvoering.

De 38 aanvullende coördinaten zijn analytische zoekankers, geen bouwpinnen. Vooral de 19 rode ankers moeten worden vervangen; twee ankers hebben bovendien geen positieve gemeentelijke perceelhit binnen 25 meter. Iedere verplaatsing vereist nieuwe integrale routering, waarna de 225-meterdekking, het aantal locaties en de capaciteit opnieuw moeten worden vastgesteld.

Ook moeten gemeente en HVC vóór besluitvorming bevestigen dat alle 11 HVC-ID's actief en blijvend zijn, hoeveel fysieke bakken werkelijk op elke locatie staan, of de negen als openbaar gemodelleerde punten feitelijk algemeen toegankelijk zijn, en welke voertuigmal en operationele eisen gelden. Voor de 303 adressen buiten de modelscope moet het inzamelregime afzonderlijk worden vastgelegd.

## Beslisstatus

Er resteert **geen interne datakwaliteitsblocker** voor publicatie als onderzoeksrapport. Er blijft wel een harde uitvoeringsblocker voor een plaatsingsbesluit: eerst technisch en juridisch goedgekeurde bouwpinnen vaststellen en daarna locatie, route en capaciteit gezamenlijk opnieuw doorrekenen met actuele HVC-data.
