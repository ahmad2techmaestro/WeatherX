const HistoricalWeather = require("../models/HistoricalWeather");

const saveHistoricalWeather = async ({
    weather,
    airQuality,
    source = "openweathermap",
}) => {
    if (!weather?.coord || !weather?.main) {
        throw new Error(
            "Invalid weather data for historical storage."
        );
    }

    const observedAt = new Date(
        Number(weather.dt) * 1000
    );

    if (Number.isNaN(observedAt.getTime())) {
        throw new Error(
            "Invalid weather observation timestamp."
        );
    }

    // ==================================================
    // AIR QUALITY NORMALIZATION
    //
    // OpenWeather response:
    //
    // {
    //     main: {
    //         aqi
    //     },
    //     components: {
    //         pm2_5,
    //         pm10,
    //         co,
    //         no2,
    //         so2,
    //         o3
    //     }
    // }
    //
    // Also supports already-normalized data.
    // ==================================================

    const rawAirQuality =
        airQuality?.raw ||
        airQuality?.data ||
        airQuality;

    const airQualityMain =
        rawAirQuality?.main || {};

    const airQualityComponents =
        rawAirQuality?.components || {};

    const normalizedAQI =
        airQualityMain.aqi ??
        rawAirQuality?.aqi ??
        null;

    const normalizedPollutants = {
        pm2_5:
            airQualityComponents.pm2_5 ??
            rawAirQuality?.pm2_5 ??
            null,

        pm10:
            airQualityComponents.pm10 ??
            rawAirQuality?.pm10 ??
            null,

        co:
            airQualityComponents.co ??
            rawAirQuality?.co ??
            null,

        no2:
            airQualityComponents.no2 ??
            rawAirQuality?.no2 ??
            null,

        so2:
            airQualityComponents.so2 ??
            rawAirQuality?.so2 ??
            null,

        o3:
            airQualityComponents.o3 ??
            rawAirQuality?.o3 ??
            null,
    };

    // ==================================================
    // HISTORICAL WEATHER RECORD
    // ==================================================

    const record = {
        location: {
            city: weather.name,
            country:
                weather.sys?.country || "",

            latitude:
                weather.coord.lat,

            longitude:
                weather.coord.lon,
        },

        observedAt,

        weather: {
            temperature:
                weather.main.temp,

            feelsLike:
                weather.main.feels_like,

            minTemperature:
                weather.main.temp_min,

            maxTemperature:
                weather.main.temp_max,

            humidity:
                weather.main.humidity,

            pressure:
                weather.main.pressure,

            visibility:
                weather.visibility !== undefined &&
                weather.visibility !== null
                    ? weather.visibility / 1000
                    : null,

            windSpeed:
                weather.wind?.speed ?? 0,

            windDirection:
                weather.wind?.deg ?? 0,

            cloudiness:
                weather.clouds?.all ?? 0,

            condition:
                weather.weather?.[0]?.main || "",

            description:
                weather.weather?.[0]
                    ?.description || "",

            icon:
                weather.weather?.[0]?.icon || "",

            rainfall:
                weather.rain?.["1h"] ??
                weather.rain?.["3h"] ??
                0,
        },

        airQuality: {
            aqi: normalizedAQI,

            pm2_5:
                normalizedPollutants.pm2_5,

            pm10:
                normalizedPollutants.pm10,

            co:
                normalizedPollutants.co,

            no2:
                normalizedPollutants.no2,

            so2:
                normalizedPollutants.so2,

            o3:
                normalizedPollutants.o3,
        },

        source,
    };

    // ==================================================
    // SAVE HISTORICAL OBSERVATION
    // ==================================================

    try {
        return await HistoricalWeather.create(
            record
        );
    } catch (error) {
        // Duplicate observation is intentionally ignored.
        if (error.code === 11000) {
            return null;
        }

        throw error;
    }
};

module.exports = {
    saveHistoricalWeather,
};