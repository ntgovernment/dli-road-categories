/**
 * @fileoverview Leaflet map initialisation for the NT DLI Road Categories viewer.
 *
 * On DOMContentLoaded every `.map[data-overlays]` element is turned into an
 * interactive Leaflet map. Overlay IDs are read from the `data-overlays`
 * attribute (JSON array), fetched as GeoJSON, and rendered as colour-coded
 * line layers with a toggleable layer-control panel.
 *
 * @module map
 * @license MIT
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";

/**
 * Ordered list of hex colours used to distinguish overlays.
 * Colours are assigned by index (wrapping if more overlays than colours).
 *
 * @type {string[]}
 */
const OVERLAY_COLORS = [
  "#d6410A",
  "#003251",
  "#343741",
  "#288186",
  "#566C30",
  "#552855",
  "#398600",
  "#00819e",
  "#d2430f",
  "#e8114b",
];

/**
 * Lazily-evaluated dynamic imports for local GeoJSON fixtures used during
 * development. Vite statically analyses the import paths at build time.
 * The entire object is tree-shaken out in production builds because
 * `import.meta.env.DEV` is replaced with `false` at build time.
 *
 * @type {Record<number, () => Promise<{default: object}>>}
 */
const DEV_MOCKS = import.meta.env.DEV
  ? {
      1612803: () => import("../data/Category1.json"),
      1612804: () => import("../data/Category2.json"),
    }
  : {};

/**
 * Fetches GeoJSON data for a single overlay.
 *
 * In development mode the data is sourced from a local mock defined in
 * {@link DEV_MOCKS}. In production it is fetched from the NT Government API.
 *
 * @param {number|string} id - Overlay identifier.
 * @returns {Promise<object>} Resolved GeoJSON `FeatureCollection`.
 * @throws {Error} If the HTTP response is not OK (production only).
 */
async function fetchOverlay(id) {
  if (import.meta.env.DEV && DEV_MOCKS[id]) {
    const mod = await DEV_MOCKS[id]();
    return mod.default;
  }
  const r = await fetch(`https://nt.gov.au?a=${id}`);
  if (!r.ok) throw new Error(`Overlay ${id}: HTTP ${r.status}`);
  return r.json();
}

/**
 * Builds an HTML popup string for a road GeoJSON feature.
 *
 * @param {import('geojson').Feature} feature - A GeoJSON `Feature` whose
 *   `properties` object contains `Road_Name`, `Road_Number`, and
 *   `Road_Category`.
 * @param {{lat: number, lng: number}} latlng - Coordinate to display in the
 *   popup (rendered as `Latitude: x.xxx` / `Longitude: x.xxx`, 3 d.p.).
 *   Pass the Leaflet click event's `latlng` for map clicks, or derive
 *   the segment midpoint as a fallback for DataTable-triggered opens. The
 *   midpoint is resolved from `LineString`, `MultiLineString`, or the first
 *   sub-geometry of a `GeometryCollection`.
 * @returns {string} HTML string suitable for `layer.bindPopup()`.
 */
function buildPopup(feature, latlng) {
  const p = feature.properties;
  return `<strong>${p.Road_Name}</strong><br>Road No: ${p.Road_Number}<br>Category: ${p.Road_Category}<br>Latitude: ${latlng.lat.toFixed(3)}<br>Longitude: ${latlng.lng.toFixed(3)}`;
}

/**
 * Builds and injects a searchable, category-filterable road DataTable
 * immediately after the map element.
 *
 * @param {HTMLElement} mapEl - The map container element.
 * @param {string} mapId - Unique ID used to scope element IDs.
 * @param {import('leaflet').Map} map - The Leaflet map instance.
 * @param {Map<string, object>} roadRecords - Road records keyed by road key.
 */
