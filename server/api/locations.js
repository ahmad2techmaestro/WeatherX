const express = require("express");

const SavedLocation = require("../models/SavedLocation");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// ─────────────────────────────────────────────
// Get Saved Locations
// ─────────────────────────────────────────────

router.get("/", authenticate, async (req, res, next) => {
    try {
        const locations = await SavedLocation.find({
            user: req.user.id,
        }).sort({
            createdAt: -1,
        });

        res.status(200).json({
            success: true,
            count: locations.length,
            data: locations,
        });
    } catch (error) {
        next(error);
    }
});

// ─────────────────────────────────────────────
// Save Location
// ─────────────────────────────────────────────

router.post("/", authenticate, async (req, res, next) => {
    try {
        const {
            name,
            state,
            country,
            latitude,
            longitude,
            label,
            customLabel,
        } = req.body;

        if (
            !name ||
            !country ||
            latitude === undefined ||
            longitude === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Name, country, latitude and longitude are required.",
            });
        }

        const lat = Number(latitude);
        const lon = Number(longitude);

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lon) ||
            lat < -90 ||
            lat > 90 ||
            lon < -180 ||
            lon > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude or longitude.",
            });
        }

        const existingLocation =
            await SavedLocation.findOne({
                user: req.user.id,
                latitude: lat,
                longitude: lon,
            });

        if (existingLocation) {
            return res.status(409).json({
                success: false,
                message: "This location is already saved.",
                data: existingLocation,
            });
        }

        const savedLocation = await SavedLocation.create({
            user: req.user.id,
            name: name.trim(),
            state: state?.trim() || "",
            country: country.trim(),
            latitude: lat,
            longitude: lon,
            label: label || "Favorite",
            customLabel: customLabel?.trim() || "",
        });

        res.status(201).json({
            success: true,
            message: "Location saved successfully.",
            data: savedLocation,
        });
    } catch (error) {
        // Handle MongoDB duplicate-key race condition.
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This location is already saved.",
            });
        }

        next(error);
    }
});

// ─────────────────────────────────────────────
// Delete Saved Location
// ─────────────────────────────────────────────

router.delete(
    "/:id",
    authenticate,
    async (req, res, next) => {
        try {
            const location =
                await SavedLocation.findOneAndDelete({
                    _id: req.params.id,
                    user: req.user.id,
                });

            if (!location) {
                return res.status(404).json({
                    success: false,
                    message: "Saved location not found.",
                });
            }

            res.status(200).json({
                success: true,
                message: "Location removed successfully.",
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;