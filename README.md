# DLI Road Categories

Interactive web map viewer for Northern Territory (NT) road categories. Displays the NT road network as colour-coded GeoJSON overlays on an OpenStreetMap basemap, powered by [Leaflet.js](https://leafletjs.com/).

## Features

- Renders one or more road-category overlays on an interactive map.
- Each overlay is drawn in a distinct colour with a labelled layer-control panel.
- Clicking a road segment shows a popup with its road number, name, and category.
- Map viewport auto-fits to the combined extent of all loaded overlays.
- Dev mode resolves overlay data from local GeoJSON files; production fetches from the NT Government API.

## Tech Stack

| Layer       | Technology                                 |
| ----------- | ------------------------------------------ |
| Mapping     | [Leaflet.js](https://leafletjs.com/) 1.9.4 |
| Build tool  | [Vite](https://vitejs.dev/) 5.4.0          |
| Data format | GeoJSON (LineString `FeatureCollection`)   |

## Project Structure

```
src/
  map.js              # Leaflet map initialisation and overlay loader
data/
  RoadCategories.json # All road categories (GeoJSON)
  Category1.json      # Category 1 roads only (GeoJSON)
  Category2.json      # Category 2 roads only (GeoJSON)
Draft road categories _ NT.GOV.AU.html   # Entry-point HTML page
vite.config.js        # Vite dev-server and library build config
package.json
LICENSE
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (bundled with Node.js)

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Vite will start a local dev server and open the map page automatically in your default browser. Overlay data is loaded from the local `data/` GeoJSON files in dev mode.

### Build for production

```bash
npm run build
```

Outputs a self-contained IIFE bundle (`dist/road-map.js`) and stylesheet (`dist/road-map.css`) that can be embedded in any page.

## Data Format

Each GeoJSON file must be a `FeatureCollection` of `LineString` features. Each feature's `properties` object should include:

| Property        | Description                          |
| --------------- | ------------------------------------ |
| `Road_Number`   | Numeric road identifier              |
| `Road_Name`     | Human-readable road name             |
| `Road_Category` | Category label (e.g. `"Category 1"`) |

An optional top-level `name` property on the `FeatureCollection` is used as the layer label in the map control. Hyphens in the name are replaced with spaces.

## Embedding the Map

The map is initialised on any element matching `.map[data-overlays]`. The `data-overlays` attribute must be a JSON array of overlay IDs:

```html
<div class="map" id="map-1612055" data-overlays='["1612803","1612804"]'></div>
```

In production, each ID is fetched from `https://nt.gov.au?a={id}`.

## Licence

[MIT](LICENSE) © 2026 Department of Lands, Infrastructure and Planning (DLIP), Northern Territory Government.
