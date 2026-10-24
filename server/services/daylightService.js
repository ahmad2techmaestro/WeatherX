const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};

const calculateDaylightDuration = (sunrise, sunset) => {
    const durationSeconds = sunset - sunrise;

    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);

    return {
        hours,
        minutes,
        formatted: `${hours}h ${minutes}m`,
    };
};

const calculateDaylight = ({ sunrise, sunset }) => {
    const daylight = calculateDaylightDuration(
        sunrise,
        sunset
    );

    return {
        sunrise: {
            timestamp: sunrise,
            time: formatTime(sunrise),
        },

        sunset: {
            timestamp: sunset,
            time: formatTime(sunset),
        },

        daylightDuration: daylight,
    };
};

module.exports = {
    calculateDaylight,
};