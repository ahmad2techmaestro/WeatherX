export const placeKey = (p) => `${Number(p.latitude).toFixed(2)},${Number(p.longitude).toFixed(2)}`;

export const DEFAULT_PLACE = {
  id: "26.7606,83.3732",
  name: "Gorakhpur",
  kind: "city",
  district: "",
  state: "Uttar Pradesh",
  country: "India",
  countryCode: "IN",
  subtitle: "Uttar Pradesh, India",
  latitude: 26.7606,
  longitude: 83.3732,
};

export const POPULAR_PLACES = [
  { name: "Delhi", state: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { name: "Mumbai", state: "Maharashtra", latitude: 19.076, longitude: 72.8777 },
  { name: "Bengaluru", state: "Karnataka", latitude: 12.9716, longitude: 77.5946 },
  { name: "Kolkata", state: "West Bengal", latitude: 22.5726, longitude: 88.3639 },
  { name: "Chennai", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707 },
  { name: "Hyderabad", state: "Telangana", latitude: 17.385, longitude: 78.4867 },
  { name: "Jaipur", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873 },
  { name: "Lucknow", state: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462 },
  { name: "Shimla", state: "Himachal Pradesh", latitude: 31.1048, longitude: 77.1734 },
  { name: "Varanasi", state: "Uttar Pradesh", latitude: 25.3176, longitude: 82.9739 },
].map((p) => ({
  ...p,
  id: `${p.latitude},${p.longitude}`,
  kind: "city",
  country: "India",
  countryCode: "IN",
  district: "",
  subtitle: `${p.state}, India`,
}));

/** Minimal, storage-safe copy of a place. */
export function slimPlace(p) {
  return {
    id: placeKey(p),
    name: p.name,
    kind: p.kind || "locality",
    district: p.district || "",
    state: p.state || "",
    country: p.country || "",
    countryCode: p.countryCode || "",
    subtitle: p.subtitle || [p.district, p.state, p.country].filter(Boolean).join(", "),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
  };
}

export const coordLabel = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;

/** Great-circle distance in metres between two {latitude, longitude} points. */
export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
