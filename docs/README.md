# Documentatie

Deze map bevat de verdiepende projectdocumentatie. De root-README blijft bewust beperkt tot projectdoel, datastroom en quickstart.

## Techniek en beheer

- [Databronnen en berekening](data-pipeline.md): invoerbronnen, filters, routeberekening, gegenereerde bestanden en beperkingen.
- [Ontwikkelen en testen](development.md): installatie, npm-scripts, tests en repositorystructuur.
- [Dorpskern toevoegen](adding-a-place.md): plaatsmanifest, containereditor, generatie en publicatievoorwaarden.
- [Genereren en deployen](deployment.md): generatorworkflow, GitHub Pages en post-deploycontroles.

## Inhoudelijke verantwoording

- [Onderzoeksbasis](research-basis.md): onderbouwing en beperkingen van de afstandscategorieën.
- [Data- en bronlicenties](../DATA-LICENSE.md): licenties en attributie per bron.

## Enquête

- [Tally-formulierspecificatie](tally-survey.md)
- [Papieren enquête (HTML)](papieren-enquete.html)
- [Papieren enquête (PDF)](papieren-enquete.pdf)

De PDF wordt uit de HTML-versie gegenereerd met `npm run generate:survey-pdf`.
