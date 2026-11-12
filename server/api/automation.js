const express = require("express");
const rateLimit = require("express-rate-limit");

const { getStore, MAX_PER_USER } = require("../services/automation/store");
const { runWorkflow } = require("../services/automation/engine");
const { realDeps } = require("../services/automation/deps");
const { TEMPLATES, TEMPLATE } = require("../services/automation/triggers");
const { parseCoordinates, cleanText } = require("../lib/validate");

const router = express.Router();
const limiter = (limit) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please wait a minute." } });
const bad = (message) => Object.assign(new Error(message), { status: 400 });

const view = (w) => ({ id: w.id, name: w.name, kind: w.kind, enabled: w.enabled, place: w.place, unit: w.unit, threshold: w.threshold, hourLocal: w.hourLocal, goal: w.goal, lastRunAt: w.lastRunAt, lastTriggeredAt: w.lastTriggeredAt, lastResult: w.lastResult, runCount: w.runCount, triggerCount: w.triggerCount });

const thresholdOf = (kind, raw) => {
    const t = TEMPLATE[kind];
    if (raw === undefined || raw === null || raw === "") return t.default;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < t.min || n > t.max) throw bad(`${t.title}: choose a value between ${t.min} and ${t.max}.`);
    return n;
};

router.get("/templates", (req, res) => res.json({ success: true, data: { templates: TEMPLATES, max: MAX_PER_USER } }));

router.get("/workflows", async (req, res, next) => {
    try { res.json({ success: true, data: (await getStore().list(req.user.id)).map(view) }); } catch (e) { next(e); }
});

// POST /api/automation/workflows { kind, name?, place:{name,latitude,longitude}, unit, threshold?, hourLocal?, goal? }
router.post("/workflows", limiter(20), async (req, res, next) => {
    try {
        const b = req.body || {};
        const kind = b.kind;
        if (!TEMPLATE[kind]) throw bad("Choose a valid automation type.");
        const point = parseCoordinates(b.place?.latitude, b.place?.longitude);
        const placeName = cleanText(b.place?.name, 80);
        if (!point || !placeName) throw bad("A place with valid coordinates is required.");
        if ((await getStore().list(req.user.id)).length >= MAX_PER_USER) return res.status(409).json({ success: false, message: `You can have up to ${MAX_PER_USER} automations. Delete one to add another.` });

        const doc = {
            user: req.user.id,
            name: cleanText(b.name, 60) || `${TEMPLATE[kind].title} · ${placeName}`,
            kind,
            enabled: true,
            place: { name: placeName, latitude: point.latitude, longitude: point.longitude },
            unit: b.unit === "fahrenheit" ? "fahrenheit" : "celsius",
            threshold: kind === "briefing" ? null : thresholdOf(kind, b.threshold),
            hourLocal: kind === "briefing" ? thresholdOf(kind, b.hourLocal ?? b.threshold) : 7,
            goal: kind === "briefing" ? cleanText(b.goal, 300) : "",
        };
        res.status(201).json({ success: true, data: view(await getStore().create(doc)) });
    } catch (e) { next(e); }
});

// PATCH /api/automation/workflows/:id { enabled?, name?, threshold?, hourLocal?, goal? }
router.patch("/workflows/:id", limiter(60), async (req, res, next) => {
    try {
        const wf = await getStore().get(req.user.id, req.params.id);
        if (!wf) return res.status(404).json({ success: false, message: "Automation not found." });
        const b = req.body || {}, patch = {};
        if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
        if (b.name !== undefined) patch.name = cleanText(b.name, 60) || wf.name;
        if (b.threshold !== undefined && wf.kind !== "briefing") patch.threshold = thresholdOf(wf.kind, b.threshold);
        if (b.hourLocal !== undefined && wf.kind === "briefing") patch.hourLocal = thresholdOf("briefing", b.hourLocal);
        if (b.goal !== undefined && wf.kind === "briefing") patch.goal = cleanText(b.goal, 300);
        res.json({ success: true, data: view(await getStore().update(req.user.id, wf.id, patch)) });
    } catch (e) { next(e); }
});

router.delete("/workflows/:id", async (req, res, next) => {
    try {
        if (!(await getStore().remove(req.user.id, req.params.id))) return res.status(404).json({ success: false, message: "Automation not found." });
        res.json({ success: true });
    } catch (e) { next(e); }
});

// POST /api/automation/workflows/:id/test  — dry run: evaluates against live data, sends nothing, saves nothing.
router.post("/workflows/:id/test", limiter(10), async (req, res, next) => {
    try {
        const wf = await getStore().get(req.user.id, req.params.id);
        if (!wf) return res.status(404).json({ success: false, message: "Automation not found." });
        const out = await runWorkflow(wf, realDeps(), { dryRun: true });
        res.json({ success: true, data: { status: out.status, wouldNotify: out.status === "triggered", title: out.notification?.title || null, message: out.message } });
    } catch (e) { next(e); }
});

module.exports = router;
