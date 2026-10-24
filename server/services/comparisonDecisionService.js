const getScoreLevel = (score) => {
    if (typeof score !== "number") {
        return "Unknown";
    }

    if (score >= 80) {
        return "Excellent";
    }

    if (score >= 65) {
        return "Good";
    }

    if (score >= 50) {
        return "Moderate";
    }

    return "Low";
};

// ==================================================
// COMFORT EXPLANATION
// ==================================================

const explainComfort = ({
    temperature,
    humidity,
    windSpeed,
    score,
}) => {
    const factors = [];

    if (typeof temperature === "number") {
        if (temperature >= 20 && temperature <= 28) {
            factors.push("mild temperature");
        } else if (temperature > 32) {
            factors.push("high temperature");
        } else if (temperature < 12) {
            factors.push("low temperature");
        }
    }

    if (typeof humidity === "number") {
        if (humidity >= 70) {
            factors.push("high humidity");
        } else if (humidity <= 35) {
            factors.push("low humidity");
        } else {
            factors.push("moderate humidity");
        }
    }

    if (typeof windSpeed === "number") {
        if (windSpeed > 8) {
            factors.push("strong wind");
        } else if (windSpeed < 2) {
            factors.push("light wind");
        }
    }

    const level = getScoreLevel(score);

    let explanation = "";

    if (level === "Excellent") {
        explanation =
            "Overall conditions are highly comfortable.";
    } else if (level === "Good") {
        explanation =
            "Weather conditions are generally comfortable.";
    } else if (level === "Moderate") {
        explanation =
            "Some weather factors may reduce comfort.";
    } else if (level === "Low") {
        explanation =
            "Multiple weather factors may affect comfort.";
    } else {
        explanation =
            "Comfort conditions could not be determined.";
    }

    if (factors.length) {
        explanation += ` Key factors: ${factors.join(", ")}.`;
    }

    return explanation;
};

// ==================================================
// OUTDOOR EXPLANATION
// ==================================================

const explainOutdoor = ({
    temperature,
    humidity,
    windSpeed,
    cloudiness,
    score,
}) => {
    const factors = [];

    if (typeof temperature === "number") {
        if (temperature >= 18 && temperature <= 30) {
            factors.push("comfortable temperature");
        } else if (temperature > 35) {
            factors.push("high heat");
        } else if (temperature < 10) {
            factors.push("cold conditions");
        }
    }

    if (
        typeof humidity === "number" &&
        humidity > 80
    ) {
        factors.push("high humidity");
    }

    if (
        typeof windSpeed === "number" &&
        windSpeed > 8
    ) {
        factors.push("strong wind");
    }

    if (typeof cloudiness === "number") {
        if (cloudiness >= 80) {
            factors.push("heavy cloud cover");
        } else if (cloudiness <= 25) {
            factors.push("mostly clear skies");
        }
    }

    const level = getScoreLevel(score);

    let explanation = "";

    if (level === "Excellent") {
        explanation =
            "Outdoor conditions are highly favorable.";
    } else if (level === "Good") {
        explanation =
            "Conditions are generally suitable for outdoor activities.";
    } else if (level === "Moderate") {
        explanation =
            "Outdoor activities may be comfortable with some consideration.";
    } else if (level === "Low") {
        explanation =
            "Current conditions may make outdoor activities less comfortable.";
    } else {
        explanation =
            "Outdoor conditions could not be determined.";
    }

    if (factors.length) {
        explanation += ` Key factors: ${factors.join(", ")}.`;
    }

    return explanation;
};

// ==================================================
// ACTIVITY EXPLANATION
// ==================================================

