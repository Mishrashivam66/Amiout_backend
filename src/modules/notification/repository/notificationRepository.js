const Notification = require("../model/Notification");
// ============================================================================
// Create Notification
// ============================================================================
const createNotification = async (payload) => {
  return Notification.create(payload);
};
// ============================================================================
// Insert Multiple Notifications
// ============================================================================
const insertManyNotifications = async (notifications = []) => {
  return Notification.insertMany(notifications);
};

// ============================================================================
// Find Notification By ID
// ============================================================================
const findById = async (notificationId) => {
  return Notification.findOne({
    _id: notificationId,
    isDeleted: false,
  })
    .populate("sender", "name role")
    .populate("receiver", "name role")
    .populate("relatedOutpass", "outpassId");
};

// ============================================================================
// Get User Notifications
// ============================================================================
const getNotifications = async (receiverId, page = 1, limit = 10) => {
  return Notification.find({
    receiver: receiverId,
    isDeleted: false,
  })
    .populate("sender", "name role")
    .populate("relatedOutpass", "outpassId")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Count User Notifications
// ============================================================================
const countNotifications = async (receiverId) => {
  return Notification.countDocuments({
    receiver: receiverId,
    isDeleted: false,
  });
};

// ============================================================================
// Get Unread Notifications
// ============================================================================
const getUnreadNotifications = async (receiverId) => {
  return Notification.find({
    receiver: receiverId,
    isRead: false,
    isDeleted: false,
  }).sort({
    createdAt: -1,
  });
};

// ============================================================================
// Get Unread Count
// ============================================================================
const getUnreadCount = async (receiverId) => {
  return Notification.countDocuments({
    receiver: receiverId,
    isRead: false,
    isDeleted: false,
  });
};

// ============================================================================
// Mark Notification As Read
// ============================================================================
const markAsRead = async (notificationId, receiverId) => {
  return Notification.findOneAndUpdate(
    {
      _id: notificationId,
      receiver: receiverId,
      isDeleted: false,
    },
    {
      $set: {
        isRead: true,
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Mark All Notifications As Read
// ============================================================================
const markAllAsRead = async (receiverId) => {
  return Notification.updateMany(
    {
      receiver: receiverId,
      isRead: false,
      isDeleted: false,
    },
    {
      $set: {
        isRead: true,
      },
    },
  );
};

// ============================================================================
// Delete Notification (Soft Delete)
// ============================================================================
const deleteNotification = async (notificationId, receiverId) => {
  return Notification.findOneAndUpdate(
    {
      _id: notificationId,
      receiver: receiverId,
    },
    {
      $set: {
        isDeleted: true,
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Clear All Notifications
// ============================================================================
const clearNotifications = async (receiverId) => {
  return Notification.updateMany(
    {
      receiver: receiverId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
      },
    },
  );
};

// ============================================================================
// Export Repository
// ============================================================================

module.exports = Object.freeze({
  createNotification,
  findById,
  getNotifications,
  countNotifications,
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  insertManyNotifications,
});
