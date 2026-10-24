const HistoricalWeather = require("../models/HistoricalWeather");

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 30;
const COORDINATE_RANGE = 0.05;

// ==================================================
// DATE RANGE
// ==================================================

const getDateRange = (days = DEFAULT_DAYS) => {
    const end = new Date();

    const start = new Date(end);
    start.setDate(
        start.getDate() - days
    );

    return {
        start,
        end,
    };
};

// ==================================================
// REGEX ESCAPE
// ==================================================

const escapeRegex = (value) => {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
};

// ==================================================
// LOCATION FILTER
// ==================================================

const getLocationFilter = ({
    city,
    latitude,
    longitude,
}) => {
    if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
    ) {
        return {
            "location.latitude": {
                $gte:
                    latitude -
                    COORDINATE_RANGE,

                $lte:
                    latitude +
                    COORDINATE_RANGE,
            },

            "location.longitude": {
                $gte:
                    longitude -
                    COORDINATE_RANGE,

                $lte:
                    longitude +
                    COORDINATE_RANGE,
            },
        };
    }

    if (
        typeof city === "string" &&
        city.trim()
    ) {
        const normalizedCity =
            city.trim();

        return {
            "location.city": {
                $regex: `^${escapeRegex(
                    normalizedCity
                )}$`,

                $options: "i",
            },
        };
    }

    throw new Error(
        "City or valid coordinates are required."
    );
};

// ==================================================
// NUMBER HELPERS
// ==================================================

const addNumber = (
    values,
    value
) => {
    if (Number.isFinite(value)) {
        values.sum += value;
        values.count += 1;

        if (
            values.minimum === null ||
            value < values.minimum
        ) {
            values.minimum = value;
        }

        if (
            values.maximum === null ||
            value > values.maximum
        ) {
            values.maximum = value;
        }
    }
};

const getAverage = (values) => {
    if (!values.count) {
        return null;
    }

    return Number(
        (
            values.sum /
            values.count
        ).toFixed(2)
    );
};

const getMinimum = (values) => {
    return values.minimum;
};

const getMaximum = (values) => {
    return values.maximum;
};

const createNumberAccumulator = () => ({
    sum: 0,
    count: 0,
    minimum: null,
    maximum: null,
});

// ==================================================
// DAILY TREND ACCUMULATOR
// ==================================================

const createDailyAccumulator = (
    date
) => ({
    date,

    temperature:
        createNumberAccumulator(),

    humidity:
        createNumberAccumulator(),

    wind:
        createNumberAccumulator(),

    observationCount: 0,
});

// ==================================================
// BUILD DAILY TRENDS
// ==================================================

const buildDailyTrends = (
    records
) => {
    const dailyMap = new Map();

    records.forEach((record) => {
        const date =
            record.observedAt
                .toISOString()
                .split("T")[0];

        let daily =
            dailyMap.get(date);

        if (!daily) {
            daily =
                createDailyAccumulator(
                    date
                );

            dailyMap.set(
                date,
                daily
            );
        }

        const weather =
            record.weather || {};

        addNumber(
            daily.temperature,
            weather.temperature
        );

        addNumber(
            daily.humidity,
            weather.humidity
        );

        addNumber(
            daily.wind,
            weather.windSpeed
        );

        daily.observationCount += 1;
    });

    return Array.from(
        dailyMap.values()
    ).map((daily) => ({
        date: daily.date,

        temperature: {
            average:
                getAverage(
                    daily.temperature
                ),

            minimum:
                getMinimum(
                    daily.temperature
                ),

            maximum:
                getMaximum(
                    daily.temperature
                ),
        },

        humidity: {
            average:
                getAverage(
                    daily.humidity
                ),
        },

        wind: {
            averageSpeed:
                getAverage(
                    daily.wind
                ),
        },

        observationCount:
            daily.observationCount,
    }));
};

// ==================================================
// GET WEATHER TRENDS
// ==================================================

const getWeatherTrends = async ({
    city,
    latitude,
    longitude,
    days = DEFAULT_DAYS,
}) => {
    const parsedDays =
        Number(days);

    const safeDays =
        Number.isFinite(parsedDays) &&
        parsedDays >= MIN_DAYS &&
        parsedDays <= MAX_DAYS
            ? Math.floor(parsedDays)
            : DEFAULT_DAYS;

    const {
        start,
        end,
    } = getDateRange(safeDays);

    const locationFilter =
        getLocationFilter({
            city,
            latitude,
            longitude,
        });

    const records =
        await HistoricalWeather.find({
            ...locationFilter,

            observedAt: {
                $gte: start,
                $lte: end,
            },
        })
            .sort({
                observedAt: 1,
            })
            .select({
                _id: 0,
                location: 1,
                observedAt: 1,
                weather: 1,
                airQuality: 1,
            })
            .lean();

    if (!records.length) {
        return {
            period: {
                days: safeDays,
                start,
                end,
            },

            location: null,

            latestObservation: null,

            summary: {
                observationCount: 0,
            },

            trends: [],
        };
    }

    // ==================================================
    // LATEST OBSERVATION
    // ==================================================

    const latestRecord =
        records[
            records.length - 1
        ];

    const latestObservation = {
        observedAt:
            latestRecord.observedAt,

        location:
            latestRecord.location,

        weather:
            latestRecord.weather || {},

        airQuality:
            latestRecord.airQuality || {},
    };

    // ==================================================
    // SUMMARY ACCUMULATION
    // ==================================================

    const temperatures =
        createNumberAccumulator();

    const humidityValues =
        createNumberAccumulator();

    const windValues =
        createNumberAccumulator();

    const pressureValues =
        createNumberAccumulator();

    // One pass through records for
    // summary statistics.

    records.forEach((record) => {
        const weather =
            record.weather || {};

        addNumber(
            temperatures,
            weather.temperature
        );

        addNumber(
            humidityValues,
            weather.humidity
        );

        addNumber(
            windValues,
            weather.windSpeed
        );

        addNumber(
            pressureValues,
            weather.pressure
        );
    });

    const location =
        records[0]?.location ||
        null;

    // ==================================================
    // DAILY TRENDS
    // ==================================================

    const trends =
        buildDailyTrends(records);

    // ==================================================
    // FINAL ANALYTICS RESPONSE
    // ==================================================

    return {
        period: {
            days: safeDays,
            start,
            end,
        },

        location,

        latestObservation,

        summary: {
            observationCount:
                records.length,

            temperature: {
                average:
                    getAverage(
                        temperatures
                    ),

                minimum:
                    getMinimum(
                        temperatures
                    ),

                maximum:
                    getMaximum(
                        temperatures
                    ),
            },

            humidity: {
                average:
                    getAverage(
                        humidityValues
                    ),
            },

            wind: {
                averageSpeed:
                    getAverage(
                        windValues
                    ),
            },

            pressure: {
                average:
                    getAverage(
                        pressureValues
                    ),
            },
        },

        trends,
    };
};

module.exports = {
    getWeatherTrends,
};