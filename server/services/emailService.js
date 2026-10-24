const nodemailer = require("nodemailer");

let transporter = null;

const getEmailConfig = () => {
    const host = process.env.EMAIL_SMTP_HOST;
    const port = Number(
        process.env.EMAIL_SMTP_PORT || 587
    );
    const user = process.env.EMAIL_SMTP_USER;
    const password =
        process.env.EMAIL_SMTP_PASSWORD;

    if (
        !host ||
        !user ||
        !password
    ) {
        throw new Error(
            "Email SMTP configuration is incomplete."
        );
    }

    return {
        host,
        port,
        secure:
            String(
                process.env.EMAIL_SMTP_SECURE ||
                    "false"
            ).toLowerCase() === "true",
        auth: {
            user,
            pass: password,
        },
    };
};

const getTransporter = () => {
    if (transporter) {
        return transporter;
    }

    transporter =
        nodemailer.createTransport(
            getEmailConfig()
        );

    return transporter;
};

const getFromAddress = () => {
    return (
        process.env.EMAIL_FROM ||
        process.env.EMAIL_SMTP_USER ||
        ""
    );
};

const sendEmail = async ({
    to,
    subject,
    text,
    html,
}) => {
    if (!to) {
        throw new Error(
            "Recipient email address is required."
        );
    }

    if (!subject) {
        throw new Error(
            "Email subject is required."
        );
    }

    if (!text && !html) {
        throw new Error(
            "Email content is required."
        );
    }

    const from = getFromAddress();

    if (!from) {
        throw new Error(
            "Email sender address is not configured."
        );
    }

    const mailTransporter =
        getTransporter();

    const info =
        await mailTransporter.sendMail({
            from,
            to,
            subject,
            text,
            html,
        });

    return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
    };
};

const sendWeatherAlertEmail = async ({
    to,
    userName,
    title,
    message,
    metadata = {},
}) => {
    const location =
        metadata?.location?.city ||
        "your selected location";

    const severity =
        metadata?.severity || "warning";

    const weatherSnapshot =
        metadata?.weatherSnapshot || {};

    const temperature =
        weatherSnapshot.temperature;

    const humidity =
        weatherSnapshot.humidity;

    const windSpeed =
        weatherSnapshot.windSpeed;

    const weatherDetails = [];

    if (
        Number.isFinite(
            Number(temperature)
        )
    ) {
        weatherDetails.push(
            `Temperature: ${temperature}°C`
        );
    }

    if (
        Number.isFinite(
            Number(humidity)
        )
    ) {
        weatherDetails.push(
            `Humidity: ${humidity}%`
        );
    }

    if (
        Number.isFinite(
            Number(windSpeed)
        )
    ) {
        weatherDetails.push(
            `Wind: ${windSpeed} km/h`
        );
    }

    const detailsText =
        weatherDetails.length > 0
            ? weatherDetails.join(" | ")
            : "Current weather details are available in WeatherX.";

    const safeUserName =
        userName?.trim() ||
        "WeatherX User";

    const text = `
WeatherX Weather Alert

Hello ${safeUserName},

WeatherX detected an active ${severity} weather alert for ${location}.

${title}

${message}

${detailsText}

Open WeatherX to view your latest weather conditions and alerts.

This is an automated notification from WeatherX.
`.trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    />
    <title>${title}</title>
</head>

<body
    style="
        margin: 0;
        padding: 0;
        background: #f4f7fb;
        font-family: Arial, Helvetica, sans-serif;
        color: #172033;
    "
>
    <div
        style="
            max-width: 620px;
            margin: 0 auto;
            padding: 32px 18px;
        "
    >
        <div
            style="
                background: #ffffff;
                border-radius: 18px;
                overflow: hidden;
                box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
            "
        >
            <div
                style="
                    padding: 28px 30px;
                    background: #111827;
                    color: #ffffff;
                "
            >
                <div
                    style="
                        font-size: 12px;
                        font-weight: 700;
                        letter-spacing: 2px;
                        opacity: 0.7;
                    "
                >
                    WEATHERX
                </div>

                <div
                    style="
                        margin-top: 8px;
                        font-size: 24px;
                        font-weight: 700;
                    "
                >
                    Weather Intelligence
                </div>
            </div>

            <div
                style="
                    padding: 30px;
                "
            >
                <p
                    style="
                        margin: 0 0 18px;
                        font-size: 15px;
                        color: #475569;
                    "
                >
                    Hello ${safeUserName},
                </p>

                <div
                    style="
                        padding: 20px;
                        border-radius: 14px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                    "
                >
                    <div
                        style="
                            font-size: 12px;
                            font-weight: 700;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: #64748b;
                        "
                    >
                        ${location}
                    </div>

                    <h1
                        style="
                            margin: 8px 0 10px;
                            font-size: 22px;
                            line-height: 1.3;
                            color: #111827;
                        "
                    >
                        ${title}
                    </h1>

                    <p
                        style="
                            margin: 0;
                            font-size: 15px;
                            line-height: 1.7;
                            color: #475569;
                        "
                    >
                        ${message}
                    </p>
                </div>

                <div
                    style="
                        margin-top: 18px;
                        padding: 16px 18px;
                        border-radius: 12px;
                        background: #f1f5f9;
                        font-size: 13px;
                        line-height: 1.7;
                        color: #475569;
                    "
                >
                    ${detailsText}
                </div>

                <p
                    style="
                        margin: 24px 0 0;
                        font-size: 13px;
                        line-height: 1.6;
                        color: #64748b;
                    "
                >
                    Open WeatherX to view your latest weather
                    conditions and alerts.
                </p>
            </div>

            <div
                style="
                    padding: 20px 30px;
                    border-top: 1px solid #e2e8f0;
                    background: #fafafa;
                    font-size: 12px;
                    line-height: 1.6;
                    color: #94a3b8;
                "
            >
                This is an automated notification from
                WeatherX. Please do not reply to this email.
            </div>
        </div>
    </div>
</body>
</html>
`.trim();

    return sendEmail({
        to,
        subject: `WeatherX Alert: ${title}`,
        text,
        html,
    });
};

module.exports = {
    sendEmail,
    sendWeatherAlertEmail,
};