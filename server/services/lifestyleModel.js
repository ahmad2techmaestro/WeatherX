/**
 * Everyday guidance derived from the forecast: sun care, skin care, car washing, workouts,
 * driving conditions, trip suitability and mosquito activity. Pure functions, no network.
 *
 * These are rules of thumb built from model data, not measurements. Pollen and live traffic need
 * dedicated data sources that are not available for India, so they are deliberately not guessed.
 */
const isNum = (v) => Number.isFinite(v);
const HOUR = 3600;
const sum = (list, key) => list.reduce((a, h) => a + (isNum(h[key]) ? h[key] : 0), 0);

const UV_BANDS = [
    [2, "Low UV index", "good", "No protection needed for most people."],
    [5, "Moderate UV index", "ok", "Sunglasses and sunscreen if you're out for long."],
    [7, "High UV index", "warn", "Use SPF 30+, a hat and seek shade around midday."],
    [10, "Very high UV index", "bad", "Use SPF 50+, cover up and avoid the midday sun."],
    [Infinity, "Extreme UV index", "bad", "Avoid direct sun from late morning to mid-afternoon."],
];

const uvTip = (daily) => {
    const uv = daily[0]?.uvIndexMax;

    if (!isNum(uv)) return null;

    const [, label, tone, detail] = UV_BANDS.find(([max]) => uv <= max);

    return { key: "uv", title: "Sun protection", label, tone, detail: `Peaks at ${Math.round(uv)} today. ${detail}` };
};

const skinTip = (current) => {
    const { temperature: t, humidity: rh } = current;

    if (!isNum(t) || !isNum(rh)) return null;

    if (t >= 28 && rh >= 55) return { key: "skin", title: "Skin care", label: "Use oil-control products", tone: "ok", detail: "Warm and humid, so skin gets oily. Choose light, non-greasy products." };
    if (rh < 35) return { key: "skin", title: "Skin care", label: "Moisturise well", tone: "ok", detail: "The air is dry. Drink water and use a good moisturiser." };
    if (t < 15) return { key: "skin", title: "Skin care", label: "Use a richer moisturiser", tone: "ok", detail: "Cool air dries skin and lips. Apply moisturiser after washing." };

    return { key: "skin", title: "Skin care", label: "Normal routine is fine", tone: "good", detail: "Temperature and humidity are in a comfortable range for skin." };
};

const carWashTip = (hourly, airQuality, current) => {
    const next = hourly.slice(0, 48);
    const wetHour = next.find((h) => (h.precipitation ?? 0) >= 0.3 || (h.precipProbability ?? 0) >= 50);
    const dust = airQuality?.pollutants?.dust;

    if (wetHour) return { key: "carwash", title: "Car wash", label: "Better to wait", tone: "warn", detail: `Rain is likely within ${Math.max(1, Math.round((wetHour.time - current.time) / HOUR))} hours, which would undo a wash.` };
    if (isNum(dust) && dust >= 100) return { key: "carwash", title: "Car wash", label: "Dusty air today", tone: "ok", detail: "It will stay dry, but heavy dust will settle on the car again soon." };

    return { key: "carwash", title: "Car wash", label: "Suitable for car washing", tone: "good", detail: "No rain expected for the next 48 hours." };
};

const workoutTip = (current, hourly, airQuality) => {
    const aqi = airQuality?.naqi?.value;
    const feels = current.feelsLike ?? current.temperature;
    const wet = (hourly[0]?.precipitation ?? 0) >= 0.3 || (hourly[0]?.precipProbability ?? 0) >= 60;

    if (isNum(aqi) && aqi > 200) return { key: "workout", title: "Workout", label: "Suitable for indoor workouts", tone: "warn", detail: "Air quality is poor, so training indoors is the better choice." };
    if (isNum(feels) && feels >= 35) return { key: "workout", title: "Workout", label: "Suitable for indoor workouts", tone: "warn", detail: "It feels very hot outside. If you train outdoors, go at dawn or after sunset." };
    if (wet) return { key: "workout", title: "Workout", label: "Suitable for indoor workouts", tone: "ok", detail: "Rain is likely right now." };
    if (isNum(feels) && feels <= 5) return { key: "workout", title: "Workout", label: "Suitable for indoor workouts", tone: "ok", detail: "It is very cold outside." };

    return { key: "workout", title: "Workout", label: "Good for outdoor workouts", tone: "good", detail: "Temperature, air and rain are all favourable." };
};

