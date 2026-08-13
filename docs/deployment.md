# Genereren en deployen

## Reguliere GitHub Pages-workflow

`.github/workflows/pages.yml` draait voor pull requests en pushes naar `main`:

1. repository uitchecken;
2. Node.js 24 configureren;
3. `npm ci` uitvoeren;
4. `npm run check` uitvoeren.

Bij een pull request stopt de workflow na de controle. Bij een push naar `main` wordt `dist/` als Pages-artifact geüpload en door een afzonderlijke deployjob gepubliceerd.

`dist/` is uitsluitend buildoutput en wordt niet gecommit.

## Handmatige coverage-generatie

`.github/workflows/generate-house-coverage.yml` kan handmatig worden gestart voor de dorpen die in zijn keuzelijst staan. De workflow:

1. genereert de volledige coverage voor het gekozen dorp;
2. kan optioneel routegeometrieën vooraf ophalen;
3. maakt de gesplitste browserdata aan;
4. voert `npm run check` uit;
5. commit gewijzigde coverage-bestanden rechtstreeks naar `main`;
6. bouwt en deployt wanneer data is gewijzigd.

Omdat deze workflow externe publieke diensten gebruikt en rechtstreeks naar `main` schrijft, moet de gekozen plaats en gegenereerde diff na afloop bewust worden gecontroleerd.

## Lokaal volledig genereren

Controleer eerst met een beperkte run:

```sh
npm run generate:smoke
```

Genereer daarna alleen wanneer een dataset bewust moet worden vernieuwd:

```sh
node scripts/generate-house-coverage.mjs --place=warmenhuizen
npm run check
```

De volledige generator vraagt gegevens op bij PDOK BAG, PDOK BRT TOP10NL en OSRM. Respecteer de publieke diensten: de standaardconfiguratie beperkt concurrency en houdt vertraging tussen OSRM-verzoeken aan.

## Publicatiecontrole

Controleer na deployment:

- de rootpagina en iedere gepubliceerde dorps-URL;
- adreszoeken en het lazy laden van adresdetails;
- de analyses- en methodiekpagina;
- `robots.txt` en `sitemap.xml`;
- correcte canonical URL's en social metadata;
- of `dist/data/places.json` alleen publiceerbare dorpen bevat;
- of `house-coverage.json` niet publiek is meegekopieerd.

## SEO-controle

Gebruik na relevante SEO- of contentwijzigingen Google Search Console voor `https://afvalcontainers-warmenhuizen.nl/`:

1. dien `https://afvalcontainers-warmenhuizen.nl/sitemap.xml` opnieuw in indien nodig;
2. inspecteer de root, alle actuele dorps-URL's, `/analyses/` en `/methodiek/`;
3. bevestig dat de root Warmenhuizen rendert met canonical `/warmenhuizen/`;
4. gebruik bij delen de schone canonical dorps-URL, zonder querystring.

Houd geen vaste lijst met dorps-URL's in deze checklist bij. De sitemap en het runtime-manifest zijn daarvoor de actuele bronnen.
