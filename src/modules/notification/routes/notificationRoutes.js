const express = require("express");

const router = express.Router();

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
} = require("../controllers/notificationController");

const { protect } = require("../../../middlewares/auth.middleware");

router.use(protect);

router.get("/", getNotifications);

router.get("/unread-count", getUnreadCount);

router.patch("/mark-all-read", markAllAsRead);

router.patch("/:id/read", markAsRead);

router.delete("/:id", deleteNotification);

router.delete("/", clearNotifications);

module.exports = router;
