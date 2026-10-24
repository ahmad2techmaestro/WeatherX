/**
 * Loads environment files and normalises the OpenWeather key.
 *
 * Lookup order (first value wins, real environment variables beat files):
 *   server/.env  ->  <project root>/.env
 * The key can be named OPENWEATHER_API_KEY (preferred) or one of the aliases below, so
 * a differently named variable in an older .env still works. Quotes and stray spaces,
 * the usual reason a pasted key "doesn't work", are stripped.
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const serverDir = path.join(__dirname, "..");
const rootDir = path.join(serverDir, "..");

const files = [path.join(serverDir, ".env"), path.join(rootDir, ".env")];
const loadedFiles = [];

for (const file of files) {
    if (fs.existsSync(file)) {
        dotenv.config({ path: file }); // dotenv never overrides variables that are already set
        loadedFiles.push(path.relative(rootDir, file) || ".env");
    }
}

const KEY_ALIASES = [
    "OPENWEATHER_API_KEY",
    "OPENWEATHER_KEY",
    "OPENWEATHERMAP_API_KEY",
    "OPEN_WEATHER_API_KEY",
    "OWM_API_KEY",
    "WEATHER_API_KEY",
    "WEATHER_KEY",
];

const clean = (value) => String(value || "").trim().replace(/^["']|["']$/g, "").trim();

const resolveOpenWeatherKey = () => {
    for (const name of KEY_ALIASES) {
        const value = clean(process.env[name]);
        if (value) return { name, value };
    }
    return null;
};

const found = resolveOpenWeatherKey();

if (found) process.env.OPENWEATHER_API_KEY = found.value;

/** Names only, never values: used by the diagnostics endpoint and the startup log. */
const describeKeySource = () => {
    const found = resolveOpenWeatherKey();
    return {
    envVar: found ? found.name : null,
    keyLength: found ? found.value.length : 0,
    looksValid: found ? /^[a-f0-9]{32}$/i.test(found.value) : false,
    envFiles: loadedFiles,
    clientEnvHasKey: (() => {
        try {
            const clientEnv = path.join(rootDir, "client", ".env");
            return fs.existsSync(clientEnv) && /OPENWEATHER|OWM|WEATHER_KEY/i.test(fs.readFileSync(clientEnv, "utf8"));
        } catch {
            return false;
        }
    })(),
    };
};

module.exports = { describeKeySource, KEY_ALIASES };
