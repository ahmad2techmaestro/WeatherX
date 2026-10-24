const clamp = (value, min = 0, max = 100) => {
    return Math.min(Math.max(Math.round(value), min), max);
};

const calculateTemperatureScore = (temperature) => {
    const idealTemperature = 22;

    const difference = Math.abs(
        temperature - idealTemperature
    );

    return clamp(100 - difference * 4);
};

const calculateHumidityScore = (humidity) => {
    const idealHumidity = 45;

    const difference = Math.abs(
        humidity - idealHumidity
    );

    return clamp(100 - difference * 1.5);
};

const calculateWindScore = (windSpeed) => {
    if (windSpeed <= 3) return 100;
    if (windSpeed <= 5) return 85;
    if (windSpeed <= 8) return 65;
    if (windSpeed <= 12) return 40;

    return 20;
};

const calculateCloudScore = (cloudiness) => {
    return clamp(100 - cloudiness * 0.5);
};

const getRainRisk = (rainProbability = 0) => {
    if (rainProbability >= 70) return "High";
    if (rainProbability >= 40) return "Moderate";
    if (rainProbability >= 15) return "Low";

    return "Very Low";
};

const getComfortLabel = (score) => {
    if (score >= 80) return "Excellent";
    if (score >= 65) return "Good";
    if (score >= 45) return "Moderate";
    if (score >= 25) return "Poor";

    return "Very Poor";
};

const calculateWeatherIntelligence = ({
    temperature,
    humidity,
    windSpeed,
    cloudiness,
    rainProbability = 0,
}) => {
    const temperatureScore =
        calculateTemperatureScore(temperature);

    const humidityScore =
        calculateHumidityScore(humidity);

    const windScore =
        calculateWindScore(windSpeed);

    const cloudScore =
        calculateCloudScore(cloudiness);

    const comfortScore = clamp(
        temperatureScore * 0.4 +
        humidityScore * 0.3 +
        windScore * 0.2 +
        cloudScore * 0.1
    );

    const outdoorScore = clamp(
        temperatureScore * 0.35 +
        humidityScore * 0.2 +
        windScore * 0.2 +
        cloudScore * 0.15 +
        (100 - rainProbability) * 0.1
    );

    const activityScore = clamp(
        temperatureScore * 0.35 +
        humidityScore * 0.2 +
        windScore * 0.25 +
        (100 - rainProbability) * 0.2
    );

    return {
        comfort: {
            score: comfortScore,
            label: getComfortLabel(comfortScore),
        },

        outdoor: {
            score: outdoorScore,
            label: getComfortLabel(outdoorScore),
        },

        activity: {
            score: activityScore,
            label: getComfortLabel(activityScore),
        },

        rain: {
            probability: rainProbability,
            risk: getRainRisk(rainProbability),
        },
    };
};

module.exports = {
    calculateWeatherIntelligence,
};