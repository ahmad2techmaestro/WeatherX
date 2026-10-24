const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

let configured = null;

/** VAPID keys come from the environment: generate once with `npm run vapid`. */
const configure = () => {
    if (configured !== null) return configured;

    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        configured = false;
        return configured;
    }

    webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    return configured;
};

const isPushConfigured = () => configure();
const getPublicKey = () => (configure() ? process.env.VAPID_PUBLIC_KEY : null);

/**
 * Send to every device the user subscribed. Dead subscriptions (404/410) are removed.
 * Throws when the user has no device so the job runner can mark the row failed
 * instead of pretending it was delivered.
 */
const sendPushToUser = async (userId, { title, message, url = "/", tag }) => {
    if (!configure()) throw new Error("Web Push is not configured (VAPID keys missing).");

    const subs = await PushSubscription.find({ user: userId }).lean();
    if (subs.length === 0) throw new Error("User has no push-enabled device.");

    const payload = JSON.stringify({ title, body: message, url, tag });
    let delivered = 0;

    await Promise.all(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 6 * 3600 });
                delivered += 1;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await PushSubscription.deleteOne({ _id: sub._id });
                }
            }
        })
    );

    if (delivered === 0) throw new Error("Push delivery failed for every device.");
    return { delivered };
};

module.exports = { isPushConfigured, getPublicKey, sendPushToUser, _reset: () => { configured = null; } };
