const generateWeatherInsights = ({
    temperature,
    feelsLike,
    humidity,
    windSpeed,
    rainProbability = 0,
    cloudiness,
}) => {
    const insights = [];

    // Temperature insight
    if (temperature >= 35) {
        insights.push({
            type: "warning",
            title: "High Temperature",
            message:
                "It is quite hot outside. Consider avoiding prolonged outdoor activity during peak afternoon hours.",
        });
    } else if (temperature >= 28) {
        insights.push({
            type: "info",
            title: "Warm Conditions",
            message:
                "Warm weather is expected. Stay hydrated if you plan to spend extended time outdoors.",
        });
    } else if (temperature >= 18 && temperature <= 26) {
        insights.push({
            type: "positive",
            title: "Comfortable Temperature",
            message:
                "The temperature is within a comfortable range for most outdoor activities.",
        });
    } else if (temperature < 10) {
        insights.push({
            type: "warning",
            title: "Cold Conditions",
            message:
                "Temperatures are low. Consider wearing appropriate layers before heading outside.",
        });
    }

    // Feels-like insight
    if (feelsLike - temperature >= 3) {
        insights.push({
            type: "warning",
            title: "Feels Warmer",
            message:
                "The temperature may feel noticeably warmer than the actual reading because of current atmospheric conditions.",
        });
    }

    // Humidity insight
    if (humidity >= 75) {
        insights.push({
            type: "warning",
            title: "High Humidity",
            message:
                "High humidity may make outdoor exercise feel more difficult and uncomfortable.",
        });
    } else if (humidity <= 30) {
        insights.push({
            type: "info",
            title: "Dry Air",
            message:
                "The air is relatively dry. Staying hydrated can help maintain comfort outdoors.",
        });
    }

    // Wind insight
    if (windSpeed >= 10) {
        insights.push({
            type: "warning",
            title: "Strong Winds",
            message:
                "Strong winds may affect cycling, running and other exposed outdoor activities.",
        });
    } else if (windSpeed <= 5) {
        insights.push({
            type: "positive",
            title: "Light Winds",
            message:
                "Wind conditions are relatively calm and should have limited impact on outdoor activities.",
        });
    }

    // Rain insight
    if (rainProbability >= 70) {
        insights.push({
            type: "warning",
            title: "High Rain Probability",
            message:
                "Rain is likely. Consider carrying an umbrella or adjusting outdoor plans.",
        });
    } else if (rainProbability >= 40) {
        insights.push({
            type: "info",
            title: "Possible Rain",
            message:
                "There is a moderate chance of rain. Keep an eye on changing conditions.",
        });
    } else if (rainProbability < 20) {
        insights.push({
            type: "positive",
            title: "Low Rain Risk",
            message:
                "There is currently a low probability of rain.",
        });
    }

    // Cloud insight
    if (cloudiness >= 80) {
        insights.push({
            type: "info",
            title: "Overcast Sky",
            message:
                "Cloud cover is high, so direct sunlight may be limited.",
        });
    } else if (cloudiness <= 20) {
        insights.push({
            type: "positive",
            title: "Mostly Clear",
            message:
                "Low cloud cover means clearer skies and more direct sunlight.",
        });
    }

    return insights.slice(0, 5);
};

module.exports = {
    generateWeatherInsights,
};