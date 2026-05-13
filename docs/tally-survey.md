# Tally form-specificatie

Deze specificatie is bedoeld om handmatig een Tally-formulier aan te maken. Vul daarna de echte form-id in bij `TALLY_FORM_ID` in `src/app/config.js`.

## Basis

- Titel: `Ervaring met loopafstand naar restafvalcontainer`
- Intro: `We horen graag hoe u de loopafstand naar de geselecteerde restafvalcontainer ervaart. Uw reactie helpt om de praktische gevolgen per locatie beter zichtbaar te maken.`
- Bedankpagina: `Dank voor je reactie. Je feedback helpt om de gevolgen per locatie beter zichtbaar te maken.`

## Hidden fields

Maak deze hidden fields aan in Tally. De kaart vult ze automatisch, zonder volledig adres, huisnummer of postcode mee te sturen. Alleen de straatnaam wordt als gebiedsduiding meegestuurd.

- `place`
- `street`
- `coverage_status`
- `walking_distance_m`
- `walking_duration_s`
- `container_id`

## Vragen

1. `Vind je de wijziging van restafval ophalen naar zelf brengen acceptabel?`
   - Type: meerkeuze
   - Opties: `Ja`, `Nee`
   - Verplicht: ja

2. `Wat zijn de redenen dat je het niet acceptabel vindt?`
   - Type: meerkeuze
   - Opties: `De loopafstand is te ver`, `Vanwege rommel naast de container`, `Stankoverlast`, `Overvolle containers`, `Onpraktisch voor ouderen en minder validen`, `Andere redenen`
   - Verplicht: ja

6. `Mag er contact met je worden opgenomen?`
   - Type: invoer
   - Verplicht: nee
   - Toon alleen bij: `E-mailadres`
