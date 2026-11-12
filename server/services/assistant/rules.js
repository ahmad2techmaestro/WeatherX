/**
 * Rule-based answers (no AI key needed), built only from the same facts the model would see.
 * Covers the questions people ask most, in English and Hindi (Devanagari). Anything it can't place
 * falls back to the existing briefing text.
 */
const { answerRules, briefingRules } = require("../aiService");
const { rules: explainRules } = require("../prediction/explain");
const { localDate, localHour, hourLabel } = require("./context");

const ANALYSIS = ["heatwave", "unusual", "trend", "sudden"];
const intents = [
    ["heatwave", /heat ?wave|\bloo\b|लू|हीटवेव|how hot will it get/i],
    ["unusual", /unusual|abnormal|anomal|out of the ordinary|normal for this time|असामान्य|अजीब/i],
    ["trend", /\btrend\b|getting (hotter|colder|warmer|cooler)|warming|cooling|ट्रेंड|गर्म हो रहा|ठंडा हो रहा/i],
    ["sudden", /\bsudden(ly)?\b|storm coming|change soon|अचानक/i],
    ["yesterday", /\b(yesterday|kal se|pichhle? din)\b|कल से|कल के मुकाबले|बीते कल/i],
    ["why", /\bwhy\b.*\b(hot|high|warm|humid|cold|temperature)\b|\bkyun\b|\bkyu\b|क्यों/i],
    ["bike", /\b(bike|scooter|motorcycle|two.?wheeler)\b|बाइक|स्कूटर/i],
    ["rain", /\b(rain|umbrella|barish|baarish|chhata|chata|shower|drizzle)\b|बारिश|छाता|बरसात/i],
    ["run", /\b(run|running|jog|jogging|walk|workout|exercise|cycling)\b|दौड़|दौड़ना|टहल|कसरत|वर्कआउट/i],
    ["wear", /\b(wear|clothes|jacket|sweater|dress|pehn|pahn|kapde)\b|पहन|कपड़े|जैकेट/i],
    ["air", /\b(aqi|air quality|pollution|mask|smog)\b|प्रदूषण|हवा की गुणवत्ता|एक्यूआई/i],
];
const isTomorrow = (q) => /\b(tomorrow|kal)\b|कल/i.test(q) && !/yesterday|kal se|कल से/i.test(q);
const pick = (q) => (intents.find(([, re]) => re.test(q)) || [])[0];