const explainActivity = ({
    temperature,
    humidity,
    windSpeed,
    score,
}) => {
    const factors = [];

    if (typeof temperature === "number") {
        if (temperature >= 16 && temperature <= 28) {
            factors.push(
                "activity-friendly temperature"
            );
        } else if (temperature > 32) {
            factors.push(
                "heat may increase exertion"
            );
        } else if (temperature < 10) {
            factors.push(
                "cold may reduce activity comfort"
            );
        }
    }

    if (
        typeof humidity === "number" &&
        humidity > 75
    ) {
        factors.push("high humidity");
    }

    if (typeof windSpeed === "number") {
        if (windSpeed > 8) {
            factors.push("strong wind");
        } else if (windSpeed <= 5) {
            factors.push("manageable wind");
        }
    }

    const level = getScoreLevel(score);

    let explanation = "";

    if (level === "Excellent") {
        explanation =
            "Conditions are highly supportive of outdoor activity.";
    } else if (level === "Good") {
        explanation =
            "Conditions are generally supportive of outdoor activity.";
    } else if (level === "Moderate") {
        explanation =
            "Activity is possible, although weather conditions may require some adjustment.";
    } else if (level === "Low") {
        explanation =
            "Weather conditions may limit comfortable outdoor activity.";
    } else {
        explanation =
            "Activity conditions could not be determined.";
    }

    if (factors.length) {
        explanation += ` Key factors: ${factors.join(", ")}.`;
    }

    return explanation;
};

// ==================================================
// AIR QUALITY EXPLANATION
// ==================================================

const explainAirQuality = ({
    aqi,
    label,
}) => {
    if (typeof aqi !== "number") {
        return {
            level: "Unknown",
            explanation:
                "Air-quality information is unavailable.",
        };
    }

    let explanation;

    switch (aqi) {
        case 1:
            explanation =
                "Air quality is at the lowest level of the OpenWeather 1–5 index.";
            break;

        case 2:
            explanation =
                "Air quality is generally acceptable, with some pollutants present.";
            break;

        case 3:
            explanation =
                "Air quality is moderate and pollutant levels should be considered.";
            break;

        case 4:
            explanation =
                "Air pollution is elevated and sensitive individuals may need extra caution.";
            break;

        case 5:
            explanation =
                "Air pollution is at the highest level of the OpenWeather 1–5 index.";
            break;

        default:
            explanation =
                "Air-quality conditions could not be classified.";
    }

    return {
        level: label || `Index ${aqi}`,
        explanation,
    };
};

// ==================================================
// COMPLETE DECISION ANALYSIS
// ==================================================

const generateComparisonDecision = ({
    temperature,
    humidity,
    windSpeed,
    cloudiness,
    intelligence,
    airQuality,
}) => {
    // ==================================================
    // IMPORTANT:
    // Weather Intelligence structure:
    //
    // intelligence.comfort.score
    // intelligence.outdoor.score
    // intelligence.activity.score
    // ==================================================

    const comfortScore =
        intelligence?.comfort?.score ?? null;

    const outdoorScore =
        intelligence?.outdoor?.score ?? null;

    const activityScore =
        intelligence?.activity?.score ?? null;

    const airQualityAnalysis =
        explainAirQuality({
            aqi: airQuality?.aqi,
            label: airQuality?.label,
        });

    return {
        comfort: {
            score: comfortScore,
            level: getScoreLevel(
                comfortScore
            ),
            explanation:
                explainComfort({
                    temperature,
                    humidity,
                    windSpeed,
                    score: comfortScore,
                }),
        },

        outdoor: {
            score: outdoorScore,
            level: getScoreLevel(
                outdoorScore
            ),
            explanation:
                explainOutdoor({
                    temperature,
                    humidity,
                    windSpeed,
                    cloudiness,
                    score: outdoorScore,
                }),
        },

        activity: {
            score: activityScore,
            level: getScoreLevel(
                activityScore
            ),
            explanation:
                explainActivity({
                    temperature,
                    humidity,
                    windSpeed,
                    score: activityScore,
                }),
        },

        airQuality: {
            score:
                airQuality?.aqi ?? null,
            level:
                airQualityAnalysis.level,
            explanation:
                airQualityAnalysis.explanation,
        },
    };
};

module.exports = {
    generateComparisonDecision,
};