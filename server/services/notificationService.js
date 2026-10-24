const Notification = require("../models/Notification");
const UserPreferences = require("../models/UserPreferences");
const User = require("../models/User");
const PushSubscription = require("../models/PushSubscription");

const {
    sendWeatherAlertEmail,
} = require("./emailService");

const {
    sendSms,
    sendWhatsApp,
} = require("./twilioService");

const { sendPushToUser, isPushConfigured } = require("./pushService");

// notification channel -> key inside UserPreferences.notifications.channels
const CHANNEL_PREF_KEYS = {
    in_app: "inApp",
    email: "email",
    sms: "sms",
    whatsapp: "whatsapp",
};

const getEnabledNotificationChannels = async (
    userId
) => {
    const preferences =
        await UserPreferences.findOne({
            user: userId,
        })
            .select("notifications")
            .lean();

    const channels =
        preferences?.notifications?.channels || {};

    const enabled = Object.keys(CHANNEL_PREF_KEYS).filter(
        (channel) => channels[CHANNEL_PREF_KEYS[channel]] === true
    );

    // Push is opt-in per device (browser permission), so a registered device is the opt-in.
    if (isPushConfigured() && (await PushSubscription.exists({ user: userId }))) {
        enabled.push("push");
    }

    return enabled;
};

/**
 * Create one notification per enabled channel. `dedupeKey` makes it idempotent: the
 * same key is never queued twice for a user/channel, so jobs can run as often as they like.
 */
const notifyUser = async ({ userId, type, title, message, metadata = {}, dedupeKey = "", channels }) => {
    const enabled = channels || (await getEnabledNotificationChannels(userId));
    const created = [];

    for (const channel of enabled) {
        if (dedupeKey) {
            const exists = await Notification.exists({ user: userId, channel, dedupeKey });
            if (exists) continue;
        }

        created.push(
            await Notification.create({
                user: userId,
                type,
                channel,
                status: "pending",
                title: String(title).slice(0, 150),
                message: String(message).slice(0, 1000),
                metadata,
                dedupeKey,
                retryCount: 0,
                maxRetries: 3,
                isRead: false,
            })
        );
    }

    return created;
};

/** Deliver a push notification to the user's registered devices. */
const deliverPushNotification = async (notification) => {
    if (notification.channel !== "push" || notification.status !== "processing") {
        throw new Error("Push notification must be in processing state.");
    }

    await sendPushToUser(notification.user, {
        title: notification.title,
        message: notification.message,
        url: notification.metadata?.url || "/alerts",
        tag: notification.dedupeKey || String(notification._id),
    });

    return Notification.findOneAndUpdate(
        { _id: notification._id, channel: "push", status: "processing" },
        { $set: { status: "sent", sentAt: new Date(), failedAt: null, errorMessage: "" } },
        { new: true }
    );
};

/**
 * Create notification records for all enabled
 * delivery channels.
 */
const createWeatherAlertNotifications = async ({
    userId,
    alert,
}) => {
    if (!userId) {
        throw new Error(
            "User ID is required to create notifications."
        );
    }

    if (!alert?._id) {
        throw new Error(
            "Alert is required to create notifications."
        );
    }

    const enabledChannels =
        await getEnabledNotificationChannels(
            userId
        );

    if (enabledChannels.length === 0) {
        return [];
    }

    const createdNotifications = [];

    for (const channel of enabledChannels) {
        const existingNotification =
            await Notification.findOne({
                user: userId,
                alert: alert._id,
                channel,
            });

        if (existingNotification) {
            continue;
        }

        const notification =
            await Notification.create({
                user: userId,

                alert: alert._id,

                type: "weather_alert",

                channel,

                status: "pending",

                title: alert.title,

                message: alert.message,

                metadata: {
                    alertType: alert.type,

                    severity:
                        alert.severity,

                    location:
                        alert.location,

                    weatherSnapshot:
                        alert.weatherSnapshot,
                },

                retryCount: 0,

                maxRetries: 3,

                isRead: false,
            });

        createdNotifications.push(
            notification
        );
    }

    return createdNotifications;
};

/**
 * Deliver an in-app notification.
 */
const deliverInAppNotification = async (
    notification
) => {
    if (!notification?._id) {
        throw new Error(
            "Notification is required for in-app delivery."
        );
    }

    if (notification.channel !== "in_app") {
        throw new Error(
            "Notification channel must be in_app."
        );
    }

    const deliveredNotification =
        await Notification.findOneAndUpdate(
            {
                _id: notification._id,
                channel: "in_app",
                status: "processing",
            },
            {
                $set: {
                    status: "sent",

                    isRead: false,

                    sentAt: new Date(),

                    failedAt: null,

                    errorMessage: "",
                },
            },
            {
                new: true,
            }
        );

    if (!deliveredNotification) {
        throw new Error(
            "In-app notification could not be delivered."
        );
    }

    return deliveredNotification;
};

/**
 * Deliver a weather alert through email.
 */
