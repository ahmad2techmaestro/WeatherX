/**
 * WMO weather interpretation codes (as returned by Open-Meteo) mapped to the
 * small set of conditions the UI knows how to draw.
 */
const CODES = {
    0: ["clear", "Clear sky"],
    1: ["mostly-clear", "Mainly clear"],
    2: ["partly-cloudy", "Partly cloudy"],
    3: ["overcast", "Overcast"],
    45: ["fog", "Fog"],
    48: ["fog", "Rime fog"],
    51: ["drizzle", "Light drizzle"],
    53: ["drizzle", "Drizzle"],
    55: ["drizzle", "Dense drizzle"],
    56: ["freezing-rain", "Freezing drizzle"],
    57: ["freezing-rain", "Heavy freezing drizzle"],
    61: ["rain", "Light rain"],
    63: ["rain", "Rain"],
    65: ["heavy-rain", "Heavy rain"],
    66: ["freezing-rain", "Freezing rain"],
    67: ["freezing-rain", "Heavy freezing rain"],
    71: ["snow", "Light snow"],
    73: ["snow", "Snow"],
    75: ["snow", "Heavy snow"],
    77: ["snow", "Snow grains"],
    80: ["rain", "Light showers"],
    81: ["rain", "Showers"],
    82: ["heavy-rain", "Violent showers"],
    85: ["snow", "Snow showers"],
    86: ["snow", "Heavy snow showers"],
    95: ["thunderstorm", "Thunderstorm"],
    96: ["hail", "Thunderstorm with hail"],
    99: ["hail", "Severe thunderstorm with hail"],
};

const describeCode = (code) => {
    // Number(null) is 0 ("clear"), so a missing code must be handled before the lookup.
    const entry = code === null || code === undefined || code === "" ? undefined : CODES[Number(code)];

    if (!entry) return { key: "overcast", label: "Cloudy" };

    return { key: entry[0], label: entry[1] };
};

const WET = new Set(["drizzle", "rain", "heavy-rain", "freezing-rain", "thunderstorm", "hail"]);

const isWetCondition = (key) => WET.has(key);

module.exports = { describeCode, isWetCondition };
