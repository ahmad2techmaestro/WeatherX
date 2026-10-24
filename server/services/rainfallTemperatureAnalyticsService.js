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
// NUMERIC ACCUMULATOR
// ==================================================

const createAccumulator = () => ({
    sum: 0,
    count: 0,
    minimum: null,
    maximum: null,
});

const addValue = (
    accumulator,
    value
) => {
    if (!Number.isFinite(value)) {
        return;
    }

    accumulator.sum += value;
    accumulator.count += 1;

    if (
        accumulator.minimum === null ||
        value < accumulator.minimum
    ) {
        accumulator.minimum = value;
    }

    if (
        accumulator.maximum === null ||
        value > accumulator.maximum
    ) {
        accumulator.maximum = value;
    }
};

const getAverage = (
    accumulator
) => {
    if (!accumulator.count) {
        return null;
    }

    return Number(
        (
            accumulator.sum /
            accumulator.count
        ).toFixed(2)
    );
};

const getMinimum = (
    accumulator
) => {
    return accumulator.minimum;
};

const getMaximum = (
    accumulator
) => {
    return accumulator.maximum;
};

// ==================================================
// DAILY ACCUMULATOR
// ==================================================

const createDailyAccumulator = (
    date
) => ({
    date,

    temperature:
        createAccumulator(),

    rainfall:
        createAccumulator(),

    observationCount: 0,
});

// ==================================================
// DAILY TRENDS
// ==================================================

const buildDailyTrends = (
    dailyMap
) => {
    return Array.from(
        dailyMap.values()
    ).map((daily) => {
        const totalRainfall =
            daily.rainfall.sum;

        return {
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

            rainfall: {
                total:
                    Number(
                        totalRainfall.toFixed(
                            2
                        )
                    ),

                average:
                    getAverage(
                        daily.rainfall
                    ),
            },

            observationCount:
                daily.observationCount,
        };
    });
};

// ==================================================
// GET RAINFALL & TEMPERATURE ANALYTICS
// ==================================================

const getRainfallTemperatureAnalytics =
    async ({
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

                summary: {
                    observationCount: 0,
                    rainyObservationCount: 0,
                    rainyDayCount: 0,
                    totalRainfall: 0,
                },

                temperature: {},

                rainfall: {},

                trends: [],

                insights: [],
            };
        }

        // ==================================================
        // GLOBAL ACCUMULATORS
        // ==================================================

        const temperatures =
            createAccumulator();

        const rainfallValues =
            createAccumulator();

        const dailyMap = new Map();

        let rainyObservationCount = 0;

        // ==================================================
        // SINGLE PASS OVER RECORDS
        // ==================================================

        records.forEach((record) => {
            const weather =
                record.weather || {};

            const temperature =
                weather.temperature;

            const rainfall =
                weather.rainfall;

            addValue(
                temperatures,
                temperature
            );

            addValue(
                rainfallValues,
                rainfall
            );

            if (
                Number.isFinite(
                    rainfall
                ) &&
                rainfall > 0
            ) {
                rainyObservationCount += 1;
            }

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

            addValue(
                daily.temperature,
                temperature
            );

            addValue(
                daily.rainfall,
                rainfall
            );

            daily.observationCount += 1;
        });

        // ==================================================
        // DAILY ANALYTICS
        // ==================================================

        const trends =
            buildDailyTrends(
                dailyMap
            );

        const rainyDayCount =
            trends.filter(
                (trend) =>
                    trend.rainfall.total > 0
            ).length;

        // ==================================================
        // RAINFALL SUMMARY
        // ==================================================

        const totalRainfall =
            rainfallValues.sum;

        const maximumTemperature =
            getMaximum(
                temperatures
            );

        const minimumTemperature =
            getMinimum(
                temperatures
            );

        const temperatureRange =
            temperatures.count
                ? Number(
                      (
                          maximumTemperature -
                          minimumTemperature
                      ).toFixed(2)
                  )
                : null;

        // ==================================================
        // INSIGHTS
        // ==================================================

        const insights = [];

        if (rainyDayCount >= 3) {
            insights.push({
                type: "info",
                category: "rainfall",

                title:
                    "Frequent Rainfall",

                message:
                    "Rainfall has been recorded across multiple days during the selected period.",
            });
        }

        if (
            Number.isFinite(
                totalRainfall
            ) &&
            totalRainfall >= 20
        ) {
            insights.push({
                type: "warning",
                category: "rainfall",

                title:
                    "Significant Rainfall",

                message:
                    "The selected period contains a relatively high accumulated rainfall.",
            });
        }

        if (
            temperatures.count &&
            temperatureRange >= 12
        ) {
            insights.push({
                type: "info",
                category:
                    "temperature",

                title:
                    "Wide Temperature Range",

                message:
                    "Temperature observations show a noticeable variation during the selected period.",
            });
        }

        // ==================================================
        // RESULT
        // ==================================================

        return {
            period: {
                days: safeDays,
                start,
                end,
            },

            location:
                records[0]?.location ||
                null,

            summary: {
                observationCount:
                    records.length,

                rainyObservationCount,

                rainyDayCount,

                totalRainfall:
                    Number(
                        totalRainfall.toFixed(
                            2
                        )
                    ),
            },

            temperature: {
                average:
                    getAverage(
                        temperatures
                    ),

                minimum:
                    minimumTemperature,

                maximum:
                    maximumTemperature,

                range:
                    temperatureRange,
            },

            rainfall: {
                total:
                    Number(
                        totalRainfall.toFixed(
                            2
                        )
                    ),

                averagePerObservation:
                    getAverage(
                        rainfallValues
                    ),

                maximumPerObservation:
                    getMaximum(
                        rainfallValues
                    ),
            },

            trends,

            insights,
        };
    };

module.exports = {
    getRainfallTemperatureAnalytics,
};