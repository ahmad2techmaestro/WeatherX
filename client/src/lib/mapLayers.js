import { contrast, mix } from "./color";
import { precip, pressure, temp, wind } from "./units";

/** Colour ramps for the map's data layers. Stops are [value, colour] in metric units. */
const RAMPS = {
  temperature: [
    [5, "#3b6fb6"],
    [15, "#4fb0c6"],
    [24, "#e8d36a"],
    [32, "#ee9a3a"],
    [40, "#d6452f"],
    [46, "#8f1d2c"],
  ],
  wind: [
    [0, "#dbe9ea"],
    [15, "#8fc3c4"],
    [30, "#3f9aa3"],
    [50, "#2b6a8f"],
    [80, "#3a3f8f"],
  ],
  rain: [
    [0, "#e4e8ea"],
    [0.2, "#a9cfe6"],
    [1, "#5aa0d2"],
    [4, "#2f6db5"],
    [12, "#38409a"],
  ],
  clouds: [
    [0, "#f4f1e6"],
    [50, "#c4cbd0"],
    [100, "#7d8891"],
  ],
  pressure: [
    [990, "#6b5fa8"],
    [1003, "#7fa6d6"],
    [1011, "#e7e4d8"],
    [1018, "#e6b873"],
    [1030, "#c4672f"],
  ],
};

export const LAYERS = [
  { value: "temperature", owm: "temp_new", label: "Temperature", ramp: "temperature", field: "temperature" },
  { value: "rain", owm: "precipitation_new", label: "Rain", ramp: "rain", field: "precipitation" },
  { value: "wind", owm: "wind_new", label: "Wind", ramp: "wind", field: "windSpeed" },
  { value: "clouds", owm: "clouds_new", label: "Clouds", ramp: "clouds", field: "cloudCover" },
  { value: "pressure", owm: "pressure_new", label: "Pressure", ramp: "pressure", field: "pressure" },
];

export function rampColor(name, value) {
  const stops = RAMPS[name];

  if (value === null || value === undefined || Number.isNaN(value)) return "#cfd5d9";
  if (value <= stops[0][0]) return stops[0][1];

  for (let i = 1; i < stops.length; i += 1) {
    if (value <= stops[i][0]) {
      const [v0, c0] = stops[i - 1];
      const [v1, c1] = stops[i];

      return mix(c0, c1, (value - v0) / (v1 - v0));
    }
  }

  return stops[stops.length - 1][1];
}

export const rampGradient = (name) => `linear-gradient(90deg, ${RAMPS[name].map(([, c]) => c).join(", ")})`;

export const readableOn = (bg) => (contrast(bg, "#0e1820") >= contrast(bg, "#ffffff") ? "#0e1820" : "#ffffff");

/** Display text for one grid point on a layer, converted to the user's units. */
export function pinLabel(layer, point, units) {
  const raw = point[layer.field];

  if (raw === null || raw === undefined) return "–";

  switch (layer.value) {
    case "temperature":
      return `${temp(raw, units)}°`;
    case "wind":
      return `${wind(raw, units)}`;
    case "rain":
      return raw >= 0.05 ? `${precip(raw, units)}` : "0";
    case "clouds":
      return `${Math.round(raw)}%`;
    default:
      return `${pressure(raw, units)}`;
  }
}

export function legendFor(layer, units) {
  const stops = RAMPS[layer.ramp];
  const first = stops[0][0];
  const last = stops[stops.length - 1][0];

  const show = {
    temperature: [`${temp(first, units)}°`, `${temp(last, units)}°`, units.temperature === "fahrenheit" ? "°F" : "°C"],
    wind: [`${wind(first, units)}`, `${wind(last, units)}+`, units.wind === "mph" ? "mph" : units.wind === "ms" ? "m/s" : "km/h"],
    rain: ["0", `${precip(last, units)}+`, units.temperature === "fahrenheit" ? "in/h" : "mm/h"],
    clouds: ["0%", "100%", "cover"],
    pressure: [`${pressure(first, units)}`, `${pressure(last, units)}`, units.temperature === "fahrenheit" ? "inHg" : "hPa"],
  }[layer.value];

  return { from: show[0], to: show[1], unit: show[2], gradient: rampGradient(layer.ramp) };
}