const deliverEmailNotification = async (
    notification
) => {
    if (!notification?._id) {
        throw new Error(
            "Notification is required for email delivery."
        );
    }

    if (notification.channel !== "email") {
        throw new Error(
            "Notification channel must be email."
        );
    }

    if (notification.status !== "processing") {
        throw new Error(
            "Email notification must be in processing state."
        );
    }

    const user = await User.findById(
        notification.user
    )
        .select(
            "name email isEmailVerified"
        )
        .lean();

    if (!user) {
        throw new Error(
            "Notification recipient user was not found."
        );
    }

    if (!user.email) {
        throw new Error(
            "Notification recipient does not have an email address."
        );
    }

    if (process.env.EMAIL_REQUIRE_VERIFIED === "true" && user.isEmailVerified === false) {
        throw new Error(
            "Notification recipient email address is not verified."
        );
    }

    const metadata =
        notification.metadata || {};

    await sendWeatherAlertEmail({
        to: user.email,

        userName: user.name,

        title: notification.title,

        message: notification.message,

        metadata,
    });

    const deliveredNotification =
        await Notification.findOneAndUpdate(
            {
                _id: notification._id,

                user: notification.user,

                channel: "email",

                status: "processing",
            },
            {
                $set: {
                    status: "sent",

                    sentAt: new Date(),

                    failedAt: null,

                    errorMessage: "",
                },
            },
            {
                new: true,
            }
        );

    if (!deliveredNotification) {
        throw new Error(
            "Email notification could not be marked as sent."
        );
    }

    return deliveredNotification;
};

/**
 * Resolve the user's notification phone number.
 */
const getNotificationPhoneNumber = async (
    userId
) => {
    const preferences =
        await UserPreferences.findOne({
            user: userId,
        })
            .select(
                "notifications.phoneNumber"
            )
            .lean();

    const phoneNumber =
        preferences?.notifications?.phoneNumber;

    if (!phoneNumber) {
        throw new Error(
            "Notification recipient does not have a phone number configured."
        );
    }

    return phoneNumber.trim();
};

/**
 * Deliver a weather alert through SMS.
 */
const deliverSmsNotification = async (
    notification
) => {
    if (!notification?._id) {
        throw new Error(
            "Notification is required for SMS delivery."
        );
    }

    if (notification.channel !== "sms") {
        throw new Error(
            "Notification channel must be sms."
        );
    }

    if (notification.status !== "processing") {
        throw new Error(
            "SMS notification must be in processing state."
        );
    }

    const phoneNumber =
        await getNotificationPhoneNumber(
            notification.user
        );

    const result = await sendSms({
        to: phoneNumber,

        body: `${notification.title}\n\n${notification.message}`,
    });

    const deliveredNotification =
        await Notification.findOneAndUpdate(
            {
                _id: notification._id,

                user: notification.user,

                channel: "sms",

                status: "processing",
            },
            {
                $set: {
                    status: "sent",

                    sentAt: new Date(),

                    failedAt: null,

                    errorMessage: "",

                    metadata: {
                        ...(notification.metadata || {}),

                        provider: "twilio",

                        providerMessageSid:
                            result.sid,

                        providerStatus:
                            result.status,
                    },
                },
            },
            {
                new: true,
            }
        );

    if (!deliveredNotification) {
        throw new Error(
            "SMS notification could not be marked as sent."
        );
    }

    return deliveredNotification;
};

/**
 * Deliver a weather alert through WhatsApp.
 */
const deliverWhatsAppNotification = async (
    notification
) => {
    if (!notification?._id) {
        throw new Error(
            "Notification is required for WhatsApp delivery."
        );
    }

    if (notification.channel !== "whatsapp") {
        throw new Error(
            "Notification channel must be whatsapp."
        );
    }

    if (notification.status !== "processing") {
        throw new Error(
            "WhatsApp notification must be in processing state."
        );
    }

    const phoneNumber =
        await getNotificationPhoneNumber(
            notification.user
        );

    const result =
        await sendWhatsApp({
            to: phoneNumber,

            body: `${notification.title}\n\n${notification.message}`,
        });

    const deliveredNotification =
        await Notification.findOneAndUpdate(
            {
                _id: notification._id,

                user: notification.user,

                channel: "whatsapp",

                status: "processing",
            },
            {
                $set: {
                    status: "sent",

                    sentAt: new Date(),

                    failedAt: null,

                    errorMessage: "",

                    metadata: {
                        ...(notification.metadata || {}),

                        provider: "twilio",

                        providerMessageSid:
                            result.sid,

                        providerStatus:
                            result.status,
                    },
                },
            },
            {
                new: true,
            }
        );

    if (!deliveredNotification) {
        throw new Error(
            "WhatsApp notification could not be marked as sent."
        );
    }

    return deliveredNotification;
};

module.exports = {
    getEnabledNotificationChannels,

    createWeatherAlertNotifications,

    notifyUser,

    deliverPushNotification,

    deliverInAppNotification,

    deliverEmailNotification,

    deliverSmsNotification,

    deliverWhatsAppNotification,
};