const temp = (c, unit) => (Number.isFinite(c) ? (unit === "fahrenheit" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`) : "–");
const dTemp = (c, unit) => (unit === "fahrenheit" ? Math.round(Math.abs(c) * 1.8 * 10) / 10 : Math.round(Math.abs(c) * 10) / 10);
const L = (lang, en, hi) => (lang === "hi" ? hi : en);

const rain = (o, place, unit, q, lang) => {
    const off = o.location.utcOffsetSeconds;
    const tomorrow = isTomorrow(q);
    const date = tomorrow ? o.daily[1]?.date : null;
    const hours = tomorrow ? o.hourly.filter((h) => localDate(h.time, off) === date) : o.hourly.slice(0, 24);
    const mm = Math.round(hours.reduce((s, h) => s + (h.precipitation || 0), 0) * 10) / 10;
    const maxChance = Math.max(0, ...hours.map((h) => h.precipProbability || 0));
    const peak = hours.reduce((m, h) => ((h.precipitation || 0) > (m?.precipitation || 0) ? h : m), null);
    const when = L(lang, tomorrow ? "tomorrow" : "in the next 24 hours", tomorrow ? "कल" : "अगले 24 घंटों में");
    if (mm < 0.5 && maxChance < 40) return L(lang, `No meaningful rain is expected in ${place} ${when} (chance up to ${maxChance}%). You can leave the umbrella at home.`, `${place} में ${when} बारिश की संभावना कम है (अधिकतम ${maxChance}%)। छाता ज़रूरी नहीं है।`);
    return L(lang, `Yes, take an umbrella. About ${mm} mm of rain is expected in ${place} ${when}, with a chance up to ${maxChance}%${peak && peak.precipitation > 0 ? `, heaviest around ${hourLabel(peak.time, off)}` : ""}.`, `हाँ, छाता साथ रखें। ${place} में ${when} लगभग ${mm} मिमी बारिश और अधिकतम ${maxChance}% संभावना है${peak && peak.precipitation > 0 ? `, सबसे ज़्यादा ${hourLabel(peak.time, off)} के आसपास` : ""}।`);
};

const run = (o, place, unit, q, lang) => {
    const off = o.location.utcOffsetSeconds;
    const a = o.intelligence.activities.find((x) => x.key === "walking");
    const aqi = o.airQuality?.naqi;
    const aqiNote = aqi ? L(lang, ` Current AQI is ${aqi.value} (${aqi.label.toLowerCase()}); check it before exercising outdoors.`, ` अभी AQI ${aqi.value} है; बाहर कसरत से पहले इसे देख लें।`) : "";
    if (!a || a.bestScore < 50 || !a.bestTime) return L(lang, `Conditions in ${place} aren't great for outdoor exercise in the next 24 hours (heat, rain or air quality). An indoor session is the better choice.${aqiNote}`, `${place} में अगले 24 घंटों में बाहर कसरत के हालात ठीक नहीं हैं (गर्मी, बारिश या हवा की गुणवत्ता)। घर के अंदर करना बेहतर है।${aqiNote}`);
    return L(lang, `The best time to run in ${place} is around ${hourLabel(a.bestTime, off)} (score ${a.bestScore}/100).${aqiNote}`, `${place} में दौड़ने का सबसे अच्छा समय ${hourLabel(a.bestTime, off)} के आसपास है (स्कोर ${a.bestScore}/100)।${aqiNote}`);
};

const bike = (o, place, unit, q, lang) => {
    const next = o.hourly.slice(0, 8);
    const wet = next.filter((h) => (h.precipitation || 0) >= 1).length;
    const gust = Math.max(0, ...next.map((h) => h.windGust || 0));
    const lowVis = next.filter((h) => h.visibilityKm !== null && h.visibilityKm < 2).length;
    const issues = [];
    if (wet) issues.push(L(lang, `${wet} h of steady rain (slippery roads)`, `${wet} घंटे लगातार बारिश (सड़क फिसलन भरी)`));
    if (gust >= 40) issues.push(L(lang, `gusts up to ${gust} km/h`, `${gust} किमी/घंटा तक के झोंके`));
    if (lowVis) issues.push(L(lang, `low visibility for ${lowVis} h`, `${lowVis} घंटे कम दृश्यता`));
    if (!issues.length) return L(lang, `Riding looks fine in ${place} for the next 8 hours: no steady rain, strong gusts or fog are forecast. Wear a helmet as always.`, `${place} में अगले 8 घंटे बाइक चलाना ठीक लगता है: लगातार बारिश, तेज़ झोंके या कोहरा नहीं है। हमेशा की तरह हेलमेट पहनें।`);
    return L(lang, `Be careful on a bike in ${place}: ${issues.join(", ")}. Leave extra time, or delay if you can.`, `${place} में बाइक पर सावधान रहें: ${issues.join(", ")}। अतिरिक्त समय रखें, या हो सके तो देर से निकलें।`);
};

const wear = (o, place, unit, q, lang) => {
    const c = o.current;
    const gear = o.intelligence.gear || [];
    const base = L(lang, `It feels like ${temp(c.feelsLike, unit)} in ${place}.`, `${place} में अभी ${temp(c.feelsLike, unit)} महसूस हो रहा है।`);
    return lang === "hi" ? `${base} ${gear.length ? `सुझाव (अंग्रेज़ी में): ${gear.join("; ")}।` : "कुछ खास पहनने की ज़रूरत नहीं।"}` : `${base} ${gear.length ? gear.join("; ") + "." : "Nothing special needed."}`;
};

const air = (o, place, unit, q, lang) => {
    const a = o.airQuality?.naqi;
    if (!a) return L(lang, "Air quality data isn't available for this place right now.", "इस जगह की हवा की गुणवत्ता का डेटा अभी उपलब्ध नहीं है।");
    return L(lang, `Air quality in ${place} is ${a.label.toLowerCase()} (AQI ${a.value}, indicative). ${a.advice}`, `${place} में हवा की गुणवत्ता "${a.label}" है (AQI ${a.value}, अनुमानित)। ${a.value > 150 ? "लंबे समय बाहर रहने से बचें।" : a.value > 100 ? "संवेदनशील लोग बाहर कम समय बिताएँ।" : "सामान्य गतिविधियाँ ठीक हैं।"}`);
};

const why = (o, place, unit, q, lang) => {
    const c = o.current;
    const off = o.location.utcOffsetSeconds;
    const high = o.daily[0].temperatureMax;
    const hot = c.temperature >= 33 || c.feelsLike >= 36;
    const parts = [];
    parts.push(L(lang, `It is ${temp(c.temperature, unit)} in ${place} (feels like ${temp(c.feelsLike, unit)}); today's high is ${temp(high, unit)}.`, `${place} में तापमान ${temp(c.temperature, unit)} है (महसूस ${temp(c.feelsLike, unit)}); आज का अधिकतम ${temp(high, unit)} है।`));
    if (localHour(c.time, off) >= 11 && localHour(c.time, off) <= 16) parts.push(L(lang, "It is the hottest part of the day, when the sun is strongest.", "यह दिन का सबसे गर्म समय है, जब धूप सबसे तेज़ होती है।"));
    if (c.humidity >= 60 && c.feelsLike - c.temperature >= 2) parts.push(L(lang, `Humidity of ${c.humidity}% makes it feel warmer than the thermometer says.`, `${c.humidity}% नमी के कारण यह थर्मामीटर से ज़्यादा गर्म महसूस होता है।`));
    if (c.uvIndex >= 6) parts.push(L(lang, `UV is high (${c.uvIndex}).`, `यूवी ज़्यादा है (${c.uvIndex})।`));
    if (c.cloudCover <= 25 && c.isDay) parts.push(L(lang, "Skies are mostly clear, so little sunlight is blocked.", "आसमान लगभग साफ़ है, इसलिए धूप कम रुकती है।"));
    if (!hot && parts.length === 1) parts.push(L(lang, "The temperature isn't unusually high right now.", "तापमान अभी असामान्य रूप से ज़्यादा नहीं है।"));
    return parts.join(" ");
};

const yesterday = (o, place, unit, q, lang, y) => {
    const d = y?.difference;
    if (!d || d.highToday_minus_yesterday === null) return L(lang, "I couldn't get yesterday's data for this place right now.", "इस जगह का कल का डेटा अभी नहीं मिल सका।");
    const hi = d.highToday_minus_yesterday;
    const word = (v, up, down, same) => (Math.abs(v) < 0.5 ? same : v > 0 ? up : down);
    const en = `Today's high is ${temp(o.daily[0].temperatureMax, unit)} versus ${temp(y.yesterday.high, unit)} yesterday, about ${dTemp(hi, unit)}° ${word(hi, "warmer", "cooler", "(about the same)")}. ` + (y.yesterday.rainMm >= 0.5 || o.daily[0].precipitationSum >= 0.5 ? `Rain: ${o.daily[0].precipitationSum} mm today versus ${y.yesterday.rainMm} mm yesterday.` : "No notable rain on either day.");
    const hin = `आज का अधिकतम तापमान ${temp(o.daily[0].temperatureMax, unit)} है, कल ${temp(y.yesterday.high, unit)} था: लगभग ${dTemp(hi, unit)}° ${word(hi, "ज़्यादा गर्म", "ठंडा", "(लगभग बराबर)")}। ` + (y.yesterday.rainMm >= 0.5 || o.daily[0].precipitationSum >= 0.5 ? `बारिश: आज ${o.daily[0].precipitationSum} मिमी, कल ${y.yesterday.rainMm} मिमी।` : "दोनों दिन उल्लेखनीय बारिश नहीं।");
    return L(lang, en, hin);
};

/** Answer from the statistical analysis (already in the user's unit); same words the Intelligence card uses. */
const answerFromAnalysis = (a, { place, unit, language }) => ({ text: explainRules(a.findings, { place, unit, lang: language, utcOffsetSeconds: a.utcOffsetSeconds }).text, intent: "analysis" });

const answer = (overview, { place, unit, question, language, yesterday: y }) => {
    const handlers = { rain, run, bike, wear, air, why, yesterday };
    const key = pick(question);
    if (key && handlers[key]) return { text: handlers[key](overview, place, unit, question, language, y), intent: key };
    const b = briefingRules(overview, place, unit);
    const eng = answerRules(overview, place, unit, question);
    if (language === "hi") return { text: `${b.text} (विस्तृत हिंदी उत्तर के लिए Gemini कुंजी चालू करें; अभी सरल उत्तर अंग्रेज़ी में है।)`, intent: "briefing" };
    return { text: eng, intent: "generic" };
};

module.exports = { answer, answerFromAnalysis, pick, ANALYSIS };