function buildRoadTable(mapEl, mapId, map, roadRecords) {
  const records = Array.from(roadRecords.values());
  if (records.length === 0) return;

  // Inject shared styles once across all map instances on the page
  if (!document.getElementById("rt-styles")) {
    const styleEl = document.createElement("style");
    styleEl.id = "rt-styles";
    styleEl.textContent = [
      ".road-table-wrap { margin-top: 1.5rem; }",
      ".rt-controls-row { display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem; }",
      ".rt-controls-row .dataTables_filter { float:none; }",
      ".rt-controls-row .dataTables_length { float:none; }",
      ".rt-cat-wrapper { display:flex; align-items:center; gap:0.5rem; white-space:nowrap; margin-left:auto; }",
      ".rt-cat-wrapper label { font-weight:normal; }",
      ".rt-cat-select { padding:0.3rem 0.5rem; border:1px solid #ccc; border-radius:4px; font-size:0.9rem; }",
      ".rt-swatch { display:inline-block; width:12px; height:12px; border-radius:2px; margin-right:6px; vertical-align:middle; }",
      ".rt-num { color:#666; font-size:0.8em; margin-left:4px; }",
      "a.rt-road-link { color:#003251; text-decoration:none; font-weight:500; }",
      "a.rt-road-link:hover { text-decoration:underline; color:#d6410a; }",
    ].join("\n");
    document.head.appendChild(styleEl);
  }

  const categories = [...new Set(records.map((r) => r.category))].sort();

  const wrap = document.createElement("div");
  wrap.className = "road-table-wrap";

  // Category select – injected into the DataTables controls row via initComplete
  const catSelect = document.createElement("select");
  catSelect.className = "rt-cat-select";
  catSelect.innerHTML =
    '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${c}">${c}</option>`).join("");

  // Table element (DataTables populates tbody from JS data)
  const tableId = `rt-${mapId}`;
  const table = document.createElement("table");
  table.id = tableId;
  table.className = "display";
  table.style.width = "100%";
  table.innerHTML =
    "<thead><tr><th>Number</th><th>Name</th><th>Category</th></tr></thead>";
  wrap.appendChild(table);

  mapEl.insertAdjacentElement("afterend", wrap);

  // Initialise DataTable with JS data so column render callbacks control
  // what is searched vs. displayed (avoids swatch HTML polluting searches)
  const dt = new DataTable(`#${tableId}`, {
    data: records,
    columns: [
      {
        data: "roadNumber",
      },
      {
        data: "roadName",
        render(data, type, row) {
          if (type !== "display") return data;
          const key = encodeURIComponent(row.roadNumber || row.roadName);
          return `<a href="#" class="rt-road-link" data-key="${key}">${data}</a>`;
        },
      },
      {
        data: "category",
        render(data, type, row) {
          if (type !== "display") return data; // filter/sort on plain category string
          return `<span class="rt-swatch" style="background:${row.color}"></span>${data}`;
        },
      },
    ],
    pageLength: 10,
    lengthMenu: [10, 25, 50, 100],
    order: [[1, "asc"]],
    dom: '<"rt-controls-row"fl>rtip',
    initComplete() {
      // Place category select between the search box and the length select
      const row = table.parentElement.querySelector(".rt-controls-row");
      const lengthDiv = row.querySelector(".dataTables_length");
      const catWrapper = document.createElement("div");
      catWrapper.className = "rt-cat-wrapper";
      const catLabelEl = document.createElement("label");
      catLabelEl.textContent = "Filter by category:";
      catWrapper.appendChild(catLabelEl);
      catWrapper.appendChild(catSelect);
      row.appendChild(catWrapper);
    },
  });

  // Wire category dropdown to DataTables exact-match column search
  catSelect.addEventListener("change", () => {
    const val = catSelect.value;
    // Use anchored regex so "Category 1" doesn't match "Category 10"
    dt.column(1)
      .search(val ? `^${val}$` : "", true, false)
      .draw();
  });

  // Highlight state – tracks which record is currently highlighted on the map
  let highlightedRecord = null;

  // Delegate clicks from DataTables-rendered rows to the table element
  // (direct <a> binding would be lost when DataTables re-renders on page change)
  table.addEventListener("click", (e) => {
    const link = e.target.closest("a.rt-road-link");
    if (!link) return;
    e.preventDefault();

    const key = decodeURIComponent(link.dataset.key);
    const record = roadRecords.get(key);
    if (!record) return;

    // Reset previous highlight
    if (highlightedRecord && highlightedRecord !== record) {
      highlightedRecord.layers.forEach((lyr) =>
        lyr.setStyle(highlightedRecord.originalStyle),
      );
    }

    // Apply highlight to clicked road's segments
    record.layers.forEach((lyr) =>
      lyr.setStyle({ color: "#ff7800", weight: 6, opacity: 1.0 }),
    );
    highlightedRecord = record;

    // Fit map to all segments of the road
    const bounds = L.featureGroup(record.layers).getBounds();
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });

    // Open popup on the first segment
    record.layers[0].openPopup();
  });
}

/**
 * Initialises a Leaflet map inside a DOM element, then injects a road datatable
 * below it via {@link buildRoadTable}.
 *
 * @param {HTMLElement} mapEl - Container element carrying a
 *   `data-overlays` attribute (JSON-encoded array of overlay IDs).
 * @returns {Promise<void>}
 */
