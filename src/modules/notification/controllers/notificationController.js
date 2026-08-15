const asyncHandler = require("express-async-handler");

const notificationService = require("../service/notificationService");

const getNotifications = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const data = await notificationService.getNotifications(
    req.user._id,
    page,
    limit,
  );

  res.status(200).json({
    success: true,
    message: "Notifications fetched successfully.",
    data,
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      unreadCount: count,
    },
  });
});


const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
    req.params.id,
    req.user._id,
  );

  res.status(200).json({
    success: true,
    message: "Notification marked as read.",
    data: notification,
  });
});


const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);

  res.status(200).json({
    success: true,
    message: "All notifications marked as read.",
  });
});


const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(req.params.id, req.user._id);

  res.status(200).json({
    success: true,
    message: "Notification deleted.",
  });
});

const clearNotifications = asyncHandler(async (req, res) => {
  await notificationService.clearNotifications(req.user._id);

  res.status(200).json({
    success: true,
    message: "All notifications cleared.",
  });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
};