const drivingTip = (current, hourly) => {
    const next = hourly.slice(0, 6);
    const vis = Math.min(isNum(current.visibilityKm) ? current.visibilityKm : 10, ...next.map((h) => (isNum(h.visibilityKm) ? h.visibilityKm : 10)));
    const rain = sum(next, "precipitation");
    const gust = Math.max(current.windGust ?? 0, ...next.map((h) => h.windGust ?? 0));

    if (vis < 1) return { key: "driving", title: "Driving", label: "Dense fog or haze", tone: "bad", detail: "Visibility is under 1 km. Use fog lights and keep your speed down." };
    if (rain >= 5) return { key: "driving", title: "Driving", label: "Heavy rain ahead", tone: "warn", detail: "Roads may be slippery or waterlogged in the next few hours." };
    if (gust >= 55) return { key: "driving", title: "Driving", label: "Strong gusts", tone: "warn", detail: "Take care on open roads and with high-sided vehicles." };
    if (vis < 4 || rain >= 1) return { key: "driving", title: "Driving", label: "Take extra care", tone: "ok", detail: vis < 4 ? "Reduced visibility on the road." : "Some rain on the way, so roads may be wet." };

    return { key: "driving", title: "Driving", label: "Clear driving conditions", tone: "good", detail: "Good visibility and no significant rain in the next six hours." };
};

const tripTip = (bestDays) => {
    const scores = bestDays.slice(0, 3).map((d) => d.score).filter(isNum);

    if (!scores.length) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avg >= 70) return { key: "trip", title: "Day trips", label: "Good for a trip", tone: "good", detail: `Outdoor conditions look good for the next ${scores.length} days (average ${Math.round(avg)}/100).` };
    if (avg >= 50) return { key: "trip", title: "Day trips", label: "Fair for a trip", tone: "ok", detail: `Mixed conditions over the next ${scores.length} days (average ${Math.round(avg)}/100). Pick the better day.` };

    return { key: "trip", title: "Day trips", label: "Not suitable for a trip", tone: "warn", detail: `Weather is unfavourable for the next ${scores.length} days (average ${Math.round(avg)}/100).` };
};

const mosquitoTip = (current, hourly) => {
    const { temperature: t, humidity: rh } = current;

    if (!isNum(t) || !isNum(rh)) return null;

    const rain = sum(hourly.slice(0, 48), "precipitation");

    if (t >= 22 && t <= 33 && rh >= 65 && (rain >= 2 || rh >= 80)) return { key: "mosquito", title: "Mosquitoes", label: "Many mosquitoes likely", tone: "bad", detail: "Warm, humid and wet conditions suit breeding. Use repellent and clear standing water." };
    if (t >= 18 && t <= 35 && rh >= 50) return { key: "mosquito", title: "Mosquitoes", label: "Some mosquitoes", tone: "ok", detail: "Conditions allow some activity, especially around dusk." };

    return { key: "mosquito", title: "Mosquitoes", label: "Few mosquitoes", tone: "good", detail: "It is too cool or too dry for much mosquito activity." };
};

const buildLifestyle = ({ current, hourly, daily, airQuality }, bestDays = []) =>
    [uvTip(daily), skinTip(current), carWashTip(hourly, airQuality, current), workoutTip(current, hourly, airQuality), drivingTip(current, hourly), tripTip(bestDays), mosquitoTip(current, hourly)].filter(Boolean);

module.exports = { buildLifestyle, uvTip, skinTip, carWashTip, workoutTip, drivingTip, tripTip, mosquitoTip };
