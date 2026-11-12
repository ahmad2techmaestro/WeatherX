const mongoose = require("mongoose");

const KINDS = ["heatwave", "rain", "air", "temperature_above", "sudden_change", "anomaly", "briefing"];

/** A user-defined automation: "when X happens at this place, notify me" (or a daily agent briefing). */
const workflowSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        name: { type: String, required: true, maxlength: 60 },
        kind: { type: String, enum: KINDS, required: true },
        enabled: { type: Boolean, default: true, index: true },
        place: { name: { type: String, required: true, maxlength: 80 }, latitude: { type: Number, required: true }, longitude: { type: Number, required: true } },
        unit: { type: String, enum: ["celsius", "fahrenheit"], default: "celsius" },
        threshold: { type: Number, default: null },
        hourLocal: { type: Number, min: 0, max: 23, default: 7 },
        goal: { type: String, maxlength: 300, default: "" },
        lastRunAt: { type: Date, default: null },
        lastTriggeredAt: { type: Date, default: null },
        lastTriggeredDate: { type: String, default: "" }, // place-local YYYY-MM-DD, at most one notification per day
        lastResult: { status: { type: String, default: "" }, message: { type: String, default: "" } },
        runCount: { type: Number, default: 0 },
        triggerCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.models.Workflow || mongoose.model("Workflow", workflowSchema);
module.exports.KINDS = KINDS;
