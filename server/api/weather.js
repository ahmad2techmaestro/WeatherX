const express = require("express");
const axios = require("axios");

const {
    calculateWeatherIntelligence,
} = require("../services/weatherIntelligence");

const {
    getActivityRecommendations,
} = require("../services/activityRecommendation");

const {
    generateWeatherInsights,
} = require("../services/weatherInsights");

const {
    calculateDaylight,
} = require("../services/daylightService");

const {
    analyzeAirQuality,
} = require("../services/airQualityService");

const {
    generateComparisonDecision,
} = require("../services/comparisonDecisionService");

const router = express.Router();

const {
    saveHistoricalWeather,
} = require("../services/historicalWeatherService");

// ==================================================
// LOCATION SEARCH / GEOCODING
//
// GET /api/weather/search?query=luck
//
// Uses OpenWeather Geocoding API server-side so the
// OpenWeather API key is never exposed to the client.
// ==================================================

router.get("/search", async (req, res) => {
    try {
        const query =
            typeof req.query.query === "string"
                ? req.query.query.trim()
                : "";

        if (query.length < 2) {
            return res.status(400).json({
                success: false,
                message:
                    "At least 2 characters are required.",
            });
        }

        const response = await axios.get(
            "https://api.openweathermap.org/geo/1.0/direct",
            {
                params: {
                    q: query,
                    limit: 6,
                    appid:
                        process.env.OPENWEATHER_API_KEY,
                },
            }
        );

        const results = Array.isArray(
            response.data
        )
            ? response.data
            : [];

        const locations = results
            .filter(
                (item) =>
                    Number.isFinite(
                        Number(item.lat)
                    ) &&
                    Number.isFinite(
                        Number(item.lon)
                    )
            )
            .map((item) => ({
                name: item.name || "",
                state: item.state || "",
                country: item.country || "",
                latitude: Number(item.lat),
                longitude: Number(item.lon),
            }));

        return res.status(200).json({
            success: true,
            data: locations,
        });
    } catch (error) {
        console.error(
            "Weather location search error:",
            error?.response?.data ||
                error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to search locations.",
        });
    }
});

// ==================================================
// CURRENT WEATHER
//
// Supports:
// /current?city=Gorakhpur
// /current?lat=26.76&lon=83.37
//
// Coordinates take priority when provided.
// ==================================================

