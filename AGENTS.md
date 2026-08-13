# AGENTS.md

## Goal

Maintain this small static GitHub Pages web app for waste-container walking-distance coverage in configured villages in the municipality of Schagen, with simple, readable, accessible code. Prefer minimal changes that preserve existing behavior.

## Core Principles

1. KISS: choose the simplest solution that solves the current problem.
2. DRY: avoid duplicated logic, markup, labels, thresholds, and color/status mappings.
3. Separation of Concerns: keep structure in HTML, presentation in CSS, behavior in JS, and data in JSON.
4. Single Responsibility: functions should do one clear thing. Orchestrator functions may coordinate, but should delegate work.
5. Single Source of Truth: define distance categories, labels, colors, limits, and shared UI state once; reuse them everywhere.
6. Accessibility First: interactive UI must work with keyboard, focus states, ARIA where needed, and clear visible feedback.
7. Performance by Default: update only what changed; avoid full rerenders of map layers, markers, or panels unless necessary.

## Project Structure

Source files live in `src/`: `index.html` is the page template, `styles.css` imports the focused styles under `src/styles/`, and `app/main.js` is the Leaflet browser entrypoint. Shared browser/script logic lives in `src/shared/`. Place data lives under `data/places/<place-id>/`: `container-locations.json` is the editable container source, `house-coverage.json` is the generated full cache, and split runtime files are loaded by the browser. Build and validation scripts live in `scripts/`. GitHub Pages deploys the generated `dist/` artifact through `.github/workflows/pages.yml`.

## Build, Test, and Development Commands

- `npm run check`: run syntax checks, validate JSON data, and build the static site.
- `npm run build`: create a clean `dist/` directory with `index.html`, assets, JSON data, and `.nojekyll`.
- `npm run serve`: serve `dist/` locally at `http://127.0.0.1:8000/`.
- `npm run generate:smoke`: smoke-test the generator with 10 addresses and write output to `/tmp/house-coverage.json`.
- `node scripts/generate-house-coverage.mjs --help`: show generator options.
- `node scripts/generate-house-coverage.mjs`: regenerate the committed coverage dataset. This uses external PDOK and OSRM services.

## Project Rules

- Do not introduce frameworks or build tooling unless explicitly requested.
- Keep the app dependency-light. Prefer plain HTML, CSS, and JavaScript.
- Preserve existing Leaflet behavior unless the task directly concerns the map.
- Keep static hosting compatibility with GitHub Pages.
- Do not move fixed UI markup into JavaScript unless it must be dynamic.
- Do not add speculative features. Apply YAGNI.
- Do not commit generated `dist/` output unless the publishing strategy changes.
- Keep deployment changes in `.github/workflows/pages.yml` aligned with GitHub Pages Actions best practices.
- Prefer fast repository inspection with `rg` or `rg --files`.
- Keep edits scoped.
- Always use Context7 MCP for library/API documentation, code generation, setup, or configuration steps when those are needed.

## Coding Style and Naming

- Use two-space indentation in HTML, CSS, and JavaScript.
- Use English for code, filenames, schema keys, function names, and internal status values.
- Preserve Dutch user-facing text and domain terminology in the UI.
- Use `kebab-case` for web assets and data files.
- Use `camelCase` for functions and variables.
- Use `UPPER_SNAKE_CASE` for constants.
- Container IDs must use the place-specific prefix from `data/places.json` followed by two digits, such as `WH01`, `TH01`, or `WL01`.

## Data Rules

- JSON is the authoritative browser data source for container data, coverage, rankings, distance bands, and summary statistics.
- Do not add JS data wrappers or `window.WARMENHUIZEN_*` globals.
- `data/places/<place-id>/container-locations.json` may be edited manually.
- `data/places/<place-id>/house-coverage.json` is generated and should not be hand-edited except for deliberate mechanical migrations.
- Keep generated coverage data synchronized with the generator schema when intentionally changing data shape.
- Avoid full coverage regeneration during routine work unless the changed dataset is intended, because it uses external PDOK and OSRM services.
- Browser code must not call PDOK or use live routing/data APIs to compute coverage, rankings, distance bands, or summary statistics.
- Exception: when a selected house/container route has missing or invalid `routeGeometry`, browser code may call OSRM live to fetch route geometry for visual fallback only.
- Live fallback routes must be labeled as fallback/live display, must not be written to a place's `house-coverage.json`, and must not overwrite stored batch values.
- Distance bands are based on walking distance: `within_100`, `between_100_125`, `between_125_150`, `between_150_275`, `over_275`, and `unreachable`.
- UI colors for distance bands are green, yellow, orange, red, dark red, and gray respectively.

## JavaScript Guidelines

- Keep constants near the top of their owning module or in `src/app/config.js` when shared across browser modules.
- Reuse existing helpers such as escaping, formatting, status lookup, and route handling.
- Escape all JSON-derived values before inserting them with `innerHTML`.
- Prefer small helper functions over large conditional blocks.
- Keep state changes separate from rendering where practical.
- Do not duplicate distance/status logic. Extend the existing central mapping instead.
- When adding async behavior, handle loading, success, error, and stale-result cases clearly.

## CSS Guidelines

- Reuse component classes before adding new ones.
- Prefer shared base classes plus modifiers over near-duplicate components.
- Use existing CSS variables for colors, spacing, borders, and focus styling.
- Keep mobile and desktop behavior explicit in media queries.
- Preserve visible focus styles.

## HTML Guidelines

- Keep semantic structure.
- Use labels for inputs.
- Use buttons for actions.
- Use `details`/`summary` where native collapsible behavior is enough.
- Keep SEO metadata accurate and concise.

## Map and UI Behavior

- Do not rerender all markers when one selected item changes.
- Keep selected-house, selected-container, route, and legend behavior predictable.
- When adding controls, disable Leaflet click/scroll propagation where needed.
- Any draggable/editable map interaction must include clear confirmation or cancellation.

## Testing Guidelines

- For routine changes, run `npm run check`.
- For data or script changes, run `npm run check`.
- For generator changes, also run `npm run generate:smoke` and inspect the summary output.
- For map changes, run `npm run build`.
- Playwright browser tests live in `tests/e2e/` and run with `npm run test:e2e`.
