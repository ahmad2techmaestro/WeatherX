const parseCoordinates = (lat, lon) => {
    const latitude = Number(lat);
    const longitude = Number(lon);

    if (
        lat === undefined ||
        lon === undefined ||
        lat === "" ||
        lon === "" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return { latitude, longitude };
};

/** Short, printable text from user input. */
const cleanText = (value, max = 100) =>
    typeof value === "string" ? value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "";

module.exports = { parseCoordinates, cleanText };
