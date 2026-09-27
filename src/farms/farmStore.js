import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FARMS_FILE = path.join(__dirname, "..", "..", "data", "farms.json");

export function loadStore() {
  return JSON.parse(fs.readFileSync(FARMS_FILE, "utf8"));
}

export function saveStore(store) {
  fs.writeFileSync(FARMS_FILE, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function getUsers() {
  return loadStore().users.map((u) => ({ id: u.id, name: u.name }));
}

/** Farms saved without a boundary (e.g. from the Streamlit form) get one derived from lat/lon. */
function withGeojson(farm) {
  return farm.geojson ? farm : { ...farm, geojson: geojsonFromPoint(+farm.lat, +farm.lon) };
}

export function getFarms(userId) {
  const user = loadStore().users.find((u) => u.id === userId);
  return user ? user.farms.map(withGeojson) : [];
}

export function getFarm(userId, farmId) {
  const farm = getFarms(userId).find((f) => f.id === farmId);
  return farm || null;
}

export function getDefaultFarm(userId) {
  const farms = getFarms(userId);
  return farms[0] || null;
}

/** Build a small square GeoJSON polygon (~200 m wide) around a lat/lon. */
export function geojsonFromPoint(lat, lon) {
  const d = 0.001;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon - d, lat + d],
          [lon + d, lat + d],
          [lon + d, lat - d],
          [lon - d, lat - d],
          [lon - d, lat + d],
        ],
      ],
    },
    properties: {},
  };
}

/**
 * Register a new farm for a user and persist it to data/farms.json.
 * `geojson` is optional — a small polygon is generated from lat/lon when absent.
 */
export function registerFarm(userId, { name, crop = "tomato", lat, lon, areaAcres = null, geojson }) {
  const store = loadStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  const farm = {
    id: `farm-${Date.now().toString(36)}`,
    name: name || `Farm ${user.farms.length + 1}`,
    crop,
    area_acres: areaAcres != null ? +areaAcres : null,
    lat: +lat,
    lon: +lon,
    geojson: geojson || geojsonFromPoint(+lat, +lon),
  };
  user.farms.push(farm);
  saveStore(store);
  return farm;
}
