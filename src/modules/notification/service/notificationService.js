
const notificationRepository = require("../repository/notificationRepository");

// ============================================================================
// Send Notification
// ============================================================================
// ============================================================================
// Send Notification
// ============================================================================
// ============================================================================
// Send Notification
// ============================================================================

const sendNotification = async ({
  title,
  message,
  type,
  sender = null,
  receiver,
  role,
  relatedOutpass = null,
}) => {
  /**
   * Validate Receiver
   */
  if (!receiver) {
    throw new Error("Notification receiver is required.");
  }

  /**
   * Validate Required Fields
   */
  if (!type || !role) {
    throw new Error("Notification type and role are required.");
  }

  /**
   * Validate Title
   */
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Notification title is required.");
  }

  /**
   * Validate Message
   */
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Notification message is required.");
  }

  /**
   * Create Notification
   */
  return notificationRepository.createNotification({
    title: title.trim(),
    message: message.trim(),
    type,
    sender,
    receiver,
    role,
    relatedOutpass,
  });
};
// ============================================================================
// Send Bulk Notifications
// ============================================================================
const sendBulkNotifications = async (notifications = []) => {
  if (!notifications.length) {
    return [];
  }

  return notificationRepository.insertManyNotifications(notifications);
};

// ============================================================================
// Get Notifications
// ============================================================================
const getNotifications = async (receiverId, page = 1, limit = 10) => {
  const [notifications, total] = await Promise.all([
    notificationRepository.getNotifications(receiverId, page, limit),
    notificationRepository.countNotifications(receiverId),
  ]);

  return {
    notifications,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ============================================================================
// Get Unread Notifications
// ============================================================================
const getUnreadNotifications = async (receiverId) => {
  return notificationRepository.getUnreadNotifications(receiverId);
};

// ============================================================================
// Get Unread Count
// ============================================================================
const getUnreadCount = async (receiverId) => {
  return notificationRepository.getUnreadCount(receiverId);
};

// ============================================================================
// Mark Notification As Read
// ============================================================================
const markAsRead = async (notificationId, receiverId) => {
  return notificationRepository.markAsRead(notificationId, receiverId);
};

// ============================================================================
// Mark All Notifications As Read
// ============================================================================
const markAllAsRead = async (receiverId) => {
  return notificationRepository.markAllAsRead(receiverId);
};

// ============================================================================
// Delete Notification
// ============================================================================
const deleteNotification = async (notificationId, receiverId) => {
  return notificationRepository.deleteNotification(notificationId, receiverId);
};

// ============================================================================
// Clear Notifications
// ============================================================================
const clearNotifications = async (receiverId) => {
  return notificationRepository.clearNotifications(receiverId);
};

module.exports = Object.freeze({
  sendNotification,
  sendBulkNotifications,
  getNotifications,
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
});
