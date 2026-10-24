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

const getAQIAdvice = (aqi) => {
    if (aqi === 1) {
        return "Air quality is good. Outdoor activities are suitable.";
    }

    if (aqi === 2) {
        return "Air quality is generally acceptable for outdoor activities.";
    }

    if (aqi === 3) {
        return "Air quality is moderate. Sensitive individuals may prefer shorter outdoor exposure.";
    }

    if (aqi === 4) {
        return "Air quality is poor. Consider limiting prolonged outdoor activities.";
    }

    if (aqi === 5) {
        return "Air quality is very poor. Avoid prolonged outdoor exposure when possible.";
    }

    return "Air quality information is currently unavailable.";
};

const getPollutantLevel = (value, thresholds) => {
    if (value <= thresholds.good) return "Low";
    if (value <= thresholds.moderate) return "Moderate";
    return "High";
};

const analyzeAirQuality = (data) => {
    const aqi = data.main.aqi;
    const components = data.components;

    return {
        aqi,
        label: getAQILabel(aqi),
        advice: getAQIAdvice(aqi),

        pollutants: {
            pm2_5: {
                value: components.pm2_5,
                unit: "μg/m³",
                level: getPollutantLevel(components.pm2_5, {
                    good: 12,
                    moderate: 35,
                }),
            },

            pm10: {
                value: components.pm10,
                unit: "μg/m³",
                level: getPollutantLevel(components.pm10, {
                    good: 20,
                    moderate: 50,
                }),
            },

            co: {
                value: components.co,
                unit: "μg/m³",
            },

            no2: {
                value: components.no2,
                unit: "μg/m³",
            },

            so2: {
                value: components.so2,
                unit: "μg/m³",
            },

            o3: {
                value: components.o3,
                unit: "μg/m³",
            },
        },
    };
};

module.exports = {
    analyzeAirQuality,
};