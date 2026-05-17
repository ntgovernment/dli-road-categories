# GitHub Copilot Instructions — DLI Road Categories

## Project purpose

Self-contained IIFE web component that embeds an interactive Leaflet road-network map and a linked DataTable into NT Government web pages. The entire feature ships as two files: `dist/road-map.js` and `dist/road-map.css`.

---

## Architecture overview

All logic lives in **`src/map.js`** — one ES module, no framework, no TypeScript. Vite bundles it into an IIFE at build time.

```
src/map.js
  └─ initMap(mapEl)           ← one call per .map[data-overlays] element
       ├─ fetchOverlay(id)    ← dev: local JSON mock | prod: NT Gov API
       ├─ buildPopup(feature) ← Leaflet popup HTML
       └─ buildRoadTable(...)  ← DataTable injected after mapEl
```

**Do not** create additional source files or add a bundler config unless explicitly asked.

---

## Key constraints

| Rule                                 | Detail                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No framework                         | Vanilla JS only. No React, Vue, Alpine, etc.                                                                                                 |
| No jQuery in src                     | The host page has jQuery but `src/map.js` must not depend on it. DataTables is imported via its no-jQuery npm package (`datatables.net-dt`). |
| Single entry point                   | `src/map.js` is the sole Vite entry. All features go here.                                                                                   |
| No new dependencies without approval | Current deps: `leaflet`, `datatables.net`, `datatables.net-dt`.                                                                              |
| IIFE output must stay self-contained | `dist/road-map.js` inlines all dependencies — no CDN links.                                                                                  |

---

## Dev / prod environment split

`import.meta.env.DEV` (replaced by Vite at build time) gates local data:

```js
// Dev: imports local GeoJSON; tree-shaken out in production build
const DEV_MOCKS = import.meta.env.DEV
  ? {
      1612803: () => import("../data/Category1.json"),
      1612804: () => import("../data/Category2.json"),
    }
  : {};
```

**When adding new overlay IDs for testing, add them to `DEV_MOCKS` only.** Production always fetches from `https://nt.gov.au?a={id}`.

---

## Data model

### GeoJSON shape (input)

```jsonc
{
  "type": "FeatureCollection",
  "name": "Category 1",          // used as layer-control label
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[lon, lat, z], ...] },
      "properties": {
        "Road_Number": "4",       // string; may be absent
        "Road_Name": "ANZAC PARADE",
        "Road_Category": "Category 1"
      }
    }
  ]
}
```

### Road record (internal, built during overlay load)

```ts
Map<
  string,
  {
    // key = String(Road_Number ?? Road_Name)
    roadNumber: string; // "" when absent from GeoJSON
    roadName: string;
    category: string;
    color: string; // hex from OVERLAY_COLORS, assigned by overlay index
    originalStyle: { color: string; weight: 3; opacity: 0.9 };
    layers: L.Layer[]; // all Leaflet layers sharing this road key (multi-segment)
    lengthKm: number; // cumulative geodesic length of all segments (Haversine), shown in popup as "X.X km"
  }
>;
```

Multiple GeoJSON features with the same `Road_Number` collapse into **one record** — one table row, one zoom action covering all segments.

---

## Colour palette

`OVERLAY_COLORS` is a fixed 10-colour array at the top of `src/map.js`. Colours wrap if there are more than 10 overlays. To add a colour, append to the array — do not insert or reorder (would break existing layer styling on live pages).

---

## DataTable wiring

| Concern         | Implementation                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Init            | `new DataTable('#rt-{mapId}', { data: records, columns: [...] })` — JS data, not HTML rows                                                                                                             |
| Search          | DataTables built-in `f` control; searches plain-text render values (not display HTML)                                                                                                                  |
| Category filter | `<select>` appended into `.rt-controls-row` via `initComplete`; uses `dt.column(2).search('^…$', true, false).draw()` (anchored regex)                                                                 |
| Controls layout | `dom: '<"rt-controls-row"f>rt<"rt-bottom-row"ipl>'` — search left / category right in top row; info left / pagination centre / length right in bottom row (length pushed right via `margin-left:auto`) |
| Column render   | `render(data, type, row)` — return plain text for `type !== 'display'` so search/sort are unaffected by HTML                                                                                           |
| Click → zoom    | Delegated on `<table>` (not `<a>`) so it survives DataTables row re-renders on page/sort/filter changes                                                                                                |
| Highlight       | `lyr.setStyle({ color:'#ff7800', weight:6, opacity:1.0 })`; previous highlight reset via stored `highlightedRecord` ref                                                                                |

**Category filter column index is 2** (Number=0, Name=1, Category=2). Update the `dt.column()` call if columns are reordered.

---

## CSS injection pattern

Shared table styles are injected once into `<head>` with a guard:

```js
if (!document.getElementById("rt-styles")) {
  const styleEl = document.createElement("style");
  styleEl.id = "rt-styles";
  styleEl.textContent = [...rules].join("\n");
  document.head.appendChild(styleEl);
}
```

Per-map styles (layer-control checkbox accent colours) are injected without an ID guard because they are scoped with unique class names (`layer-cb-{mapId}-{idx}`).

---

## Embedding on a host page

```html
<!-- 1. Load the bundle (placed before </body>) -->
<link rel="stylesheet" href="/dist/road-map.css" />
<script src="/dist/road-map.js"></script>

<!-- 2. Place the map element anywhere in <body> -->
<div class="map" id="map-1612055" data-overlays='["1612803","1612804"]'></div>
```

- The element **must** have class `map` and attribute `data-overlays` (JSON array of string IDs).
- The element **should** have a unique `id`; if absent one is generated randomly.
- Each `.map[data-overlays]` element on the page gets its own independent Leaflet map and DataTable.
- The DataTable is inserted as a sibling **after** the map element (`insertAdjacentElement('afterend', wrap)`), so no changes to host-page HTML are required beyond the map div.

---

## Common tasks

### Add a new overlay ID pair for dev testing

```js
// In DEV_MOCKS inside src/map.js:
1612805: () => import("../data/Category3.json"),
```

Also create `data/Category3.json` following the GeoJSON shape above.

### Change the default page size of the DataTable

Edit the `pageLength` option in the `new DataTable(...)` call inside `buildRoadTable`.

### Add a new column to the DataTable

1. Add a `<th>` to the `table.innerHTML` thead string.
2. Add a matching entry to the `columns` array in the DataTable init options.
3. If the new column contains HTML in display mode, add a `render` function that returns plain text for `type !== 'display'`.
4. Update the `dt.column(n)` index in the category filter `change` handler if the category column index shifts.

### Change the highlight colour

Edit the `color` value in `lyr.setStyle({ color: '#ff7800', ... })` inside the click handler in `buildRoadTable`.

### Change the map height

Edit `mapEl.style.height = "600px"` in `initMap`.

---

## Build and verify

```bash
npm run dev    # dev server with hot reload; opens HTML file automatically
npm run build  # outputs dist/road-map.js and dist/road-map.css
```

Both commands must complete with exit code 0 before changes are considered done. There should be no new entries in `node_modules` or `package.json` beyond the approved dependencies.
