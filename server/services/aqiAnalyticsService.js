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
// DAILY AQI ACCUMULATOR
// ==================================================

const createDailyAccumulator = (
    date
) => ({
    date,

    aqi: createAccumulator(),

    pm2_5: createAccumulator(),

    pm10: createAccumulator(),

    observationCount: 0,
});

// ==================================================
// AQI LABEL
// ==================================================

const getAQILabel = (aqi) => {
    const labels = {
        1: "Good",
        2: "Fair",
        3: "Moderate",
        4: "Poor",
        5: "Very Poor",
    };

    return labels[aqi] || "Unknown";
};

// ==================================================
// DAILY TRENDS
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

        const airQuality =
            record.airQuality || {};

        addValue(
            daily.aqi,
            airQuality.aqi
        );

        addValue(
            daily.pm2_5,
            airQuality.pm2_5
        );

        addValue(
            daily.pm10,
            airQuality.pm10
        );

        daily.observationCount += 1;
    });

    return Array.from(
        dailyMap.values()
    ).map((daily) => ({
        date: daily.date,

        aqi: {
            average:
                getAverage(
                    daily.aqi
                ),

            minimum:
                getMinimum(
                    daily.aqi
                ),

            maximum:
                getMaximum(
                    daily.aqi
                ),
        },

        pm2_5: {
            average:
                getAverage(
                    daily.pm2_5
                ),
        },

        pm10: {
            average:
                getAverage(
                    daily.pm10
                ),
        },

        observationCount:
            daily.observationCount,
    }));
};

// ==================================================
// GET AQI ANALYTICS
// ==================================================

const getAQIAnalytics = async ({
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

            summary: {
                observationCount: 0,
            },

            pollutants: {},

            trends: [],

            insights: [],
        };
    }

    // ==================================================
    // SUMMARY ACCUMULATORS
    // ==================================================

    const aqiValues =
        createAccumulator();

    const pm25Values =
        createAccumulator();

    const pm10Values =
        createAccumulator();

    const coValues =
        createAccumulator();

    const no2Values =
        createAccumulator();

    const so2Values =
        createAccumulator();

    const o3Values =
        createAccumulator();

    // ==================================================
    // SINGLE PASS OVER RECORDS
    // ==================================================

    records.forEach((record) => {
        const airQuality =
            record.airQuality || {};

        addValue(
            aqiValues,
            airQuality.aqi
        );

        addValue(
            pm25Values,
            airQuality.pm2_5
        );

        addValue(
            pm10Values,
            airQuality.pm10
        );

        addValue(
            coValues,
            airQuality.co
        );

        addValue(
            no2Values,
            airQuality.no2
        );

        addValue(
            so2Values,
            airQuality.so2
        );

        addValue(
            o3Values,
            airQuality.o3
        );
    });

    // ==================================================
    // AQI CHANGE
    // ==================================================

    const firstAQI =
        aqiValues.count
            ? records.find(
                  (record) =>
                      Number.isFinite(
                          record.airQuality
                              ?.aqi
                      )
              )?.airQuality?.aqi
            : null;

    const latestAQI =
        aqiValues.count
            ? [...records]
                  .reverse()
                  .find(
                      (record) =>
                          Number.isFinite(
                              record.airQuality
                                  ?.aqi
                          )
                  )
                  ?.airQuality?.aqi
            : null;

    const aqiChange =
        Number.isFinite(firstAQI) &&
        Number.isFinite(latestAQI)
            ? Number(
                  (
                      latestAQI -
                      firstAQI
                  ).toFixed(2)
              )
            : null;

    // ==================================================
    // DAILY AQI TRENDS
    // ==================================================

    const trends =
        buildDailyTrends(records);

    // ==================================================
    // INSIGHTS
    // ==================================================

    const insights = [];

    if (
        Number.isFinite(aqiChange)
    ) {
        if (aqiChange >= 1) {
            insights.push({
                type: "warning",

                title:
                    "Air Quality Worsening",

                message:
                    "The AQI has increased compared with the beginning of the selected period.",
            });
        } else if (
            aqiChange <= -1
        ) {
            insights.push({
                type: "positive",

                title:
                    "Air Quality Improving",

                message:
                    "The AQI has decreased compared with the beginning of the selected period.",
            });
        }
    }

    const maximumPM25 =
        getMaximum(pm25Values);

    const maximumPM10 =
        getMaximum(pm10Values);

    if (
        Number.isFinite(maximumPM25) &&
        maximumPM25 >= 35
    ) {
        insights.push({
            type: "warning",

            title:
                "Elevated PM2.5",

            message:
                "Recent observations include elevated PM2.5 levels.",
        });
    }

    if (
        Number.isFinite(maximumPM10) &&
        maximumPM10 >= 50
    ) {
        insights.push({
            type: "warning",

            title:
                "Elevated PM10",

            message:
                "Recent observations include elevated PM10 levels.",
        });
    }

    // ==================================================
    // RESULT
    // ==================================================

    const location =
        records[0]?.location || null;

    return {
        period: {
            days: safeDays,
            start,
            end,
        },

        location,

        summary: {
            observationCount:
                records.length,

            aqi: {
                average:
                    getAverage(
                        aqiValues
                    ),

                minimum:
                    getMinimum(
                        aqiValues
                    ),

                maximum:
                    getMaximum(
                        aqiValues
                    ),

                latest:
                    Number.isFinite(
                        latestAQI
                    )
                        ? latestAQI
                        : null,

                latestLabel:
                    Number.isFinite(
                        latestAQI
                    )
                        ? getAQILabel(
                              latestAQI
                          )
                        : "Unknown",

                change:
                    aqiChange,
            },
        },

        pollutants: {
            pm2_5: {
                average:
                    getAverage(
                        pm25Values
                    ),

                minimum:
                    getMinimum(
                        pm25Values
                    ),

                maximum:
                    getMaximum(
                        pm25Values
                    ),
            },

            pm10: {
                average:
                    getAverage(
                        pm10Values
                    ),

                minimum:
                    getMinimum(
                        pm10Values
                    ),

                maximum:
                    getMaximum(
                        pm10Values
                    ),
            },

            co: {
                average:
                    getAverage(
                        coValues
                    ),

                maximum:
                    getMaximum(
                        coValues
                    ),
            },

            no2: {
                average:
                    getAverage(
                        no2Values
                    ),

                maximum:
                    getMaximum(
                        no2Values
                    ),
            },

            so2: {
                average:
                    getAverage(
                        so2Values
                    ),

                maximum:
                    getMaximum(
                        so2Values
                    ),
            },

            o3: {
                average:
                    getAverage(
                        o3Values
                    ),

                maximum:
                    getMaximum(
                        o3Values
                    ),
            },
        },

        trends,

        insights,
    };
};

module.exports = {
    getAQIAnalytics,
};