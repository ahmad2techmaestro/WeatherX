const path = require("path");
const swaggerJSDoc = require("swagger-jsdoc");

const swaggerDefinition = {
    openapi: "3.0.3",

    info: {
        title: "WeatherX API",
        version: "1.0.0",
        description:
            "REST API for WeatherX — a Weather Intelligence Platform.",
    },

    servers: [
        {
            url: "http://localhost:5000",
            description: "Local development server",
        },
    ],

    tags: [
        {
            name: "Health",
            description:
                "WeatherX API health and system status",
        },
        {
            name: "Authentication",
            description:
                "User registration, authentication and session management",
        },
        {
            name: "Weather",
            description:
                "Current weather, forecasts and weather intelligence",
        },
        {
            name: "Locations",
            description:
                "Location search and geographic operations",
        },
        {
            name: "Alerts",
            description:
                "Weather alert management",
        },
        {
            name: "Preferences",
            description:
                "User weather and notification preferences",
        },
        {
            name: "Personalization",
            description:
                "Personalized weather experience",
        },
        {
            name: "Analytics",
            description:
                "Weather analytics and insights",
        },
    ],

    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description:
                    "Enter a valid WeatherX access token.",
            },
        },
    },

    paths: {},
};

const swaggerOptions = {
    definition: swaggerDefinition,

    apis: [
        path.join(__dirname, "../api/*.js"),
        path.join(__dirname, "../server.js"),
    ],
};

const swaggerSpec =
    swaggerJSDoc(swaggerOptions);

module.exports = swaggerSpec;