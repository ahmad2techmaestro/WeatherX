const path = require("path");

const { describeKeySource } = require("./config/env");

const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const compression = require("compression");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");

const apis = require("./api");

const {
    initializeScheduler,
    shutdownScheduler,
} = require("./scheduler");

const app = express();

const PORT = process.env.PORT || 5000;

// --------------------------------------------------
// Security
// --------------------------------------------------

app.disable("x-powered-by");

// Behind a proxy (Render, Heroku, Nginx) the real client IP is needed for rate limiting.
// TRUST_PROXY=1 by default in production; set it to 0 or a hop count to override.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "0");

app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

app.use(compression());

// --------------------------------------------------
// CORS
// --------------------------------------------------

const allowedOrigins = (
    process.env.CLIENT_URL ||
    "http://localhost:5173"
)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests without an Origin header.
            // Useful for server-to-server requests and health checks.
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error("CORS policy violation.")
            );
        },

        credentials: true,

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
        ],
    })
);

// --------------------------------------------------
// Rate Limiting
// --------------------------------------------------

const jsonMessage = {
    success: false,
    message: "Too many requests. Please try again later.",
};

// General API traffic. Map tiles are exempt here because a single pan loads dozens of them.
const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 400,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith("/weather/map/"),
    message: jsonMessage,
});

// Search-as-you-type is chatty and hits third-party geocoders, so it gets its own budget.
const geoRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage,
});

const tileRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 4000,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage,
});

// --------------------------------------------------
// Security Headers
// --------------------------------------------------

app.use((req, res, next) => {
    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    res.setHeader(
        "X-Frame-Options",
        "DENY"
    );

    res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );

    // geolocation is needed for "use my location"; everything else stays off.
    res.setHeader(
        "Permissions-Policy",
        "geolocation=(self), microphone=(), camera=()"
    );

    if (process.env.NODE_ENV === "production") {
        res.setHeader(
            "Content-Security-Policy",
            [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://tile.opentopomap.org https://*.tile.opentopomap.org",
                "font-src 'self' data:",
                "connect-src 'self'",
                "frame-ancestors 'none'",
                "base-uri 'self'",
                "object-src 'none'",
            ].join("; ")
        );
    }

    next();
});

// --------------------------------------------------
// Body Parsing
// --------------------------------------------------

app.use(
    express.json({
        limit: "100kb",
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "100kb",
    })
);

// --------------------------------------------------
// Cookies
// --------------------------------------------------

app.use(cookieParser());

// --------------------------------------------------
// Health Check
// --------------------------------------------------

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "WeatherX API is running",
        environment:
            process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
    });
});

// --------------------------------------------------
// Swagger API Documentation
// --------------------------------------------------

app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customSiteTitle: "WeatherX API Documentation",
    })
);

// --------------------------------------------------
// API Routes
// --------------------------------------------------

app.use("/api/geo", geoRateLimiter);
app.use("/api/weather/map", tileRateLimiter);

app.use(
    "/api",
    apiRateLimiter,
    apis
);

// --------------------------------------------------
// Production Frontend
// --------------------------------------------------

if (process.env.NODE_ENV === "production") {
    const clientBuildPath = path.join(
        __dirname,
        "../client/dist"
    );

    // Vite fingerprints everything under /assets, so it can be cached for a year.
    app.use(
        "/assets",
        express.static(path.join(clientBuildPath, "assets"), {
            immutable: true,
            maxAge: "1y",
        })
    );

    app.use(
        express.static(clientBuildPath, {
            index: false,
            maxAge: "1h",
        })
    );

    // Single-page app fallback. Unknown /api and /health paths must stay real 404s.
    app.get(/^\/(?!api(\/|$)|health$|api-docs).*/, (req, res) => {
        res.setHeader("Cache-Control", "no-cache");

        res.sendFile(
            path.join(
                clientBuildPath,
                "index.html"
            )
        );
    });
}

// --------------------------------------------------
// 404 Handler
// --------------------------------------------------

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
});

// --------------------------------------------------
// Global Error Handler
// --------------------------------------------------

app.use((err, req, res, next) => {
    console.error(
        "[WeatherX] Unhandled Error:",
        err
    );

    const statusCode =
        Number.isInteger(err.status) &&
        err.status >= 400 &&
        err.status < 600
            ? err.status
            : 500;

    const isProduction =
        process.env.NODE_ENV === "production";

    res.status(statusCode).json({
        success: false,

        message:
            statusCode === 500 && isProduction
                ? "Internal Server Error"
                : err.message ||
                  "Internal Server Error",
    });
});

// --------------------------------------------------
// MongoDB Connection + Server Start
// --------------------------------------------------

const startServer = async () => {
    try {
        const mongoUri = process.env.DB;

        if (!mongoUri) {
            throw new Error(
                "DB environment variable is not configured."
            );
        }

        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });

        console.log("MongoDB Connected...");

        app.listen(PORT, () => {
            console.log(
                `WeatherX API running on port ${PORT}`
            );

            const keyInfo = describeKeySource();

            console.log(
                keyInfo.envVar
                    ? `OpenWeather key: found in ${keyInfo.envVar} (${keyInfo.keyLength} chars${keyInfo.looksValid ? "" : ", unusual length: check for typos"}). Test it at /api/weather/map/status`
                    : "OpenWeather key: NOT FOUND. Add OPENWEATHER_API_KEY to server/.env and restart (map layers stay off until then)."
            );

            console.log(
                `Swagger Docs available at http://localhost:${PORT}/api-docs`
            );

            initializeScheduler();
        });
    } catch (error) {
        console.error(
            "Failed to start server:",
            error.message
        );

        process.exit(1);
    }
};

// --------------------------------------------------
// Graceful Shutdown
// --------------------------------------------------

const shutdownServer = async (signal) => {
    console.log(
        `\n[Server] ${signal} received`
    );

    try {
        shutdownScheduler();

        await mongoose.connection.close();

        console.log(
            "[Server] MongoDB connection closed"
        );

        process.exit(0);
    } catch (error) {
        console.error(
            "[Server] Shutdown failed:",
            error.message
        );

        process.exit(1);
    }
};

process.on("unhandledRejection", (reason) => {
    console.error("[WeatherX] Unhandled promise rejection:", reason);
});

process.on("SIGINT", () => {
    shutdownServer("SIGINT");
});

process.on("SIGTERM", () => {
    shutdownServer("SIGTERM");
});

// --------------------------------------------------
// Start Application
// --------------------------------------------------

startServer();