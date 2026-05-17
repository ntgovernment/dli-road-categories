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
 * @returns {string} HTML string suitable for `layer.bindPopup()`.
 */
function buildPopup(feature) {
  const p = feature.properties;
  return `<strong>${p.Road_Name}</strong><br>Road No: ${p.Road_Number}<br>Category: ${p.Road_Category}`;
}

/**
 * Initialises a Leaflet map inside a DOM element.
 *
 * Steps performed:
 * 1. Reads overlay IDs from `mapEl.dataset.overlays` (JSON array).
 * 2. Sets explicit pixel dimensions on the container.
 * 3. Creates a Leaflet map with an OSM tile layer.
 * 4. Fetches all overlays concurrently via {@link fetchOverlay}.
 * 5. Renders each overlay as a GeoJSON layer with a colour-coded style.
 * 6. Adds a layer-control panel with styled checkboxes.
 * 7. Fits the viewport to the combined bounds of all valid overlays.
 *
 * @param {HTMLElement} mapEl - Container element carrying a
 *   `data-overlays` attribute (JSON-encoded array of overlay IDs).
 * @returns {Promise<void>}
 */
async function initMap(mapEl) {
  const overlayIds = JSON.parse(mapEl.dataset.overlays || "[]");

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

  responses.forEach((data, i) => {
    if (!data) return;
    const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
    const label = (data.name || `Overlay ${overlayIds[i]}`).replace(/-/g, " ");

    const layer = L.geoJSON(data, {
      style: { color, weight: 3, opacity: 0.9 },
      onEachFeature(feature, lyr) {
        lyr.bindPopup(buildPopup(feature));
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
}

/**
 * Bootstrap: find every `.map[data-overlays]` element in the page and
 * initialise a separate Leaflet map instance inside each one.
 */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".map[data-overlays]").forEach(initMap);
});
