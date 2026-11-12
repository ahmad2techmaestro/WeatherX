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
const assistantRouter = require("./assistant");
const { track } = require("../services/ops/events");
const predictionRouter = require("./prediction");
const researchRouter = require("./research");
const automationRouter = require("./automation");
const { status: mlStatusRouter, vision: visionRouter } = require("./vision");
const { agents: agentsRouter, air: airRouter, travelRouter } = require("./agents");

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
router.use("/ai", authenticate, track("ai"), aiRouter);
router.use("/assistant", authenticate, track("assistant"), assistantRouter);
router.use("/prediction", authenticate, track("prediction"), predictionRouter);
router.use("/research", authenticate, track("research"), researchRouter);
router.use("/memory", authenticate, researchRouter.memoryRouter);
router.use("/agents", authenticate, track("agents"), agentsRouter);
router.use("/automation", authenticate, track("automation"), automationRouter);
router.use("/ml", authenticate, mlStatusRouter);
router.use("/vision", authenticate, track("vision"), visionRouter);
router.use("/air", authenticate, track("air"), airRouter);
router.use("/ai-ops", authenticate, require("./aiops"));
router.use("/travel", authenticate, track("travel"), travelRouter);

module.exports = router;