import apiClient from "./apiClient";

/**
 * Fetch authenticated user's in-app notifications.
 *
 * The API also returns the unread notification count.
 */
export const getNotifications = async () => {
    const response = await apiClient.get(
        "/notifications"
    );

    return response.data?.data || {
        notifications: [],
        unreadCount: 0,
    };
};

/**
 * Mark one in-app notification as read.
 */
export const markNotificationAsRead = async (
    notificationId
) => {
    if (!notificationId) {
        throw new Error(
            "Notification ID is required."
        );
    }

    const response = await apiClient.patch(
        `/notifications/${notificationId}/read`
    );

    return response.data?.data || null;
};

/**
 * Mark all in-app notifications as read.
 */
export const markAllNotificationsAsRead =
    async () => {
        const response = await apiClient.patch(
            "/notifications/read-all"
        );

        return response.data?.data || {
            modifiedCount: 0,
        };
    };
    