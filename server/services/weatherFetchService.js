const axios = require("axios");

const OPENWEATHER_BASE_URL =
    "https://api.openweathermap.org/data/2.5/weather";

const getCurrentWeatherByCoordinates = async ({
    latitude,
    longitude,
}) => {
    if (
        !Number.isFinite(Number(latitude)) ||
        !Number.isFinite(Number(longitude))
    ) {
        throw new Error(
            "Valid latitude and longitude are required."
        );
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        throw new Error(
            "OPENWEATHER_API_KEY is not configured."
        );
    }

    const response = await axios.get(
        OPENWEATHER_BASE_URL,
        {
            params: {
                lat: Number(latitude),
                lon: Number(longitude),
                appid: apiKey,
                units: "metric",
            },

            timeout: 10000,
        }
    );

    const data = response.data;

    return {
        city:
            data?.name ||
            "",

        country:
            data?.sys?.country ||
            "",

        latitude:
            Number(data?.coord?.lat),

        longitude:
            Number(data?.coord?.lon),

        temperature:
            Number(data?.main?.temp),

        humidity:
            Number(data?.main?.humidity),

        windSpeed:
            Number(data?.wind?.speed) * 3.6,

        condition:
            data?.weather?.[0]?.main ||
            "",

        description:
            data?.weather?.[0]?.description ||
            "",

        observedAt:
            data?.dt
                ? new Date(data.dt * 1000)
                : new Date(),
    };
};

module.exports = {
    getCurrentWeatherByCoordinates,
};