router.get("/current", async (req, res) => {
    try {
        const { city, lat, lon } = req.query;

        const latitude = Number(lat);
        const longitude = Number(lon);

        const hasCoordinates =
            Number.isFinite(latitude) &&
            Number.isFinite(longitude);

        if (!hasCoordinates && (!city || !city.trim())) {
            return res.status(400).json({
                success: false,
                message: "City or valid coordinates are required",
            });
        }

        const weatherParams = {
            appid: process.env.OPENWEATHER_API_KEY,
            units: "metric",
        };

        if (hasCoordinates) {
            weatherParams.lat = latitude;
            weatherParams.lon = longitude;
        } else {
            weatherParams.q = city.trim();
        }

        const response = await axios.get(
            "https://api.openweathermap.org/data/2.5/weather",
            {
                params: weatherParams,
            }
        );

        const weather = response.data;

        // ==================================================
        // AIR QUALITY
        // ==================================================

        const airQualityResponse = await axios.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            {
                params: {
                    lat: weather.coord.lat,
                    lon: weather.coord.lon,
                    appid: process.env.OPENWEATHER_API_KEY,
                },
            }
        );

        const airQuality = analyzeAirQuality(
            airQualityResponse.data.list[0]
        );

        // ==================================================
// HISTORICAL WEATHER SNAPSHOT
// ==================================================

try {
    await saveHistoricalWeather({
        weather,
        airQuality: airQualityResponse.data.list[0],
    });
} catch (historicalError) {
    console.error(
        "Historical weather storage error:",
        historicalError.message
    );
}
        // ==================================================
        // WEATHER INTELLIGENCE
        // ==================================================

        const intelligence = calculateWeatherIntelligence({
            temperature: weather.main.temp,
            humidity: weather.main.humidity,
            windSpeed: weather.wind.speed,
            cloudiness: weather.clouds.all,
        });

        // ==================================================
        // ACTIVITY RECOMMENDATIONS
        // ==================================================

        const recommendations = getActivityRecommendations({
            temperature: weather.main.temp,
            humidity: weather.main.humidity,
            windSpeed: weather.wind.speed,
            cloudiness: weather.clouds.all,
        });

        // ==================================================
        // COMPARISON DECISION ANALYSIS
        // ==================================================

        const decision = generateComparisonDecision({
            temperature: weather.main.temp,
            humidity: weather.main.humidity,
            windSpeed: weather.wind.speed,
            cloudiness: weather.clouds.all,
            intelligence,
            airQuality,
        });

        // ==================================================
        // SMART WEATHER INSIGHTS
        // ==================================================

        const insights = generateWeatherInsights({
            temperature: weather.main.temp,
            feelsLike: weather.main.feels_like,
            humidity: weather.main.humidity,
            windSpeed: weather.wind.speed,
            cloudiness: weather.clouds.all,
        });

        // ==================================================
        // DAYLIGHT INTELLIGENCE
        // ==================================================

        const daylight = calculateDaylight({
            sunrise: weather.sys.sunrise,
            sunset: weather.sys.sunset,
        });

        // ==================================================
        // RESPONSE
        // ==================================================

        res.status(200).json({
            success: true,

            data: {
                location: {
                    city: weather.name,
                    country: weather.sys.country,
                    latitude: weather.coord.lat,
                    longitude: weather.coord.lon,
                },

                temperature: Math.round(weather.main.temp),

                feelsLike: Math.round(
                    weather.main.feels_like
                ),

                minTemperature: Math.round(
                    weather.main.temp_min
                ),

                maxTemperature: Math.round(
                    weather.main.temp_max
                ),

                condition: weather.weather[0].main,
                description: weather.weather[0].description,
                icon: weather.weather[0].icon,

                humidity: weather.main.humidity,
                pressure: weather.main.pressure,

                windSpeed: weather.wind.speed,
                windDirection: weather.wind.deg || 0,

                visibility: weather.visibility
                    ? Math.round(weather.visibility / 1000)
                    : null,

                cloudiness: weather.clouds.all,

                sunrise: weather.sys.sunrise,
                sunset: weather.sys.sunset,

                intelligence,
                recommendations,
                insights,
                daylight,
                airQuality,
                decision,

                timestamp: Date.now(),
            },
        });
    } catch (error) {
        console.error(
            "Weather API Error:",
            error.response?.data || error.message
        );

        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: "Location not found",
            });
        }

        if (error.response?.status === 401) {
            return res.status(500).json({
                success: false,
                message:
                    "Weather API key is invalid or not activated",
            });
        }

        res.status(500).json({
            success: false,
            message: "Unable to fetch weather data",
        });
    }
});

// ==================================================
// MULTI-CITY WEATHER COMPARISON
//
// NEW FORMAT:
// /compare?locations=[JSON encoded locations]
//
// Example location:
// {
//     name: "Gorakhpur",
//     state: "Uttar Pradesh",
//     country: "IN",
//     latitude: 26.76,
//     longitude: 83.37
// }
//
// LEGACY FORMAT ALSO SUPPORTED:
// /compare?cities=Gorakhpur,Lucknow,Delhi
//
// Maximum: 5 locations
// ==================================================