async function initMap(mapEl) {
  const overlayIds = JSON.parse(mapEl.dataset.overlays || "[]");
  const mapId = mapEl.id || `map-${Math.random().toString(36).slice(2)}`;

  mapEl.style.height = "600px";
  mapEl.style.width = "100%";

  const map = L.map(mapEl, { zoomSnap: 0 });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const responses = await Promise.all(
    overlayIds.map((id) =>
      fetchOverlay(id).catch((err) => {
        console.error(err);
        return null;
      }),
    ),
  );

  const overlayLayers = {};
  const overlayColorList = [];
  let combinedBounds = null;
  /** @type {Map<string, {roadNumber:string, roadName:string, category:string, color:string, originalStyle:object, layers:import('leaflet').Layer[]}>} */
  const roadRecords = new Map();

  responses.forEach((data, i) => {
    if (!data) return;
    const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
    const label = (data.name || `Overlay ${overlayIds[i]}`).replace(/-/g, " ");

    const layer = L.geoJSON(data, {
      style: { color, weight: 3, opacity: 0.9 },
      onEachFeature(feature, lyr) {
        // GeometryCollection has no top-level `coordinates`; fall back to the
        // first sub-geometry that does (handles LineString and MultiLineString).
        const geom = feature.geometry;
        let coords = geom?.coordinates;
        if (!coords && geom?.geometries) {
          const sub = geom.geometries.find((g) => g.coordinates);
          coords =
            sub?.type === "MultiLineString"
              ? sub.coordinates[0]
              : sub?.coordinates;
        }
        if (coords?.length) {
          const mid = coords[Math.floor((coords.length - 1) / 2)];
          const midLatLng = { lat: mid[1], lng: mid[0] };
          lyr.bindPopup(buildPopup(feature, midLatLng));
          lyr.on("click", (e) => {
            lyr.setPopupContent(buildPopup(feature, e.latlng));
          });
        }

        // Harvest road record for the datatable
        const p = feature.properties;
        const roadKey = String(p.Road_Number || p.Road_Name);
        if (!roadRecords.has(roadKey)) {
          roadRecords.set(roadKey, {
            roadNumber: p.Road_Number != null ? String(p.Road_Number) : "",
            roadName: p.Road_Name || roadKey,
            category: p.Road_Category || "",
            color,
            originalStyle: { color, weight: 3, opacity: 0.9 },
            layers: [],
          });
        }
        roadRecords.get(roadKey).layers.push(lyr);
      },
    }).addTo(map);

    overlayLayers[`<span style="color:${color}">${label}</span>`] = layer;
    overlayColorList.push(color);

    const layerBounds = layer.getBounds();
    if (layerBounds.isValid()) {
      combinedBounds = combinedBounds
        ? combinedBounds.extend(layerBounds)
        : layerBounds;
    }
  });

  if (Object.keys(overlayLayers).length > 0) {
    const ctrl = L.control
      .layers(null, overlayLayers, { collapsed: false })
      .addTo(map);

    const titleEl = L.DomUtil.create("div", "leaflet-control-layers-title");
    titleEl.textContent = "Layers";
    titleEl.style.cssText = "font-weight:bold; padding: 6px 8px 2px;";
    ctrl.getContainer().prepend(titleEl);

    const styleRules = [];
    ctrl
      .getContainer()
      .querySelectorAll(".leaflet-control-layers-overlays label")
      .forEach((labelEl, idx) => {
        const color = overlayColorList[idx];
        if (!color) return;
        labelEl.style.fontWeight = "bold";
        const checkbox = labelEl.querySelector("input[type='checkbox']");
        if (checkbox) {
          const cls = `layer-cb-${mapEl.id}-${idx}`;
          checkbox.classList.add(cls);
          styleRules.push(
            `.${cls} { accent-color: ${color} !important; appearance: auto !important; -webkit-appearance: auto !important; }`,
          );
        }
      });
    if (styleRules.length) {
      const styleEl = document.createElement("style");
      styleEl.textContent = styleRules.join("\n");
      document.head.appendChild(styleEl);
    }
  }

  if (combinedBounds && combinedBounds.isValid()) {
    // Compute the fractional zoom where the latitude span fills the map height exactly.
    // map.project() returns pixel coords for a given LatLng at a given zoom level;
    // the pixel span scales as 2^z, so we solve for z at zoom 0 then scale up.
    const mapHeight = map.getSize().y;
    const northPx = map.project(L.latLng(combinedBounds.getNorth(), 0), 0).y;
    const southPx = map.project(L.latLng(combinedBounds.getSouth(), 0), 0).y;
    const latSpanPx0 = Math.abs(southPx - northPx);
    const zoom = Math.log2((mapHeight * 0.95) / latSpanPx0);
    map.setView(combinedBounds.getCenter(), zoom);
  }

  buildRoadTable(mapEl, mapId, map, roadRecords);
}

/**
 * Bootstrap: find every `.map[data-overlays]` element in the page and
 * initialise a separate Leaflet map instance inside each one.
 */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".map[data-overlays]").forEach(initMap);
});
