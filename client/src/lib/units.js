/**
 * Unit conversion. The API always speaks metric (°C, km/h, mm, hPa, km);
 * conversion happens here, so toggling units never needs another request.
 */

export const TEMP_UNITS = [
  { value: "celsius", label: "°C", name: "Celsius" },
  { value: "fahrenheit", label: "°F", name: "Fahrenheit" },
];

export const WIND_UNITS = [
  { value: "kmh", label: "km/h", name: "Kilometres per hour" },
  { value: "mph", label: "mph", name: "Miles per hour" },
  { value: "ms", label: "m/s", name: "Metres per second" },
];

export const toFahrenheit = (c) => (c * 9) / 5 + 32;

export function temp(value, units, { decimals = 0 } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  const v = units.temperature === "fahrenheit" ? toFahrenheit(value) : value;
  const f = 10 ** decimals;

  return Math.round(v * f) / f;
}

/** "28°" style label, or an em dash when the value is missing. */
export function tempLabel(value, units, opts) {
  const v = temp(value, units, opts);

  return v === null ? "—" : `${v}°`;
}

export function wind(valueKmh, units) {
  if (valueKmh === null || valueKmh === undefined) return null;

  if (units.wind === "mph") return Math.round(valueKmh * 0.621371);
  if (units.wind === "ms") return Math.round((valueKmh / 3.6) * 10) / 10;

  return Math.round(valueKmh);
}

export const windUnitLabel = (units) => WIND_UNITS.find((u) => u.value === units.wind)?.label ?? "km/h";

// Rain depth and distances follow the temperature system: °F → inches / miles.
const imperial = (units) => units.temperature === "fahrenheit";

export function precip(valueMm, units) {
  if (valueMm === null || valueMm === undefined) return null;

  return imperial(units) ? Math.round(valueMm * 0.0393701 * 100) / 100 : Math.round(valueMm * 10) / 10;
}

export const precipUnitLabel = (units) => (imperial(units) ? "in" : "mm");

export function distance(valueKm, units) {
  if (valueKm === null || valueKm === undefined) return null;

  return imperial(units) ? Math.round(valueKm * 0.621371 * 10) / 10 : Math.round(valueKm * 10) / 10;
}

export const distanceUnitLabel = (units) => (imperial(units) ? "mi" : "km");

export function pressure(valueHpa, units) {
  if (valueHpa === null || valueHpa === undefined) return null;

  return imperial(units) ? Math.round(valueHpa * 0.02953 * 100) / 100 : Math.round(valueHpa);
}

export const pressureUnitLabel = (units) => (imperial(units) ? "inHg" : "hPa");

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export const compass = (degrees) => (degrees === null || degrees === undefined ? "—" : COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]);
