
const User = require("../../auth/models/User");
const StudentProfile = require("../models/StudentProfile");
const StudentActivity = require("../models/StudentActivity");

const Outpass = require("../../outpass/models/Outpass");
const Notification = require("../../notification/model/Notification");

const {
  OUTPASS_STATUS,
  ACTIVE_OUTPASS_STATUS,
} = require("../../outpass/constants/outpassStatus");

class DashboardRepository {
  // ============================================================================
// Get Student
// ============================================================================

  async getStudent(userId) {
    return User.findById(userId)
      .select(
        "name email enrollmentNo mobileNumber branch semester section profilePhoto isVerified isActive",
      )
      .lean();
  }

  // ============================================================================
// Student Profile
// ============================================================================

  async getStudentProfile(userId) {
    return StudentProfile.findOne({
      user: userId,
    }).lean();
  }

  // ============================================================================
// Current Active Outpass
// ============================================================================

  async getCurrentOutpass(userId) {
    return Outpass.findOne({
      student: userId,
      status: {
        $in: ACTIVE_OUTPASS_STATUS,
      },
      isDeleted: false,
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // ============================================================================
// Dashboard Statistics
// ============================================================================

  async getDashboardStatistics(userId) {
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
    ] = await Promise.all([
      Outpass.countDocuments({
        student: userId,
        isDeleted: false,
      }),

      Outpass.countDocuments({
        student: userId,
        status: OUTPASS_STATUS.PENDING,
        isDeleted: false,
      }),

      Outpass.countDocuments({
        student: userId,
        status: OUTPASS_STATUS.APPROVED,
        isDeleted: false,
      }),

      Outpass.countDocuments({
        student: userId,
        status: OUTPASS_STATUS.REJECTED,
        isDeleted: false,
      }),

      Outpass.countDocuments({
        student: userId,
        status: OUTPASS_STATUS.CANCELLED,
        isDeleted: false,
      }),
    ]);

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
    };
  }

  // ============================================================================
// Recent Activities
// ============================================================================

  async getRecentActivities(userId, limit = 5) {
    return StudentActivity.find({
      user: userId,
    })
      .sort({
        createdAt: -1,
      })
      .limit(limit)
      .lean();
  }

  // ============================================================================
// Latest Notifications
// ============================================================================

  async getLatestNotifications(userId, limit = 5) {
    return Notification.find({
      receiver: userId,
      isDeleted: false,
    })
      .sort({
        createdAt: -1,
      })
      .limit(limit)
      .lean();
  }

  // ============================================================================
// Unread Notification Count
// ============================================================================

  async getUnreadNotificationCount(userId) {
    return Notification.countDocuments({
      receiver: userId,
      isDeleted: false,
      isRead: false,
    });
  }

  // ============================================================================
// Recent Outpasses
// ============================================================================

  async getRecentOutpasses(userId, limit = 5) {
    return Outpass.find({
      student: userId,
      isDeleted: false,
    })
      .sort({
        createdAt: -1,
      })
      .limit(limit)
      .lean();
  }
  async getAnnouncements() {
    return [];
  }
}

module.exports = new DashboardRepository();
