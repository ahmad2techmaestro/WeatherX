const buildAdvancedWeatherInsights = ({
    currentWeather,
    historicalTrends = [],
    historicalSummary = {},
}) => {
    const insights = [];

    if (!currentWeather) {
        return insights;
    }

    const currentTemperature =
        Number(currentWeather.temperature);

    const currentHumidity =
        Number(currentWeather.humidity);

    const currentWindSpeed =
        Number(currentWeather.windSpeed);

    // ==================================================
    // TEMPERATURE TREND
    // ==================================================

    const temperatureTrend =
        historicalTrends
            .map((item) => ({
                date: item.date,
                average:
                    Number(
                        item.temperature?.average
                    ),
            }))
            .filter(
                (item) =>
                    Number.isFinite(item.average)
            );

    if (
        Number.isFinite(currentTemperature) &&
        temperatureTrend.length >= 2
    ) {
        const recent =
            temperatureTrend[
                temperatureTrend.length - 1
            ];

        const previous =
            temperatureTrend[
                temperatureTrend.length - 2
            ];

        const difference =
            recent.average -
            previous.average;

        if (difference >= 2) {
            insights.push({
                type: "warning",
                category: "temperature",
                title: "Warming Trend",
                message:
                    "Recent observations show a noticeable upward temperature trend.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        } else if (difference <= -2) {
            insights.push({
                type: "info",
                category: "temperature",
                title: "Cooling Trend",
                message:
                    "Recent observations show a noticeable downward temperature trend.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        }
    }

    // ==================================================
    // HISTORICAL TEMPERATURE COMPARISON
    // ==================================================

    const historicalAverage =
        Number(
            historicalSummary
                ?.temperature?.average
        );

    if (
        Number.isFinite(currentTemperature) &&
        Number.isFinite(historicalAverage)
    ) {
        const difference =
            currentTemperature -
            historicalAverage;

        if (difference >= 3) {
            insights.push({
                type: "warning",
                category: "temperature",
                title: "Above Recent Average",
                message:
                    "The current temperature is noticeably higher than the recent historical average.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        } else if (difference <= -3) {
            insights.push({
                type: "info",
                category: "temperature",
                title: "Below Recent Average",
                message:
                    "The current temperature is noticeably lower than the recent historical average.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        }
    }

    // ==================================================
    // HUMIDITY TREND
    // ==================================================

    const humidityTrend =
        historicalTrends
            .map((item) =>
                Number(
                    item.humidity?.average
                )
            )
            .filter(Number.isFinite);

    if (
        Number.isFinite(currentHumidity) &&
        humidityTrend.length >= 2
    ) {
        const recent =
            humidityTrend[
                humidityTrend.length - 1
            ];

        const previous =
            humidityTrend[
                humidityTrend.length - 2
            ];

        const difference =
            recent - previous;

        if (difference >= 10) {
            insights.push({
                type: "warning",
                category: "humidity",
                title: "Humidity Rising",
                message:
                    "Humidity has increased noticeably in recent observations.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        } else if (difference <= -10) {
            insights.push({
                type: "positive",
                category: "humidity",
                title: "Humidity Falling",
                message:
                    "Humidity has decreased noticeably in recent observations.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        }
    }

    // ==================================================
    // WIND TREND
    // ==================================================

    const windTrend =
        historicalTrends
            .map((item) =>
                Number(
                    item.wind?.averageSpeed
                )
            )
            .filter(Number.isFinite);

    if (
        Number.isFinite(currentWindSpeed) &&
        windTrend.length >= 2
    ) {
        const recent =
            windTrend[
                windTrend.length - 1
            ];

        const previous =
            windTrend[
                windTrend.length - 2
            ];

        const difference =
            recent - previous;

        if (difference >= 3) {
            insights.push({
                type: "warning",
                category: "wind",
                title: "Wind Activity Increasing",
                message:
                    "Wind speeds have increased noticeably compared with the previous observation period.",
                value: Number(
                    difference.toFixed(1)
                ),
            });
        }
    }

    // ==================================================
    // TEMPERATURE RANGE
    // ==================================================

    const minimumTemperature =
        Number(
            historicalSummary
                ?.temperature?.minimum
        );

    const maximumTemperature =
        Number(
            historicalSummary
                ?.temperature?.maximum
        );

    if (
        Number.isFinite(currentTemperature) &&
        Number.isFinite(minimumTemperature) &&
        Number.isFinite(maximumTemperature)
    ) {
        const range =
            maximumTemperature -
            minimumTemperature;

        if (range >= 12) {
            insights.push({
                type: "info",
                category: "temperature",
                title: "Wide Temperature Variation",
                message:
                    "Recent observations show a relatively wide temperature range.",
                value: Number(
                    range.toFixed(1)
                ),
            });
        }
    }

    // ==================================================
    // DATA COVERAGE
    // ==================================================

    const observationCount =
        Number(
            historicalSummary
                ?.observationCount
        );

    if (
        Number.isFinite(observationCount) &&
        observationCount >= 10
    ) {
        insights.push({
            type: "positive",
            category: "data",
            title: "Strong Historical Coverage",
            message:
                "There is sufficient recent weather history to identify meaningful short-term trends.",
            value: observationCount,
        });
    }

    return insights.slice(0, 6);
};

module.exports = {
    buildAdvancedWeatherInsights,
};