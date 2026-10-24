const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 50,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 100,
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
            select: false,
        },

        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user",
        },

        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        refreshTokenHash: {
            type: String,
            default: null,
            select: false,
        },

        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);