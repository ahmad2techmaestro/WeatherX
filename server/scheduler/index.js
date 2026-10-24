const {
    registerJob,
    startJobs,
    stopJobs,
    getRegisteredJobs,
    areJobsRunning,
} = require("./jobRunner");

const {
    evaluateWeatherForSavedLocations,
} = require("../jobs/weatherEvaluationJob");

const {
    processPendingNotifications,
} = require("../jobs/notificationProcessingJob");

const {
    watchWeatherChanges,
    sendDailyDigests,
} = require("../jobs/weatherWatchJob");

const WEATHER_WATCH_SCHEDULE =
    process.env.WEATHER_WATCH_CRON || "*/20 * * * *";

const DAILY_DIGEST_SCHEDULE =
    process.env.DAILY_DIGEST_CRON || "10 * * * *";

const WEATHER_EVALUATION_SCHEDULE =
    process.env.WEATHER_EVALUATION_CRON ||
    "*/15 * * * *";

const NOTIFICATION_PROCESSING_SCHEDULE =
    process.env.NOTIFICATION_PROCESSING_CRON ||
    "* * * * *";

/**
 * Register all WeatherX background jobs.
 *
 * Each job is registered independently so that
 * adding a new job never prevents existing jobs
 * from being registered.
 */
const registerScheduledJobs = () => {
    const registeredJobs =
        getRegisteredJobs();

    // Superseded by "weather-watch" (Open-Meteo, de-duplicated). Opt-in only, so users
    // never get the same hazard twice.
    if (
        process.env.LEGACY_ALERT_EVALUATION === "true" &&
        !registeredJobs.includes(
            "weather-evaluation"
        )
    ) {
        registerJob({
            name: "weather-evaluation",

            schedule:
                WEATHER_EVALUATION_SCHEDULE,

            task:
                evaluateWeatherForSavedLocations,
        });
    }

    if (!registeredJobs.includes("weather-watch")) {
        registerJob({
            name: "weather-watch",
            schedule: WEATHER_WATCH_SCHEDULE,
            task: watchWeatherChanges,
        });
    }

    if (!registeredJobs.includes("daily-digest")) {
        registerJob({
            name: "daily-digest",
            schedule: DAILY_DIGEST_SCHEDULE,
            task: sendDailyDigests,
        });
    }

    if (
        !registeredJobs.includes(
            "notification-processing"
        )
    ) {
        registerJob({
            name: "notification-processing",

            schedule:
                NOTIFICATION_PROCESSING_SCHEDULE,

            task:
                processPendingNotifications,
        });
    }
};

/**
 * Initialize WeatherX background job system.
 */
const initializeScheduler = () => {
    if (areJobsRunning()) {
        console.log(
            "[Scheduler] Background job system is already running."
        );

        return;
    }

    registerScheduledJobs();

    const registeredJobs =
        getRegisteredJobs();

    console.log(
        `[Scheduler] Initializing with ${registeredJobs.length} registered job(s)`
    );

    startJobs();

    console.log(
        "[Scheduler] Background job system started"
    );
};

/**
 * Gracefully stop the scheduler.
 */
const shutdownScheduler = () => {
    if (!areJobsRunning()) {
        console.log(
            "[Scheduler] Background job system is already stopped."
        );

        return;
    }

    console.log(
        "[Scheduler] Stopping background job system"
    );

    stopJobs();

    console.log(
        "[Scheduler] Background job system stopped"
    );
};

module.exports = {
    initializeScheduler,
    shutdownScheduler,
};