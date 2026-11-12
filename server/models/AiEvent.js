const mongoose = require("mongoose");

/** One AI request (numbers and labels only, never question or answer text). Expires after 30 days. */
const schema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now, index: { expireAfterSeconds: 30 * 86400 } },
        user: { type: String, required: true, index: true },
        feature: String, method: String, status: Number, ms: Number, ok: Boolean, engine: String,
        geminiCalls: Number, geminiErrors: Number, promptTokens: Number, outputTokens: Number, flags: [String],
    },
    { versionKey: false }
);
schema.index({ user: 1, at: -1 });

module.exports = mongoose.models.AiEvent || mongoose.model("AiEvent", schema);
