import axios from "axios";

/** Human-readable message from any request failure. */
export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (error?.code === "ERR_CANCELED") return "";
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === "ECONNABORTED") return "The request timed out. Check your connection and try again.";
  if (!error?.response && error?.request) return "Can't reach the WeatherX server. Check your connection.";

  return fallback;
}

export const isCanceled = (error) => axios.isCancel(error) || error?.code === "ERR_CANCELED" || error?.name === "AbortError";

export async function searchPlaces(q, { scope = "india", signal } = {}) {
  const { data } = await axios.get("/api/geo/search", { params: { q, scope }, signal, timeout: 12000 });

  return data.data || [];
}

export async function reversePlace(latitude, longitude, { signal } = {}) {
  try {
    const { data } = await axios.get("/api/geo/reverse", { params: { lat: latitude, lon: longitude }, signal, timeout: 12000 });

    return data.data;
  } catch (error) {
    if (error?.response?.status === 404) return null;

    throw error;
  }
}

/** Plain fetch (no app interceptors, no cookies/auth headers) for talking to the public weather API directly. */
async function fetchPublicJson(url, signal) {
  const response = await fetch(url, { signal, credentials: "omit" });

  if (!response.ok) throw new Error(`Upstream responded ${response.status}`);

  return response.json();
}

/**
 * Fallback for when the WeatherX server's shared IP is rate-limited by Open-Meteo: the server sends back the
 * upstream URLs, this device fetches them from its own IP, and the server turns the raw data into the usual overview.
 */
async function overviewViaBrowser(fallback, { signal } = {}) {
  const [forecast, air] = await Promise.allSettled([fetchPublicJson(fallback.forecast, signal), fetchPublicJson(fallback.air, signal)]);

  if (forecast.status === "rejected") throw forecast.reason;

  const { data } = await axios.post(
    "/api/weather/overview/relay",
    { forecast: forecast.value, air: air.status === "fulfilled" ? air.value : null },
    { signal, timeout: 20000 }
  );

  return data.data;
}

export async function fetchOverview(place, { signal } = {}) {
  try {
    const { data } = await axios.get("/api/weather/overview", {
      params: { lat: place.latitude, lon: place.longitude, name: place.name, country: place.countryCode || place.country },
      signal,
      timeout: 20000,
    });

    return data.data;
  } catch (error) {
    const fallback = error?.response?.data?.fallback;

    if (!fallback?.forecast || !fallback?.air || isCanceled(error)) throw error;

    try {
      return await overviewViaBrowser(fallback, { signal });
    } catch (fallbackError) {
      // Cancelled by the user: stay quiet. Anything else: show the server's original message.
      throw isCanceled(fallbackError) || fallbackError?.name === "AbortError" ? fallbackError : error;
    }
  }
}

export async function fetchMulti(places, { signal } = {}) {
  const points = places.map((p) => `${p.latitude},${p.longitude}`).join("|");
  const { data } = await axios.get("/api/weather/multi", { params: { points }, signal, timeout: 25000 });

  return data.data;
}
