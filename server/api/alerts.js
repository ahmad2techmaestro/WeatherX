const express = require("express");

const Alert = require("../models/Alert");

const {
    authenticate,
} = require("../middleware/auth");

const {
    persistWeatherAlerts,
} = require("../services/alertService");

const router = express.Router();

/*
 * GET /api/alerts
 *
 * Returns the authenticated user's alerts.
 */
router.get("/", authenticate, async (req, res, next) => {
    try {
        const alerts = await Alert.find({
            user: req.user.id,
        })
            .sort({
                status: 1,
                lastDetectedAt: -1,
            })
            .lean();

        return res.status(200).json({
            success: true,
            data: alerts,
        });
    } catch (error) {
        next(error);
    }
});

/*
 * POST /api/alerts/evaluate
 *
 * Evaluates current weather and persists
 * any active alerts for the authenticated user.
 */
router.post(
    "/evaluate",
    authenticate,
    async (req, res, next) => {
        try {
            const {
                weatherData,
                location,
            } = req.body;

            if (!weatherData) {
                return res.status(400).json({
                    success: false,
                    message: "Weather data is required.",
                });
            }

            if (!location?.city) {
                return res.status(400).json({
                    success: false,
                    message: "Location city is required.",
                });
            }

            const alerts = await persistWeatherAlerts({
                userId: req.user.id,
                weatherData,
                location,
            });

            return res.status(200).json({
                success: true,
                message: "Weather alerts evaluated successfully.",
                data: alerts,
            });
        } catch (error) {
            next(error);
        }
    }
);

/*
 * PATCH /api/alerts/:id/read
 *
 * Marks one alert as read.
 */
router.patch(
    "/:id/read",
    authenticate,
    async (req, res, next) => {
        try {
            const alert = await Alert.findOneAndUpdate(
                {
                    _id: req.params.id,
                    user: req.user.id,
                },
                {
                    $set: {
                        isRead: true,
                    },
                },
                {
                    new: true,
                }
            );

            if (!alert) {
                return res.status(404).json({
                    success: false,
                    message: "Alert not found.",
                });
            }

            return res.status(200).json({
                success: true,
                message: "Alert marked as read.",
                data: alert,
            });
        } catch (error) {
            next(error);
        }
    }
);

/*
 * PATCH /api/alerts/read-all
 *
 * Marks all unread alerts as read.
 */
router.patch(
    "/read-all",
    authenticate,
    async (req, res, next) => {
        try {
            const result = await Alert.updateMany(
                {
                    user: req.user.id,
                    isRead: false,
                },
                {
                    $set: {
                        isRead: true,
                    },
                }
            );

            return res.status(200).json({
                success: true,
                message: "All alerts marked as read.",
                data: {
                    modifiedCount: result.modifiedCount,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;