"use strict";

const User = require("../../auth/models/User");

const StudentMaster = require("../../academic/models/StudentMaster");

const StudentProfile = require("../models/StudentProfile");

const StudentActivity = require("../models/StudentActivity");

const Outpass = require("../../outpass/models/Outpass");

const Notification = require("../../notification/model/Notification");

const {
  OUTPASS_STATUS,
  ACTIVE_OUTPASS_STATUS,
} = require("../../outpass/constants/outpassStatus");

// ============================================================
// HELPERS
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const getCount = async (query) => Outpass.countDocuments(query);

// ============================================================
// DASHBOARD REPOSITORY
// ============================================================

class DashboardRepository {
  // ==========================================================
  // GET AUTHENTICATED STUDENT
  // ==========================================================

  async getStudent(userId) {
    return User.findById(userId)
      .select(
        "name email enrollmentNo enrollmentNumber " +
          "mobileNumber course branch semester section " +
          "profilePhoto isVerified isActive",
      )
      .lean();
  }

  // ==========================================================
  // GET STUDENTMASTER
  // Source of official student information.
  // ==========================================================

  async getStudentMaster(user) {
    if (!user) return null;

    const enrollmentNumber = normalize(
      user.enrollmentNo || user.enrollmentNumber,
    );

    if (!enrollmentNumber) {
      return null;
    }

    return StudentMaster.findOne({
      enrollmentNumber,
      isRegistered: true,
      isActive: true,
      isDeleted: false,
    })
      .populate({
        path: "institute",
        select: "name code",
      })
      .populate({
        path: "program",
        select: "name code department institute",
      })
      .lean();
  }

  // ==========================================================
  // LEGACY PROFILE
  // Optional for dashboard display.
  // HOLD status must still be enforced elsewhere.
  // ==========================================================

  async getStudentProfile(userId) {
    return StudentProfile.findOne({
      user: userId,
    }).lean();
  }

  // ==========================================================
  // CURRENT OUTPASS
  // ==========================================================

  async getCurrentOutpass(userId) {
    const activeStatuses = Array.isArray(ACTIVE_OUTPASS_STATUS)
      ? ACTIVE_OUTPASS_STATUS
      : [];

    if (activeStatuses.length === 0) {
      return null;
    }

    return Outpass.findOne({
      student: userId,
      status: {
        $in: activeStatuses,
      },
      isDeleted: false,
    })
      .select(
        "outpassId status reason destination " +
          "outDate outTime inTime parentDecision.status " +
          "qrGenerated qrValidFrom qrExpiresAt " +
          "exitVerified entryVerified createdAt",
      )
      .sort({
        createdAt: -1,
      })
      .lean();
  }

  // ==========================================================
  // DASHBOARD STATISTICS
  // ==========================================================

  async getDashboardStatistics(userId) {
    const baseQuery = {
      student: userId,
      isDeleted: false,
    };

    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
      exitedRequests,
      returnedRequests,
    ] = await Promise.all([
      getCount(baseQuery),

      getCount({
        ...baseQuery,
        status: OUTPASS_STATUS.PENDING,
      }),

      getCount({
        ...baseQuery,
        status: OUTPASS_STATUS.APPROVED,
      }),

      getCount({
        ...baseQuery,
        status: OUTPASS_STATUS.REJECTED,
      }),

      OUTPASS_STATUS.CANCELLED
        ? getCount({
            ...baseQuery,
            status: OUTPASS_STATUS.CANCELLED,
          })
        : Promise.resolve(0),

      // Actual Security EXIT verification.
      getCount({
        ...baseQuery,
        exitVerified: true,
      }),

      // Actual Security ENTRY verification.
      getCount({
        ...baseQuery,
        entryVerified: true,
      }),
    ]);

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
      exitedRequests,
      returnedRequests,
    };
  }

  // ==========================================================
  // RECENT ACTIVITIES
  // ==========================================================

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

  // ==========================================================
  // LATEST NOTIFICATIONS
  // ==========================================================

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

  // ==========================================================
  // UNREAD NOTIFICATIONS
  // ==========================================================

  async getUnreadNotificationCount(userId) {
    return Notification.countDocuments({
      receiver: userId,
      isDeleted: false,
      isRead: false,
    });
  }

  // ==========================================================
  // RECENT OUTPASSES
  // ==========================================================

  async getRecentOutpasses(userId, limit = 5) {
    return Outpass.find({
      student: userId,
      isDeleted: false,
    })
      .select(
        "outpassId status reason destination " +
          "outDate outTime inTime " +
          "parentDecision.status createdAt",
      )
      .sort({
        createdAt: -1,
      })
      .limit(limit)
      .lean();
  }

  // ==========================================================
  // ANNOUNCEMENTS
  // Existing placeholder.
  // ==========================================================

  async getAnnouncements() {
    return [];
  }
}

module.exports = new DashboardRepository();
