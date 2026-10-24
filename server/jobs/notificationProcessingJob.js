const Notification = require("../models/Notification");

const {
    deliverInAppNotification,
    deliverEmailNotification,
    deliverSmsNotification,
    deliverWhatsAppNotification,
    deliverPushNotification,
} = require("../services/notificationService");

const BATCH_SIZE = 20;

const processNotification = async (
    notification
) => {
    const notificationId =
        notification._id.toString();

    try {
        const processingNotification =
            await Notification.findOneAndUpdate(
                {
                    _id: notification._id,
                    status: "pending",
                },
                {
                    $set: {
                        status: "processing",
                        lastAttemptAt: new Date(),
                    },
                },
                {
                    new: true,
                }
            );

        if (!processingNotification) {
            return {
                success: false,
                notificationId,
                reason:
                    "Notification is no longer pending.",
            };
        }

        /*
         * In-app notification
         */
        if (
            processingNotification.channel ===
            "in_app"
        ) {
            const deliveredNotification =
                await deliverInAppNotification(
                    processingNotification
                );

            return {
                success: true,
                notificationId,
                channel: "in_app",
                status:
                    deliveredNotification.status,
            };
        }

        /*
         * Email notification
         */
        if (
            processingNotification.channel ===
            "email"
        ) {
            const deliveredNotification =
                await deliverEmailNotification(
                    processingNotification
                );

            return {
                success: true,
                notificationId,
                channel: "email",
                status:
                    deliveredNotification.status,
            };
        }

        /*
         * SMS notification
         */
        if (
            processingNotification.channel ===
            "sms"
        ) {
            const deliveredNotification =
                await deliverSmsNotification(
                    processingNotification
                );

            return {
                success: true,
                notificationId,
                channel: "sms",
                status:
                    deliveredNotification.status,
            };
        }

        /*
         * WhatsApp notification
         */
        if (
            processingNotification.channel ===
            "whatsapp"
        ) {
            const deliveredNotification =
                await deliverWhatsAppNotification(
                    processingNotification
                );

            return {
                success: true,
                notificationId,
                channel: "whatsapp",
                status:
                    deliveredNotification.status,
            };
        }

        if (processingNotification.channel === "push") {
            const delivered = await deliverPushNotification(processingNotification);

            return {
                success: true,
                notificationId,
                channel: "push",
                status: delivered.status,
            };
        }

        /*
         * Unknown notification channel.
         *
         * Keep it pending instead of incorrectly
         * marking it as sent.
         */
        await Notification.findOneAndUpdate(
            {
                _id: notification._id,
                status: "processing",
            },
            {
                $set: {
                    status: "pending",
                },
            }
        );

        return {
            success: false,
            notificationId,
            channel:
                processingNotification.channel,
            reason:
                "Unsupported notification channel.",
        };
    } catch (error) {
        const currentNotification =
            await Notification.findById(
                notification._id
            );

        if (!currentNotification) {
            return {
                success: false,
                notificationId,
                reason:
                    "Notification no longer exists.",
            };
        }

        const retryCount =
            currentNotification.retryCount + 1;

        const shouldRetry =
            retryCount <=
            currentNotification.maxRetries;

        await Notification.findByIdAndUpdate(
            notification._id,
            {
                $set: {
                    status: shouldRetry
                        ? "pending"
                        : "failed",

                    retryCount,

                    failedAt: shouldRetry
                        ? null
                        : new Date(),

                    errorMessage:
                        error.message ||
                        "Notification processing failed.",
                },
            }
        );

        return {
            success: false,
            notificationId,
            retryCount,
            status: shouldRetry
                ? "pending"
                : "failed",
            reason: error.message,
        };
    }
};

const processPendingNotifications =
    async () => {
        const startedAt = Date.now();

        console.log(
            "[NotificationProcessingJob] Starting notification processing..."
        );

        let processed = 0;
        let succeeded = 0;
        let deferred = 0;
        let failed = 0;

        try {
            const notifications =
                await Notification.find({
                    status: "pending",
                })
                    .sort({
                        createdAt: 1,
                    })
                    .limit(BATCH_SIZE)
                    .lean();

            if (notifications.length === 0) {
                console.log(
                    "[NotificationProcessingJob] No pending notifications."
                );

                return {
                    processed: 0,
                    succeeded: 0,
                    deferred: 0,
                    failed: 0,
                    duration:
                        Date.now() -
                        startedAt,
                };
            }

            for (const notification of notifications) {
                processed += 1;

                const result =
                    await processNotification(
                        notification
                    );

                if (result.success) {
                    succeeded += 1;
                } else if (
                    result.status === "failed"
                ) {
                    failed += 1;
                } else {
                    deferred += 1;
                }
            }

            const duration =
                Date.now() - startedAt;

            console.log(
                `[NotificationProcessingJob] Completed in ${duration}ms`
            );

            console.log(
                `[NotificationProcessingJob] Processed: ${processed}, Succeeded: ${succeeded}, Deferred: ${deferred}, Failed: ${failed}`
            );

            return {
                processed,
                succeeded,
                deferred,
                failed,
                duration,
            };
        } catch (error) {
            console.error(
                "[NotificationProcessingJob] Fatal error:",
                error.message
            );

            throw error;
        }
    };

module.exports = {
    processNotification,
    processPendingNotifications,
};