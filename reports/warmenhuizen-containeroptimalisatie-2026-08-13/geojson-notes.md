## GeoJSON: behoudscenario met bestaande HVC-locaties

`fixed-existing-recommended-search-zones.geojson` is de actuele kaartlaag. Deze WGS84 FeatureCollection (EPSG:4326) bevat:

- 11 vaste bestaande HVC-restlocaties met status `fixed-existing-hvc-location`;
- 38 aanvullende analytische ankers met status `search-zone-anchor-not-build-pin`;
- 47 publiek bruikbare en 2 private locaties, waarbij WH23 en WH24 alleen voor hun allowlist-adressen meetellen;
- per locatie de ongecapaciteerde dichtstbijzijnde vraag, de afzonderlijke max-flowtoewijzingen en het bakscenario bij 100 en 75 BAG-adresequivalenten;
- voor uitsluitend de 38 aanvullingen de gekoppelde openbare-grond- en luchtfotoscreen uit de eerdere vrije modelrun.

Belangrijkste velden:

- `id`, `kind`, `accessScope` en `status`: identiteit, rol, toegang en besluitstatus.
- `geometry.coordinates`: `[longitude, latitude]` in WGS84.
- `address`: bestaand HVC-adres of adresreferentie van het aanvullende zoekanker.
- `nearestHouseholdsUncapacitated`: adressen waarvoor dit de dichtstbijzijnde toegankelijke locatie is, zonder bakcapaciteit.
- `assignedHouseholdsAt100AddressCapacity` en `assignedHouseholdsAt75AddressCapacity`: aparte haalbare max-flowtoewijzingen; deze minimaliseren de loopafstand niet opnieuw.
- `containersAt100AddressCapacity` en `containersAt75AddressCapacity`: één bak per locatie plus de exact benodigde extra bakken binnen de vaste modelmatrix. De totalen zijn 49 en 51.
- `ownershipScreen`, `exactMunicipalParcel` en `municipalParcelWithin25M`: positieve openbare eigendomsscreening voor een aanvullend anker. Dit is geen kadastraal bewijs, plaatsingsrecht of toestemming.
- `oldSite`, `aerialRating`, `aerialAssessment`, `aerialHvcRouteAssessment`, `localShiftInstruction` en `visibleConstraints`: alleen voor aanvullende ankers; groen, oranje en rood zijn triage en geen technisch akkoord.

De capaciteitsvelden gebruiken BAG-adresequivalenten en geen bestand van actieve afvalpassen, gemeten afvalmassa of vulgraad. Voor definitieve plaatsing zijn terreinmeting, KLIC, boom- en worteltoets, verkeersveiligheid, constructieve ondergrond, eigendomsverificatie en schriftelijke HVC-goedkeuring nodig. Na iedere verplaatsing van een zoekanker moet de 225-meterrouting opnieuw worden berekend.

`recommended-search-zones.geojson` is de eerdere vrije 43-nodevariant met 45/48-bakkenscreen. Die blijft alleen als reproduceerbare historische tussenscreen bewaard en is niet het gecorrigeerde advies.
