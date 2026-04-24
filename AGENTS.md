# Repository Guidelines

## Project Structure & Module Organization

This repository contains a static GitHub Pages site for Warmenhuizen waste-container walking-distance coverage. Source files live in `src/`: `index.html` is the page template, `styles.css` contains all page styles, and `app.js` contains the Leaflet browser app. Editable and generated datasets live in `data/`: `container-locations.json` is the editable container source, and `house-coverage.json` is generated coverage output with stored route geometry. Build and validation scripts live in `scripts/`. GitHub Pages deploys the generated `dist/` artifact through `.github/workflows/pages.yml`.

## Build, Test, and Development Commands

- `npm run check`: run syntax checks, validate JSON data, and build the static site.
- `npm run build`: create a clean `dist/` directory with `index.html`, assets, JSON data, and `.nojekyll`.
- `npm run serve`: serve `dist/` locally at `http://127.0.0.1:8000/`.
- `npm run generate:smoke`: smoke-test the generator with 10 addresses and write output to `/tmp/house-coverage.json`.
- `node scripts/generate-house-coverage.mjs --help`: show generator options.
- `node scripts/generate-house-coverage.mjs`: regenerate the committed coverage dataset. This uses external PDOK and OSRM services.

## Coding Style & Naming Conventions

Use two-space indentation in HTML, CSS, and JavaScript. Use English for code, filenames, schema keys, function names, and internal status values. Preserve Dutch user-facing text and domain terminology in the UI. Use `kebab-case` for web assets and data files, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for constants. Container IDs must follow the `WHNN` pattern, such as `WH01` and `WH26`.

## Data Rules

JSON is the only browser data source. Do not add JS data wrappers or `window.WARMENHUIZEN_*` globals. `data/container-locations.json` may be edited manually. `data/house-coverage.json` is generated and should not be hand-edited except for deliberate mechanical migrations. Browser code must not call PDOK, OSRM, or other live routing/data APIs; all coverage, ranking, and route geometry shown on GitHub Pages must come from committed JSON.

Distance bands are based on walking distance: `within_100`, `between_100_125`, `between_125_150`, `between_150_275`, `over_275`, and `unreachable`. UI colors are green, yellow, orange, red, dark red, and gray respectively.

## Testing Guidelines

There is no browser automation suite. For data or script changes, run `npm run check`. For generator changes, also run `npm run generate:smoke` and inspect the summary output. For map changes, run `npm run build`, then `npm run serve`, and verify that Leaflet tiles, container markers, house markers at zoom level 16+, selection states, stored route polylines, and coverage statistics load correctly.

## GitHub Pages Deployment

GitHub Actions builds and deploys the site after every push to `main`. The workflow publishes only the generated `dist/` artifact. Keep deployment changes in `.github/workflows/pages.yml` aligned with GitHub Pages Actions best practices, and do not commit generated `dist/` output unless the publishing strategy changes.

## Agent-Specific Instructions

Prefer fast repository inspection with `rg` or `rg --files`. Keep edits scoped. Keep generated coverage data synchronized with the generator schema when intentionally changing data shape. Avoid full coverage regeneration during routine work unless the changed dataset is intended, because it uses external PDOK and OSRM services.
