const { getJson } = require("../lib/httpClient");
const { TTLCache } = require("../lib/cache");

const OPEN_METEO_GEO_URL =
    process.env.OPEN_METEO_GEOCODING_URL ||
    "https://geocoding-api.open-meteo.com/v1/search";

const PHOTON_URL = process.env.PHOTON_URL || "https://photon.komoot.io";

const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";

const OPENWEATHER_REVERSE_URL = "https://api.openweathermap.org/geo/1.0/reverse";

// Rough bounding box of India (lon min, lat min, lon max, lat max).
const INDIA_BBOX = "68.1,6.4,97.5,35.8";

const DAY = 24 * 60 * 60 * 1000;

const searchCache = new TTLCache({ ttlMs: DAY, max: 800 });
const reverseCache = new TTLCache({ ttlMs: DAY, max: 800 });

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const norm = (value) =>
    clean(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

// Lower = more important when two places match equally well.
const KIND_RANK = {
    state: 0,
    district: 1,
    city: 2,
    town: 3,
    village: 4,
    locality: 5,
};

const kindFromFeatureCode = (code = "") => {
    if (code === "ADM1") return "state";
    if (code === "ADM2" || code === "ADM3") return "district";
    if (code === "PPLC" || code === "PPLA" || code === "PPLA2") return "city";
    if (code === "PPLA3" || code === "PPLA4" || code === "PPL") return "town";
    if (code.startsWith("PPL")) return "village";

    return "locality";
};

const kindFromOsm = (properties = {}) => {
    const value = properties.osm_value || properties.type || "";

    if (value === "state") return "state";
    if (["county", "district", "state_district", "region"].includes(value)) return "district";
    if (value === "city") return "city";
    if (["town", "municipality"].includes(value)) return "town";
    if (["village", "hamlet", "isolated_dwelling"].includes(value)) return "village";

    return "locality";
};

// OSM often names a district "Gorakhpur District"; show it as plain "Gorakhpur", and never repeat the place's own name.
const plainDistrict = (district, name) => {
    const bare = String(district || "").replace(/\s+(district|division|tehsil|taluk|taluka)$/i, "").trim();

    return bare && bare.toLowerCase() !== String(name || "").replace(/\s+(district|division)$/i, "").trim().toLowerCase() ? bare : "";
};

const describe = ({ name, district, state, country }) =>
    [plainDistrict(district, name), state, country].filter(Boolean).join(", ");

const fromOpenMeteo = (item) => {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !item.name) return null;

    const kind = kindFromFeatureCode(item.feature_code);
    const state = clean(item.admin1);
    // For a district the "admin2" is the place itself; avoid "Pune, Pune".
    const district = clean(item.admin2) && clean(item.admin2) !== clean(item.name) ? clean(item.admin2) : "";

    return {
        name: clean(item.name),
        kind,
        district,
        state: kind === "state" ? "" : state,
        country: clean(item.country),
        countryCode: clean(item.country_code).toUpperCase(),
        latitude,
        longitude,
        population: Number(item.population) || 0,
        source: "open-meteo",
    };
};