router.get("/compare", async (req, res) => {
    try {
        const { locations, cities } = req.query;

        let locationList = [];

        // ==================================================
        // NEW COORDINATE-BASED FORMAT
        // ==================================================

        if (locations) {
            try {
                const parsedLocations =
                    typeof locations === "string"
                        ? JSON.parse(locations)
                        : locations;

                if (!Array.isArray(parsedLocations)) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Locations must be an array.",
                    });
                }

                locationList = parsedLocations.map(
                    (location) => ({
                        name:
                            typeof location.name === "string"
                                ? location.name.trim()
                                : "",

                        state:
                            typeof location.state === "string"
                                ? location.state.trim()
                                : "",

                        country:
                            typeof location.country === "string"
                                ? location.country.trim()
                                : "",

                        latitude: Number(
                            location.latitude
                        ),

                        longitude: Number(
                            location.longitude
                        ),
                    })
                );
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid locations format.",
                });
            }
        }

        // ==================================================
        // LEGACY CITY-BASED FORMAT
        // ==================================================

        else if (cities) {
            const cityList = cities
                .split(",")
                .map((city) => city.trim())
                .filter(Boolean);

            locationList = cityList.map((city) => ({
                name: city,
                state: "",
                country: "",
                latitude: null,
                longitude: null,
            }));
        }

        // ==================================================
        // VALIDATION
        // ==================================================

        if (!locationList.length) {
            return res.status(400).json({
                success: false,
                message:
                    "At least one location is required.",
            });
        }

        if (locationList.length > 5) {
            return res.status(400).json({
                success: false,
                message:
                    "Maximum 5 locations can be compared.",
            });
        }

        // ==================================================
        // VALIDATE COORDINATES FOR NEW FORMAT
        // ==================================================

        for (const location of locationList) {
            const hasCoordinates =
                Number.isFinite(location.latitude) &&
                Number.isFinite(location.longitude);

            const isLegacyCity =
                !Number.isFinite(location.latitude) &&
                !Number.isFinite(location.longitude) &&
                location.name;

            if (!hasCoordinates && !isLegacyCity) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Valid coordinates are required for ${location.name || "location"}.`,
                });
            }

            if (
                Number.isFinite(location.latitude) &&
                (location.latitude < -90 ||
                    location.latitude > 90)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Invalid latitude for ${location.name || "location"}.`,
                });
            }

            if (
                Number.isFinite(location.longitude) &&
                (location.longitude < -180 ||
                    location.longitude > 180)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Invalid longitude for ${location.name || "location"}.`,
                });
            }
        }

        // ==================================================
        // REMOVE DUPLICATES
        //
        // Coordinate locations are identified by lat/lon.
        // Legacy cities are identified by city name.
        // ==================================================

        const uniqueLocations = [];
        const seenLocations = new Set();

        for (const location of locationList) {
            const hasCoordinates =
                Number.isFinite(location.latitude) &&
                Number.isFinite(location.longitude);

            const uniqueKey = hasCoordinates
                ? `coordinates:${location.latitude.toFixed(
                      6
                  )},${location.longitude.toFixed(6)}`
                : `city:${location.name.toLowerCase()}`;

            if (!seenLocations.has(uniqueKey)) {
                seenLocations.add(uniqueKey);
                uniqueLocations.push(location);
            }
        }

        // ==================================================
        // FETCH ALL LOCATIONS IN PARALLEL
        // ==================================================

        const results = await Promise.all(
            uniqueLocations.map(async (location) => {
                try {
                    const hasCoordinates =
                        Number.isFinite(
                            location.latitude
                        ) &&
                        Number.isFinite(
                            location.longitude
                        );

                    // ------------------------------------------
                    // CURRENT WEATHER
                    // ------------------------------------------

                    const weatherParams = {
                        appid:
                            process.env
                                .OPENWEATHER_API_KEY,
                        units: "metric",
                    };

                    if (hasCoordinates) {
                        weatherParams.lat =
                            location.latitude;

                        weatherParams.lon =
                            location.longitude;
                    } else {
                        weatherParams.q =
                            location.name;
                    }

                    const weatherResponse =
                        await axios.get(
                            "https://api.openweathermap.org/data/2.5/weather",
                            {
                                params: weatherParams,
                            }
                        );

                    const weather =
                        weatherResponse.data;

                    // ------------------------------------------
                    // AIR QUALITY
                    // ------------------------------------------

                    const airQualityResponse =
                        await axios.get(
                            "https://api.openweathermap.org/data/2.5/air_pollution",
                            {
                                params: {
                                    lat:
                                        weather.coord
                                            .lat,

                                    lon:
                                        weather.coord
                                            .lon,

                                    appid:
                                        process.env
                                            .OPENWEATHER_API_KEY,
                                },
                            }
                        );

                    const airQuality =
                        analyzeAirQuality(
                            airQualityResponse.data
                                .list[0]
                        );

                    // ------------------------------------------
                    // WEATHER INTELLIGENCE
                    // ------------------------------------------

                    const intelligence =
                        calculateWeatherIntelligence({
                            temperature:
                                weather.main.temp,

                            humidity:
                                weather.main.humidity,

                            windSpeed:
                                weather.wind.speed,

                            cloudiness:
                                weather.clouds.all,
                        });

                    // ------------------------------------------
                    // ACTIVITY RECOMMENDATIONS
                    // ------------------------------------------

                    const recommendations =
                        getActivityRecommendations({
                            temperature:
                                weather.main.temp,

                            humidity:
                                weather.main.humidity,

                            windSpeed:
                                weather.wind.speed,

                            cloudiness:
                                weather.clouds.all,
                        });

                    // ------------------------------------------
                    // COMPARISON DECISION ANALYSIS
                    // ------------------------------------------

                    const decision =
                        generateComparisonDecision({
                            temperature:
                                weather.main.temp,

                            humidity:
                                weather.main.humidity,

                            windSpeed:
                                weather.wind.speed,

                            cloudiness:
                                weather.clouds.all,

                            intelligence,
                            airQuality,
                        });

                    // ------------------------------------------
                    // RESPONSE
                    // ------------------------------------------

                    return {
                        success: true,

                        data: {
                            location: {
                                city: weather.name,

                                state:
                                    location.state ||
                                    "",

                                country:
                                    weather.sys.country,

                                latitude:
                                    weather.coord.lat,

                                longitude:
                                    weather.coord.lon,
                            },

                            temperature: Math.round(
                                weather.main.temp
                            ),

                            feelsLike: Math.round(
                                weather.main.feels_like
                            ),

                            minTemperature:
                                Math.round(
                                    weather.main.temp_min
                                ),

                            maxTemperature:
                                Math.round(
                                    weather.main.temp_max
                                ),

                            condition:
                                weather.weather[0]
                                    .main,

                            description:
                                weather.weather[0]
                                    .description,

                            icon:
                                weather.weather[0]
                                    .icon,

                            humidity:
                                weather.main.humidity,

                            pressure:
                                weather.main.pressure,

                            windSpeed:
                                weather.wind.speed,

                            windDirection:
                                weather.wind.deg || 0,

                            visibility:
                                weather.visibility
                                    ? Math.round(
                                          weather.visibility /
                                              1000
                                      )
                                    : null,

                            cloudiness:
                                weather.clouds.all,

                            sunrise:
                                weather.sys.sunrise,

                            sunset:
                                weather.sys.sunset,

                            intelligence,

                            recommendations,

                            airQuality,

                            decision,

                            timestamp: Date.now(),
                        },
                    };
                } catch (error) {
                    console.error(
                        `Comparison error for ${location.name}:`,
                        error.response?.data ||
                            error.message
                    );

                    return {
                        success: false,

                        location: {
                            name: location.name,
                            state: location.state,
                            country: location.country,
                            latitude:
                                Number.isFinite(
                                    location.latitude
                                )
                                    ? location.latitude
                                    : null,
                            longitude:
                                Number.isFinite(
                                    location.longitude
                                )
                                    ? location.longitude
                                    : null,
                        },

                        message:
                            error.response?.status === 404
                                ? "Location not found"
                                : "Unable to fetch weather data",
                    };
                }
            })
        );

        // ==================================================
        // SUCCESS / FAILED RESULTS
        // ==================================================

        const successfulResults =
            results.filter(
                (result) => result.success
            );

        const failedResults =
            results.filter(
                (result) => !result.success
            );

        // ==================================================
        // FINAL RESPONSE
        // ==================================================

        res.status(200).json({
            success: true,

            count: successfulResults.length,

            data: successfulResults.map(
                (result) => result.data
            ),

            failed: failedResults,
        });
    } catch (error) {
        console.error(
            "Weather Comparison API Error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to compare weather data.",
        });
    }
});

// ==================================================
 // 5-DAY FORECAST
 // ==================================================

router.get("/forecast", async (req, res) => {
    try {
        const { city, lat, lon } = req.query;

        const latitude = Number(lat);
        const longitude = Number(lon);

        const hasCoordinates =
            Number.isFinite(latitude) &&
            Number.isFinite(longitude);

        if (!hasCoordinates && (!city || !city.trim())) {
            return res.status(400).json({
                success: false,
                message:
                    "City or valid coordinates are required",
            });
        }

        if (
            hasCoordinates &&
            (
                latitude < -90 ||
                latitude > 90 ||
                longitude < -180 ||
                longitude > 180
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid coordinates",
            });
        }

        const forecastParams = {
            appid: process.env.OPENWEATHER_API_KEY,
            units: "metric",
        };

        if (hasCoordinates) {
            forecastParams.lat = latitude;
            forecastParams.lon = longitude;
        } else {
            forecastParams.q = city.trim();
        }

        const response = await axios.get(
            "https://api.openweathermap.org/data/2.5/forecast",
            {
                params: forecastParams,
            }
        );

        const forecastList = response.data.list;
        const dailyForecast = [];
        const groupedByDate = {};

        forecastList.forEach((item) => {
            const date = item.dt_txt.split(" ")[0];

            if (!groupedByDate[date]) {
                groupedByDate[date] = [];
            }

            groupedByDate[date].push(item);
        });

        Object.entries(groupedByDate)
            .slice(0, 5)
            .forEach(([date, items]) => {
                const representative =
                    items.find((item) =>
                        item.dt_txt.includes("12:00:00")
                    ) ||
                    items[Math.floor(items.length / 2)];

                dailyForecast.push({
                    date,
                    temperature: Math.round(
                        representative.main.temp
                    ),
                    feelsLike: Math.round(
                        representative.main.feels_like
                    ),
                    minTemperature: Math.round(
                        Math.min(
                            ...items.map(
                                (item) => item.main.temp_min
                            )
                        )
                    ),
                    maxTemperature: Math.round(
                        Math.max(
                            ...items.map(
                                (item) => item.main.temp_max
                            )
                        )
                    ),
                    condition:
                        representative.weather[0].main,
                    description:
                        representative.weather[0].description,
                    icon:
                        representative.weather[0].icon,
                    humidity:
                        representative.main.humidity,
                    windSpeed:
                        representative.wind.speed,
                    cloudiness:
                        representative.clouds.all,
                    rainProbability: Math.round(
                        (representative.pop || 0) * 100
                    ),
                });
            });

        res.status(200).json({
            success: true,
            data: {
                location: {
                    city: response.data.city.name,
                    country: response.data.city.country,
                    latitude:
                        response.data.city.coord?.lat ??
                        latitude,
                    longitude:
                        response.data.city.coord?.lon ??
                        longitude,
                },
                forecast: dailyForecast,
            },
        });
    } catch (error) {
        console.error(
            "Forecast API Error:",
            error.response?.data ||
                error.message
        );

        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: "Location not found",
            });
        }

        if (error.response?.status === 401) {
            return res.status(500).json({
                success: false,
                message:
                    "Weather API key is invalid or not activated",
            });
        }

        res.status(500).json({
            success: false,
            message:
                "Unable to fetch forecast data",
        });
    }
});

// ==================================================
// WEATHER MAP TILE PROXY
// ==================================================

router.get(
    "/map/:layer/:z/:x/:y",
    async (req, res, next) => {
        try {
            const {
                layer,
                z,
                x,
                y,
            } = req.params;

            const allowedLayers = [
                "temp_new",
                "precipitation_new",
                "clouds_new",
                "wind_new",
                "pressure_new",
            ];

            // Tile coordinates are interpolated into an upstream URL, so they must be plain integers.
            const tileOk =
                /^\d{1,2}$/.test(z) &&
                /^\d{1,7}$/.test(x) &&
                /^\d{1,7}$/.test(y) &&
                Number(z) <= 12;

            if (!tileOk) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid map tile coordinates.",
                });
            }

            if (!process.env.OPENWEATHER_API_KEY) {
                return res.status(503).json({
                    success: false,
                    message: "Weather map layers are not configured.",
                });
            }

            if (!allowedLayers.includes(layer)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid weather map layer.",
                });
            }

            const response = await axios.get(
                `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png`,
                {
                    params: {
                        appid:
                            process.env
                                .OPENWEATHER_API_KEY,
                    },

                    responseType:
                        "arraybuffer",

                    timeout: 8000,
                }
            );

            res.set(
                "Content-Type",
                "image/png"
            );

            res.set(
                "Cache-Control",
                "public, max-age=600"
            );

            res.send(response.data);
        } catch (error) {
            next(error);
        }
    }
);

// ==================================================
// LOCATION SEARCH
// ==================================================

router.get(
    "/search",
    async (req, res, next) => {
        try {
            const { city } = req.query;

            if (!city || !city.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        "City name is required.",
                });
            }

            const response = await axios.get(
                "https://api.openweathermap.org/geo/1.0/direct",
                {
                    params: {
                        q: city.trim(),
                        limit: 5,
                        appid:
                            process.env
                                .OPENWEATHER_API_KEY,
                    },
                }
            );

            const locations =
                response.data.map(
                    (item) => ({
                        name: item.name,
                        country:
                            item.country,
                        state:
                            item.state || "",
                        latitude:
                            item.lat,
                        longitude:
                            item.lon,
                    })
                );

            res.status(200).json({
                success: true,
                count:
                    locations.length,
                data: locations,
            });
        } catch (error) {
            next(error);
        }
    }
);

// ==================================================
// REVERSE GEOCODING
// GPS COORDINATES â†’ LOCATION NAME
// ==================================================

router.get(
    "/reverse",
    async (req, res, next) => {
        try {
            const { lat, lon } = req.query;

            const latitude = Number(lat);
            const longitude =
                Number(lon);

            if (
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid latitude and longitude are required.",
                });
            }

            const response = await axios.get(
                "https://api.openweathermap.org/geo/1.0/reverse",
                {
                    params: {
                        lat: latitude,
                        lon: longitude,
                        limit: 1,
                        appid:
                            process.env
                                .OPENWEATHER_API_KEY,
                    },
                }
            );

            const place =
                response.data?.[0];

            if (!place) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Unable to identify this location.",
                });
            }

            res.status(200).json({
                success: true,

                data: {
                    name: place.name,
                    country:
                        place.country,
                    state:
                        place.state || "",
                    latitude:
                        place.lat,
                    longitude:
                        place.lon,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;
