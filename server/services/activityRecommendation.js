const clamp = (value, min = 0, max = 100) => {
    return Math.min(Math.max(Math.round(value), min), max);
};

const getRecommendationLabel = (score) => {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    if (score >= 30) return "Poor";
    return "Not Recommended";
};

const calculateActivityScore = ({
    temperature,
    humidity,
    windSpeed,
    rainProbability,
    cloudiness,
}) => {
    const temperatureScore = clamp(
        100 - Math.abs(temperature - 22) * 4
    );

    const humidityScore = clamp(
        100 - Math.abs(humidity - 45) * 1.5
    );

    const windScore =
        windSpeed <= 3
            ? 100
            : windSpeed <= 5
            ? 85
            : windSpeed <= 8
            ? 65
            : windSpeed <= 12
            ? 40
            : 20;

    const rainScore = 100 - rainProbability;

    const cloudScore = clamp(100 - cloudiness * 0.5);

    return {
        temperatureScore,
        humidityScore,
        windScore,
        rainScore,
        cloudScore,
    };
};

const getActivityRecommendations = ({
    temperature,
    humidity,
    windSpeed,
    rainProbability = 0,
    cloudiness,
}) => {
    const scores = calculateActivityScore({
        temperature,
        humidity,
        windSpeed,
        rainProbability,
        cloudiness,
    });

    const running = clamp(
        scores.temperatureScore * 0.35 +
        scores.humidityScore * 0.2 +
        scores.windScore * 0.25 +
        scores.rainScore * 0.2
    );

    const cycling = clamp(
        scores.temperatureScore * 0.3 +
        scores.humidityScore * 0.15 +
        scores.windScore * 0.35 +
        scores.rainScore * 0.2
    );

    const photography = clamp(
        scores.temperatureScore * 0.2 +
        scores.humidityScore * 0.15 +
        scores.cloudScore * 0.35 +
        scores.rainScore * 0.3
    );

    const travel = clamp(
        scores.temperatureScore * 0.25 +
        scores.humidityScore * 0.2 +
        scores.windScore * 0.15 +
        scores.rainScore * 0.4
    );

    const outdoor = clamp(
        scores.temperatureScore * 0.3 +
        scores.humidityScore * 0.2 +
        scores.windScore * 0.15 +
        scores.rainScore * 0.25 +
        scores.cloudScore * 0.1
    );

    return {
        running: {
            score: running,
            label: getRecommendationLabel(running),
        },
        cycling: {
            score: cycling,
            label: getRecommendationLabel(cycling),
        },
        photography: {
            score: photography,
            label: getRecommendationLabel(photography),
        },
        travel: {
            score: travel,
            label: getRecommendationLabel(travel),
        },
        outdoor: {
            score: outdoor,
            label: getRecommendationLabel(outdoor),
        },
    };
};

module.exports = {
    getActivityRecommendations,
};