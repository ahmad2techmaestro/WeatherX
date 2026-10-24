const twilio = require("twilio");

let twilioClient = null;

const getTwilioClient = () => {
    if (twilioClient) {
        return twilioClient;
    }

    const accountSid =
        process.env.TWILIO_ACCOUNT_SID;

    const authToken =
        process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error(
            "Twilio configuration is incomplete."
        );
    }

    twilioClient = twilio(
        accountSid,
        authToken
    );

    return twilioClient;
};

const normalizePhoneNumber = (
    phoneNumber
) => {
    if (!phoneNumber) {
        throw new Error(
            "Recipient phone number is required."
        );
    }

    const normalized =
        String(phoneNumber).trim();

    if (!/^\+\d{8,15}$/.test(normalized)) {
        throw new Error(
            "Phone number must use E.164 format."
        );
    }

    return normalized;
};

const sendSms = async ({
    to,
    body,
}) => {
    if (!body?.trim()) {
        throw new Error(
            "SMS message body is required."
        );
    }

    const recipient =
        normalizePhoneNumber(to);

    const from =
        process.env.TWILIO_PHONE_NUMBER;

    if (!from) {
        throw new Error(
            "Twilio SMS phone number is not configured."
        );
    }

    const client =
        getTwilioClient();

    const message =
        await client.messages.create({
            from,
            to: recipient,
            body: body.trim(),
        });

    return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
    };
};

const sendWhatsApp = async ({
    to,
    body,
}) => {
    if (!body?.trim()) {
        throw new Error(
            "WhatsApp message body is required."
        );
    }

    const recipient =
        normalizePhoneNumber(to);

    const from =
        process.env.TWILIO_WHATSAPP_NUMBER;

    if (!from) {
        throw new Error(
            "Twilio WhatsApp number is not configured."
        );
    }

    const client =
        getTwilioClient();

    const message =
        await client.messages.create({
            from,
            to: `whatsapp:${recipient}`,
            body: body.trim(),
        });

    return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
    };
};

module.exports = {
    sendSms,
    sendWhatsApp,
};