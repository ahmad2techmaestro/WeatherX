const { getStore } = require("../services/automation/store");
const { runWorkflow } = require("../services/automation/engine");
const { realDeps } = require("../services/automation/deps");

/** Applies one outcome: stores the result and queues the notification. Used by the job and by "run now". */
const applyOutcome = async (wf, outcome, { notify }) => {
    const patch = { lastRunAt: new Date(), runCount: (wf.runCount || 0) + 1, lastResult: { status: outcome.status, message: String(outcome.message).slice(0, 600) } };
    let delivered = 0;
    if (outcome.status === "triggered") {
        delivered = (await notify(outcome.notification)).length;
        patch.lastTriggeredAt = new Date();
        patch.lastTriggeredDate = outcome.date;
        patch.triggerCount = (wf.triggerCount || 0) + 1;
        if (!delivered) patch.lastResult.message = `${patch.lastResult.message}\n(No notification channel is enabled in your settings, so nothing was sent.)`.slice(0, 700);
    }
    await getStore().update(wf.user, wf.id, patch);
    return { ...outcome, delivered };
};

/** Background job: evaluates every enabled workflow, one at a time, one failure never stops the rest. */
const runDueWorkflows = async ({ deps = realDeps(), notify = require("../services/notificationService").notifyUser, nowSec } = {}) => {
    const stats = { checked: 0, triggered: 0, quiet: 0, skipped: 0, failed: 0, delivered: 0 };
    for (const wf of await getStore().listEnabled(200)) {
        stats.checked += 1;
        try {
            const out = await applyOutcome(wf, await runWorkflow(wf, deps, { nowSec }), { notify });
            if (out.status === "error") stats.failed += 1;
            else stats[out.status] += 1;
            stats.delivered += out.delivered;
        } catch (e) {
            stats.failed += 1;
            console.error(`[Workflows] ${wf.id}: ${e.message}`);
        }
    }
    console.log(`[Workflows] checked=${stats.checked} triggered=${stats.triggered} quiet=${stats.quiet} skipped=${stats.skipped} failed=${stats.failed} delivered=${stats.delivered}`);
    return stats;
};

module.exports = { runDueWorkflows, applyOutcome };
