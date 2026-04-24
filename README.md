# Warmenhuizen Afvalcontainers

Static GitHub Pages map for Warmenhuizen waste-container coverage by walking distance.

## Development

```sh
npm run check
npm run build
npm run serve
```

Open `http://127.0.0.1:8000/` after `npm run serve`.

## Data

- `data/container-locations.json` is the editable container source.
- `data/house-coverage.json` is generated coverage output with distance bands, top-3 container rankings, and stored route geometry.
- Browser code reads committed JSON data for container data, coverage, rankings, distance bands, and summary statistics.
- When stored route geometry is missing or invalid for a selected house/container pair, the map may fetch live OSRM route geometry as a visual fallback only.
- Distance bands are based on walking distance: green `0-100 m`, yellow `100-125 m`, orange `125-150 m`, red `150-275 m`, dark red `>275 m`, and gray when no route is available.

Smoke-test the generator without touching committed coverage data:

```sh
npm run generate:smoke
```

Regenerate the full coverage dataset only when intended:

```sh
node scripts/generate-house-coverage.mjs
```

The full generator calls PDOK BAG APIs and OSRM routing services.
It also stores simplified route geometry for the 3 nearest containers per address, so a full run can take a long time.

## Deployment

Pushes to `main` run `.github/workflows/pages.yml`, build `dist/`, and deploy that artifact to GitHub Pages.
