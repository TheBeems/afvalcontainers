## GeoJSON: analytische zoekzones

`recommended-search-zones.geojson` bevat 43 WGS84-punten (EPSG:4326). Ieder punt is het anker van een analytische zoekzone en nadrukkelijk **geen uitvoeringsgerede bouwpin**. De status is daarom overal `search-zone-anchor-not-build-pin`.

Belangrijkste velden:

- `site`, `searchZoneAddress`, `street`: nummer en adresreferentie van de zoekzone.
- `geometry.coordinates`: `[longitude, latitude]` in WGS84; `latitude` en `longitude` staan ook als eigenschappen voor eenvoudige tabelimport.
- `modelMaximumWalkingDistanceM`: het ontwerpmaximum van 225 meter in het gereconstrueerde loopnetwerk; `siteModelMaximumWalkingDistanceM` is het berekende maximum binnen die afzonderlijke zone.
- `containersAt100AddressCapacity` en `containersAt75AddressCapacity`: benodigde fysieke bakken op die zoekzone in de twee capaciteitsvarianten. De totalen zijn respectievelijk 45 en 48.
- `ownershipScreen`, `municipalParcelAtAnchor`, `municipalParcelIdAtAnchor`, `municipalParcelWithin25M`: openbare eigendomsscreening. Dit is geen kadastraal bewijs, plaatsingsrecht of gemeentelijke toestemming.
- `aerialRating`, `aerialAssessment`, `aerialHvcRouteAssessment`, `aerialConfidence`: visuele voorselectie op de PDOK-luchtfoto en BGT-objecten. Waarden groen, oranje en rood zijn triage, geen technisch akkoord.
- `localShiftInstruction`: de lokale verschuifrichting of voorkeursvariant. Na iedere verschuiving moet de 225-meterrouting opnieuw worden berekend.
- `warnings` en `requiredFieldChecks`: zichtbare risico's en nog uit te voeren controles.
- `vehicleAccessScreen`: grove openbare OSM-netwerkscreening; dit vervangt geen rijcurve-, opstel-, stempel- of hijstoets door HVC.
- `status`: altijd `search-zone-anchor-not-build-pin`.

De capaciteitsvelden gebruiken actieve adresequivalenten, niet gemeten afvalmassa of vulgraad. Voor een definitieve plaatsing zijn ten minste terreinmeting, KLIC, boom- en worteltoets, verkeersveiligheid, constructieve ondergrond, eigendomsverificatie en schriftelijke HVC-goedkeuring nodig.
