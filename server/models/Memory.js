const mongoose = require("mongoose");

/** One short thing the user told WeatherX about themselves ("I have asthma"), used to personalise answers. */
const memorySchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        text: { type: String, required: true, maxlength: 200 },
        key: { type: String, required: true }, // normalised text, for de-duplication
        kind: { type: String, enum: ["health", "routine", "preference", "note"], default: "note" },
        source: { type: String, enum: ["chat", "manual"], default: "manual" },
        embedding: { type: [Number], default: undefined, select: false },
        provider: { type: String, default: null, select: false },
    },
    { timestamps: true }
);

memorySchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.Memory || mongoose.model("Memory", memorySchema);
