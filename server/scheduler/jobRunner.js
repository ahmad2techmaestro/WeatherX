const cron = require("node-cron");

const scheduledJobs = new Map();

let jobsStarted = false;

/**
 * Register a background job.
 *
 * Jobs are registered first and started later by
 * the scheduler initialization layer.
 *
 * @param {Object} options
 * @param {string} options.name
 * @param {string} options.schedule
 * @param {Function} options.task
 * @param {Object} [options.options]
 */
const registerJob = ({
    name,
    schedule,
    task,
    options = {},
}) => {
    if (!name) {
        throw new Error(
            "Background job name is required."
        );
    }

    if (!schedule) {
        throw new Error(
            `Cron schedule is required for job: ${name}`
        );
    }

    if (typeof task !== "function") {
        throw new Error(
            `Task function is required for job: ${name}`
        );
    }

    if (!cron.validate(schedule)) {
        throw new Error(
            `Invalid cron schedule for job "${name}": ${schedule}`
        );
    }

    if (scheduledJobs.has(name)) {
        throw new Error(
            `Background job "${name}" is already registered.`
        );
    }

    const job = cron.schedule(
        schedule,
        async () => {
            const startedAt = Date.now();

            try {
                console.log(
                    `[Job:${name}] Started`
                );

                await task();

                const duration =
                    Date.now() - startedAt;

                console.log(
                    `[Job:${name}] Completed in ${duration}ms`
                );
            } catch (error) {
                console.error(
                    `[Job:${name}] Failed:`,
                    error.message
                );
            }
        },
        {
            ...options,
        }
    );

    if (!jobsStarted) {
        job.stop();
    }

    scheduledJobs.set(name, job);

    console.log(
        `[Job:${name}] Registered with schedule "${schedule}"`
    );

    return job;
};

/**
 * Start all registered background jobs.
 */
const startJobs = () => {
    if (jobsStarted) {
        console.log(
            "[JobRunner] Jobs are already running."
        );

        return;
    }

    for (const [name, job] of scheduledJobs) {
        job.start();

        console.log(
            `[Job:${name}] Started`
        );
    }

    jobsStarted = true;

    console.log(
        `[JobRunner] ${scheduledJobs.size} job(s) started.`
    );
};

/**
 * Stop all registered background jobs.
 */
const stopJobs = () => {
    if (!jobsStarted) {
        return;
    }

    for (const [name, job] of scheduledJobs) {
        job.stop();

        console.log(
            `[Job:${name}] Stopped`
        );
    }

    jobsStarted = false;

    console.log(
        `[JobRunner] ${scheduledJobs.size} job(s) stopped.`
    );
};

/**
 * Remove and destroy a registered job.
 *
 * @param {string} name
 * @returns {boolean}
 */
const removeJob = (name) => {
    const job = scheduledJobs.get(name);

    if (!job) {
        return false;
    }

    job.stop();

    if (typeof job.destroy === "function") {
        job.destroy();
    }

    scheduledJobs.delete(name);

    console.log(
        `[Job:${name}] Removed`
    );

    return true;
};

/**
 * Get currently registered jobs.
 *
 * @returns {string[]}
 */
const getRegisteredJobs = () => {
    return Array.from(
        scheduledJobs.keys()
    );
};

/**
 * Check whether the job runner is currently active.
 *
 * @returns {boolean}
 */
const areJobsRunning = () => {
    return jobsStarted;
};

module.exports = {
    registerJob,
    startJobs,
    stopJobs,
    removeJob,
    getRegisteredJobs,
    areJobsRunning,
};