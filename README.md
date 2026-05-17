# DLI Road Categories

Interactive web map viewer for Northern Territory (NT) road categories. Displays the NT road network as colour-coded GeoJSON overlays on an OpenStreetMap basemap, powered by [Leaflet.js](https://leafletjs.com/). A searchable, filterable DataTable is injected directly below each map, linking each road row to a zoom-and-highlight action on the map.

## Features

- Renders one or more road-category overlays on an interactive map.
- Each overlay is drawn in a distinct colour with a labelled layer-control panel.
- Clicking a road segment shows a popup with its road number, name, category, and the latitude/longitude of the click point (3 decimal places, displayed on separate lines). Popups opened via the DataTable show the midpoint coordinate of the road segment instead.
- Map viewport auto-fits to the combined extent of all loaded overlays.
- **Road DataTable** — injected immediately below the map after overlays load:
  - Three columns: **Number**, **Name** (linked), **Category** (colour-coded swatch).
  - Global search box (DataTables built-in) searches across all columns.
  - **Filter by category** dropdown (exact-match) sits at the right of the controls bar.
  - **Show entries** select (10 / 25 / 50 / 100) sits between the search and category filter.
  - Default page size: 10 rows, sorted by Name ascending.
  - Clicking a road name zooms the map to fit all segments of that road (with 40 px padding, capped at zoom 15) and opens a popup on the first segment showing its midpoint coordinates.
  - The clicked road is highlighted in bold orange (`#ff7800`, weight 6) on the map; the previous highlight reverts to its original overlay colour on the next click.
- Dev mode resolves overlay data from local GeoJSON files; production fetches from the NT Government API.

## Tech Stack

| Layer       | Technology                                            |
| ----------- | ----------------------------------------------------- |
| Mapping     | [Leaflet.js](https://leafletjs.com/) 1.9.4            |
| Data table  | [DataTables](https://datatables.net/) 2.x (no-jQuery) |
| Build tool  | [Vite](https://vitejs.dev/) 5.4.0                     |
| Data format | GeoJSON (LineString `FeatureCollection`)              |

## Project Structure

```
src/
  map.js                              # All map + datatable logic (single entry point)
data/
  RoadCategories.json                 # All road categories (GeoJSON)
  Category1.json                      # Category 1 roads only (GeoJSON)
  Category2.json                      # Category 2 roads only (GeoJSON)
Draft road categories _ NT.GOV.AU.html  # Entry-point HTML page
vite.config.js                        # Vite dev-server and library build config
package.json
LICENSE
```

### `src/map.js` — module structure

| Symbol                                           | Kind                        | Purpose                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OVERLAY_COLORS`                                 | `const string[]`            | 10-colour palette; assigned to overlays by index (wraps).                                                                                                                                                                                                                                                      |
| `DEV_MOCKS`                                      | `const Record`              | Maps overlay IDs → lazy `import()` of local GeoJSON. Tree-shaken in prod.                                                                                                                                                                                                                                      |
| `fetchOverlay(id)`                               | `async function`            | Returns GeoJSON for an overlay ID. Uses DEV_MOCKS in dev, fetches `https://nt.gov.au?a={id}` in prod.                                                                                                                                                                                                          |
| `buildPopup(feature, latlng)`                    | `function`                  | Returns an HTML popup string from a GeoJSON feature's properties and a `{lat, lng}` coordinate. For map clicks the click position is used; for DataTable-triggered opens the segment midpoint is used as fallback. Features without resolvable coordinates (e.g. empty `GeometryCollection`) receive no popup. |
| `buildRoadTable(mapEl, mapId, map, roadRecords)` | `function`                  | Creates and appends the DataTable wrapper after `mapEl`. Wires search, category filter, highlight, and zoom interactions.                                                                                                                                                                                      |
| `initMap(mapEl)`                                 | `async function`            | Full lifecycle for one map element: parse overlay IDs → create Leaflet map → fetch + render overlays → build road records → call `buildRoadTable`.                                                                                                                                                             |
| Bootstrap                                        | `DOMContentLoaded` listener | Calls `initMap` for every `.map[data-overlays]` element on the page.                                                                                                                                                                                                                                           |

### Road record shape

Each entry in the `roadRecords` `Map` (keyed by `String(Road_Number || Road_Name)`):

```ts
{
  roadNumber:    string;          // "" when absent
  roadName:      string;
  category:      string;          // e.g. "Category 1"
  color:         string;          // hex, from OVERLAY_COLORS
  originalStyle: { color, weight: 3, opacity: 0.9 };
  layers:        L.Layer[];       // all GeoJSON segments sharing this road key
}
```

Multiple GeoJSON features with the same `Road_Number` are collapsed into one record (one table row), with all their Leaflet layers collected in `layers[]`. Zoom and highlight act on all segments at once.

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

Vite starts a local dev server (default port 5173) and opens the map page automatically. Overlay data is loaded from the local `data/` GeoJSON files via `DEV_MOCKS`.

### Build for production

```bash
npm run build
```

Outputs a self-contained IIFE bundle (`dist/road-map.js`) and stylesheet (`dist/road-map.css`) that can be embedded in any page. DataTables and Leaflet are both inlined — no CDN dependencies.

## Data Format

Each GeoJSON file must be a `FeatureCollection`. Features may be `LineString`, `MultiLineString`, or `GeometryCollection` (the first sub-geometry with coordinates is used for the popup midpoint). The top-level `name` property is used as the layer label (hyphens replaced with spaces). Each feature's `properties` object must include:

| Property        | Type     | Description                         |
| --------------- | -------- | ----------------------------------- |
| `Road_Number`   | `string` | Numeric road identifier (as string) |
| `Road_Name`     | `string` | Human-readable road name            |
| `Road_Category` | `string` | Category label, e.g. `"Category 1"` |

`Road_Number` is optional; when absent the record key falls back to `Road_Name`.

## Embedding the Map

The map (and its datatable) initialise on any element matching `.map[data-overlays]`. The `data-overlays` attribute must be a JSON array of overlay IDs:

```html
<div class="map" id="map-1612055" data-overlays='["1612803","1612804"]'></div>
```

Each ID is fetched from `https://nt.gov.au?a={id}` in production. Multiple such elements on one page each get their own independent map and datatable.

## DataTable Behaviour Notes

- **Search** — DataTables built-in; searches all three columns. The Name column's filter/sort value is the plain road name (no HTML), so searches work as expected.
- **Category filter** — uses an anchored regex (`^Category 1$`) so `"Category 1"` never accidentally matches `"Category 10"`.
- **Highlight** — persists until the next row is clicked. Clicking the same row again re-applies zoom/popup without toggling the highlight off.
- **CSS injection** — a `<style id="rt-styles">` block is appended to `<head>` once (guarded by ID check) to avoid duplicates when multiple maps are on the same page.
- **Event delegation** — click events are delegated to the `<table>` element (not individual `<a>` tags) so they survive DataTables re-rendering rows on page/sort/filter changes.

## Licence

[MIT](LICENSE) © 2026 Department of Lands, Infrastructure and Planning (DLIP), Northern Territory Government.
