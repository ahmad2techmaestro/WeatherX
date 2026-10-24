const mongoose = require("mongoose");

const savedLocationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        state: {
            type: String,
            default: "",
            trim: true,
        },

        country: {
            type: String,
            required: true,
            trim: true,
        },

        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
        },

        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
        },

        label: {
            type: String,
            enum: ["Home", "Work", "Favorite", "Custom"],
            default: "Favorite",
        },

        customLabel: {
            type: String,
            trim: true,
            default: "",
        },

        isFavorite: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Same user cannot save the exact same coordinates twice.
savedLocationSchema.index(
    {
        user: 1,
        latitude: 1,
        longitude: 1,
    },
    {
        unique: true,
    }
);

module.exports = mongoose.model(
    "SavedLocation",
    savedLocationSchema
);