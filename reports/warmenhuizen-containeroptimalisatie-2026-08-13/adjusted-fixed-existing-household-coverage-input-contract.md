# Invoercontract bijgestelde huishoudkaart

De generator `generate-adjusted-fixed-existing-household-coverage-map.mjs` leest standaard
`adjusted-fixed-existing-household-coverage-225.json` en schrijft uitsluitend de gelijknamige
`adjusted-fixed-existing-household-coverage-map.svg` en `.html`. De bestaande fixed-existing
kaart blijft daarmee intact.

## Verplichte hoofdstructuur

- `scenario`: tellingen en samenvattingen voor zowel de graafkern als de gerapporteerde,
  toegangssensitieve afstand.
- `locations[]`: alle 11 verplichte bestaande HVC-locaties plus de aanvullende modelankers.
- `houses[]`: exact 2.579 BAG-woonfunctieadressen, één rij per adres.
- `method`: beschrijving van model, routegraaf en beperkingen.
- `adjustments`: leesbare registratie van verwijderde, verplaatste en vervangende aannames.

## Locaties

Elke locatie bevat minimaal `id`, `kind`, `accessScope`, `lat`, `lon` en `graphNode`.
Aanvullende locaties bevatten ook:

- `sourceOldId`: stabiele bron-ID `model-225-NN`; de kaart leidt hier A1…A38 uit af.
  Vervallen A4, A8 en A24 worden niet hernummerd of als actieve marker getoond.
- `adjustmentStatus`: bijvoorbeeld `retained`, `relocated` of `replacement-anchor`.
- `adjustmentReason`: korte, dossiergeschikte toelichting.

A36 moet als verplaatst herkenbaar zijn; A13 als vervangingsanker met waarschuwing. Alleen WH23
heeft `accessScope: "private"`; WH24 is openbaar. De generator onderscheidt bestaande openbare
HVC, bestaande private HVC en aanvullende onderzoeksankers zowel met kleur als markervorm.

## Huishoudens en afstandsbetekenis

Elke huishoudrij bevat minimaal `id`, `address`, `postcode`, `lat`, `lon`,
`nearestLocationId`, `coverageStatus` en `routeGeometry`. De drie afstandsvelden zijn:

- `graphCoreWalkingDistanceM`: afstand over de gereconstrueerde loopgraaf.
- `doorToRouteSnapLowerBoundM`: hemelsbrede afstand van het BAG-punt naar de historische
  routesnap; dit is geen bewezen beloopbare deurroute.
- `reportedWalkingDistanceM`: som die op de kaart als **indicatieve afstand /
  toegangssensitiviteit** wordt gekleurd. `walkingDistanceM` mag dezelfde waarde bevatten voor
  compatibiliteit.

De kaart noemt `reportedWalkingDistanceM` nadrukkelijk geen bewezen loopafstand en toont de
graafkern en BAG→routesnap apart in de tooltip. De kleuren volgen de centrale repo-indeling:
0–100 m groen, 100–125 m geel, 125–150 m oranje, 150–275 m rood, meer dan 275 m donkerrood en
geen route grijs. Waarden boven 225 m blijven zichtbaar en worden apart geteld.

## Bijstellingen en presentatie

`adjustments` mag de lijsten `removed`, `removedLocations`, `removedAssumptions`, `relocated`,
`relocatedLocations`, `replacementAnchors`, `warnings`, `scopeWarnings` en/of `routeWarnings`
bevatten. Een item mag tekst zijn of een object met ten minste een ID en een van `reason`,
`adjustmentReason`, `description` of `note`.

De output is volledig offline: ingebedde CSS/JavaScript, geen externe fonts, scripts of
kaarttegels. De HTML bevat toetsenbordbedienbare laagfilters, een horizontaal scrollbaar kaartvlak
voor mobiel, native SVG-tooltips en een locatietabel met wijzigingsstatus.
