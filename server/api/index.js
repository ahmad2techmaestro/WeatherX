const express = require("express");

const { authenticate } = require("../middleware/auth");

const weatherRouter = require("./weather");
const forecastRouter = require("./forecast");
const geoRouter = require("./geo");
const locationsRouter = require("./locations");
const authRouter = require("./auth");
const alertsRouter = require("./alerts");
const preferencesRouter = require("./preferences");
const personalizationRouter = require("./personalization");
const analyticsRouter = require("./analytics");
const notificationsRouter = require("./notifications");
const pushRouter = require("./push");
const owmMapRouter = require("./owmMap");
const aiRouter = require("./ai");

const router = express.Router();

// New data-driven endpoints first; the legacy /weather routes stay available underneath.
// Everything that serves weather data requires a signed-in user. The tile proxy is the one exception to the
// header check: <img> requests cannot send a Bearer token, so it verifies a short-lived tile token itself.
router.use("/weather/map", owmMapRouter);
router.use("/weather", authenticate, forecastRouter);

router.use("/geo", authenticate, geoRouter);

router.use("/weather", authenticate, weatherRouter);

router.use("/locations", locationsRouter);

router.use("/auth", authRouter);

router.use("/alerts", alertsRouter);

router.use("/preferences", preferencesRouter);

router.use(
    "/personalization",
    personalizationRouter
);

router.use(
    "/analytics",
    analyticsRouter
);

router.use("/notifications", notificationsRouter);
router.use("/push", pushRouter);
router.use("/ai", authenticate, aiRouter);

module.exports = router;