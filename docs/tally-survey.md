# Tally form-specificatie

Deze specificatie is bedoeld om via de Tally API een kort feedbackformulier aan te maken. Vul na aanmaak de echte form-id in bij `TALLY_FORM_ID` in `src/app/config.js`.

## Basis

- Titel: `Jouw mening over aangekondige restafvalcontainers`
- Intro: `We horen graag hoe je de wijziging van restafval ophalen naar zelf wegbrengen ervaart. Je reactie helpt ons om de praktische gevolgen per straat en containerlocatie beter zichtbaar te maken en dit terug te koppelen aan de gemeente Schagen.`
- Privacytekst: `Je reactie wordt beveiligd opgeslagen. We slaan geen specifiek adres, huisnummer of postcode op. Vanuit de kaart sturen we alleen woonplaats, straat, loopafstand, looptijd en dichtstbijzijnde container-ID mee. Je e-mailadres is optioneel en is alleen bekend bij de dorpsraad van Warmenhuizen.`
- Bedankpagina: `Dank voor je reactie. Je feedback helpt ons om de gevolgen per locatie beter zichtbaar te maken.`

## Hidden fields

Maak deze hidden fields aan in Tally. De kaart vult ze automatisch, zonder volledig adres, huisnummer of postcode mee te sturen. Alleen de straatnaam wordt als gebiedsduiding meegestuurd.

- `place`
- `street`
- `coverage_status`
- `walking_distance_m`
- `walking_duration_s`
- `container_id`

## Vragen

1. `Vind je de wijziging van restafval ophalen naar zelf wegbrengen acceptabel?`
   - Type: meerkeuze
   - Opties: `Ja`, `Nee`
   - Verplicht: ja

2. `Waarom vind je dit niet acceptabel?`
   - Type: selectievakjes
   - Opties: `De loopafstand is te ver`, `Afval naast de containers / zwerfafval`, `Aantasting van uitzicht, straatbeeld en woongenot`, `Onpraktisch voor ouderen en mindervaliden`, `Overlast van stank en ongedierte`, `Waardedaling woning`, `Andere reden`
   - Verplicht: ja
   - Toon alleen bij: vraag 1 is `Nee`

3. `Waarom vind je dit acceptabel?`
   - Type: alinea
   - Verplicht: nee
   - Toon alleen bij: vraag 1 is `Ja`

4. `E-mailadres, optioneel`
   - Type: e-mail
   - Helptekst: `Alleen invullen als we contact met je mogen opnemen over je reactie.`
   - Verplicht: nee

## Tally API

- Gebruik `POST https://api.tally.so/forms` om het formulier aan te maken.
- Gebruik een `HiddenFieldsBlock` voor de hidden fields hierboven.
- Gebruik blokken voor titel, intro/privacytekst, meerkeuze, selectievakjes, tekst/alinea, e-mail en bedankpagina.
- Gebruik conditionele logica:
  - Toon vraag 2 als vraag 1 `Nee` is.
  - Toon vraag 3 als vraag 1 `Ja` is.
- Sla de Tally API-key niet op in de repo. Gebruik lokaal een environment variable zoals `TALLY_API_KEY`.

## Controle

- In Tally preview:
  - `Ja` toont alleen de positieve toelichting en het optionele e-mailveld.
  - Verplichte velden blokkeren alleen waar bedoeld.
- Vanuit de kaart:
  - Controleer dat hidden fields gevuld worden met woonplaats, straat, loopafstand, looptijd en container-ID.
  - Controleer dat geen volledig adres, huisnummer of postcode naar Tally wordt meegestuurd.
- Run daarna `npm run check`.