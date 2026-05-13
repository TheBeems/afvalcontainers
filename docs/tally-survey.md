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

1. `Hoe goed vind je deze containerlocatie bereikbaar?`
   - Type: schaal 1-5
   - Verplicht: ja

2. `Hoe vaak verwacht je restafval weg te brengen?`
   - Type: meerkeuze
   - Opties: `Meerdere keren per week`, `Ongeveer 1 keer per week`, `Minder dan 1 keer per week`, `Weet ik nog niet`
   - Verplicht: ja

3. `Is de loopafstand voor jou acceptabel?`
   - Type: meerkeuze
   - Opties: `Ja`, `Nee`, `Twijfel`
   - Verplicht: ja

4. `Waarom wel of niet?`
   - Type: lange tekst
   - Verplicht: nee

5. `Heb je bijzonderheden zoals mobiliteit, zware zakken of gezinssituatie die meespelen?`
   - Type: meerkeuze, meerdere antwoorden toegestaan
   - Opties: `Mobiliteit of gezondheid`, `Zware afvalzakken`, `Luiers`, `Kattengrind`, `Gezinssituatie`, `Anders`, `Niet van toepassing`
   - Verplicht: nee

6. `Mag er contact met je worden opgenomen?`
   - Type: ja/nee
   - Verplicht: nee
   - Toon alleen bij `Ja`: `E-mailadres`