const fromPhoton = (feature) => {
    const properties = feature?.properties || {};
    const [longitude, latitude] = feature?.geometry?.coordinates || [];

    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;

    const name = clean(properties.name);

    if (!name) return null;

    const kind = kindFromOsm(properties);

    return {
        name,
        kind,
        district: clean(properties.county || properties.district) === name ? "" : clean(properties.county || properties.district),
        state: kind === "state" ? "" : clean(properties.state),
        country: clean(properties.country),
        countryCode: clean(properties.countrycode).toUpperCase(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        population: 0,
        source: "osm",
    };
};

const score = (place, query) => {
    const name = norm(place.name);
    let value = 0;

    if (name === query) value += 100;
    else if (name.startsWith(query)) value += 60;
    else if (name.includes(query)) value += 25;

    // Prefer bigger / more administrative places, but only as a tie-breaker.
    value += Math.max(0, 10 - (KIND_RANK[place.kind] ?? 5) * 2);
    value += Math.min(20, Math.log10(place.population + 1) * 3);
    if (place.source === "open-meteo") value += 2;

    return value;
};

/** Collapse near-identical places returned by both providers (≈1 km grid + same name). */
const dedupe = (places) => {
    const seen = new Map();

    for (const place of places) {
        const key = `${norm(place.name)}|${place.latitude.toFixed(1)}|${place.longitude.toFixed(1)}`;
        const existing = seen.get(key);

        if (!existing) {
            seen.set(key, place);
            continue;
        }

        // Keep the richer record (more admin context, or a population figure).
        const richness = (p) => (p.district ? 1 : 0) + (p.state ? 1 : 0) + (p.population ? 1 : 0);

        if (richness(place) > richness(existing)) seen.set(key, place);
    }

    return [...seen.values()];
};

const searchOpenMeteo = async (query, { india, limit }) => {
    const data = await getJson(
        OPEN_METEO_GEO_URL,
        {
            params: {
                name: query,
                count: Math.min(limit * 2, 20),
                language: "en",
                format: "json",
                ...(india ? { countryCode: "IN" } : {}),
            },
        },
        { retries: 1 }
    );

    return (data?.results || []).map(fromOpenMeteo).filter(Boolean);
};

const searchPhoton = async (query, { india, limit }) => {
    const data = await getJson(
        `${PHOTON_URL}/api/`,
        {
            params: {
                q: query,
                limit: Math.min(limit * 2, 20),
                lang: "en",
                ...(india ? { bbox: INDIA_BBOX } : {}),
            },
        },
        { retries: 0 }
    );

    return (data?.features || [])
        .map(fromPhoton)
        .filter(Boolean)
        .filter((place) => !india || place.countryCode === "IN");
};

/**
 * Search places. In India mode (the default) results come from two independent
 * sources — Open-Meteo's GeoNames index (cities, districts, states, many villages)
 * and OpenStreetMap via Photon (hamlets and small localities) — so one provider
 * being down or missing a village does not break search.
 */
const searchPlaces = async (rawQuery, { scope = "india", limit = 8 } = {}) => {
    const query = norm(rawQuery);

    if (query.length < 2) return [];

    const india = scope !== "world";
    const cacheKey = `${scope}|${limit}|${query}`;

    return searchCache.wrap(cacheKey, async () => {
        const settled = await Promise.allSettled([
            searchOpenMeteo(rawQuery.trim(), { india, limit }),
            searchPhoton(rawQuery.trim(), { india, limit }),
        ]);

        const fulfilled = settled.filter((s) => s.status === "fulfilled");

        // Both providers failed → surface the error instead of caching an empty list.
        if (fulfilled.length === 0) {
            const reason = settled[0].reason;
            const error = new Error("Location search providers are unavailable.");
            error.cause = reason;
            error.status = 502;
            throw error;
        }

        const merged = dedupe(fulfilled.flatMap((s) => s.value));

        return merged
            .map((place) => ({ place, rank: score(place, query) }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, limit)
            .map(({ place }, index) => ({
                id: `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`,
                name: place.name,
                kind: place.kind,
                subtitle: describe(place),
                district: place.district,
                state: place.state,
                country: place.country,
                countryCode: place.countryCode,
                latitude: Number(place.latitude.toFixed(4)),
                longitude: Number(place.longitude.toFixed(4)),
                source: place.source,
                position: index,
            }));
    });
};

const reverseNominatim = async (latitude, longitude) => {
    const data = await getJson(
        `${NOMINATIM_URL}/reverse`,
        {
            params: {
                format: "jsonv2",
                lat: latitude,
                lon: longitude,
                zoom: 13,
                addressdetails: 1,
                "accept-language": "en",
            },
        },
        { retries: 0 }
    );

    const address = data?.address;

    if (!address) return null;

    const name =
        address.village ||
        address.hamlet ||
        address.suburb ||
        address.neighbourhood ||
        address.town ||
        address.city ||
        address.city_district ||
        address.county ||
        address.state_district ||
        "";

    if (!name) return null;

    return {
        name: clean(name),
        district: clean(address.state_district || address.county || ""),
        state: clean(address.state),
        country: clean(address.country),
        countryCode: clean(address.country_code).toUpperCase(),
    };
};

const reversePhoton = async (latitude, longitude) => {
    const data = await getJson(
        `${PHOTON_URL}/reverse`,
        { params: { lat: latitude, lon: longitude, lang: "en" } },
        { retries: 0 }
    );

    const properties = data?.features?.[0]?.properties;

    if (!properties?.name) return null;

    return {
        name: clean(properties.name),
        district: clean(properties.county || properties.district),
        state: clean(properties.state),
        country: clean(properties.country),
        countryCode: clean(properties.countrycode).toUpperCase(),
    };
};

const reverseOpenWeather = async (latitude, longitude) => {
    const key = process.env.OPENWEATHER_API_KEY;

    if (!key) return null;

    const data = await getJson(
        OPENWEATHER_REVERSE_URL,
        { params: { lat: latitude, lon: longitude, limit: 1, appid: key } },
        { retries: 0 }
    );

    const place = data?.[0];

    if (!place?.name) return null;

    return {
        name: clean(place.name),
        district: "",
        state: clean(place.state),
        country: clean(place.country),
        countryCode: clean(place.country).toUpperCase(),
    };
};

/** Turn GPS coordinates into a readable place, trying each provider in turn. */
const reversePlace = async (latitude, longitude) => {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;

    return reverseCache.wrap(key, async () => {
        for (const lookup of [reverseNominatim, reversePhoton, reverseOpenWeather]) {
            try {
                const place = await lookup(latitude, longitude);

                if (place) {
                    return {
                        ...place,
                        subtitle: describe(place),
                        latitude: Number(latitude.toFixed(4)),
                        longitude: Number(longitude.toFixed(4)),
                    };
                }
            } catch (error) {
                // try the next provider
            }
        }

        return null;
    });
};

module.exports = { searchPlaces, reversePlace, _internals: { norm, dedupe, fromOpenMeteo, fromPhoton, searchCache, reverseCache } };
