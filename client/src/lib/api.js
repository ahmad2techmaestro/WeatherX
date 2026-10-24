import axios from "axios";

/** Human-readable message from any request failure. */
export function errorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (error?.code === "ERR_CANCELED") return "";
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === "ECONNABORTED") return "The request timed out. Check your connection and try again.";
  if (!error?.response && error?.request) return "Can't reach the WeatherX server. Check your connection.";

  return fallback;
}

export const isCanceled = (error) => axios.isCancel(error) || error?.code === "ERR_CANCELED";

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

export async function fetchOverview(place, { signal } = {}) {
  const { data } = await axios.get("/api/weather/overview", {
    params: { lat: place.latitude, lon: place.longitude, name: place.name, country: place.countryCode || place.country },
    signal,
    timeout: 20000,
  });

  return data.data;
}

export async function fetchMulti(places, { signal } = {}) {
  const points = places.map((p) => `${p.latitude},${p.longitude}`).join("|");
  const { data } = await axios.get("/api/weather/multi", { params: { points }, signal, timeout: 25000 });

  return data.data;
}
