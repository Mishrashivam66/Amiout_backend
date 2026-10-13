"use strict";

// ============================================================
// HELPERS
// ============================================================

const getValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
};

const getSafeNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? number : 0;
};

// ============================================================
// STUDENT DASHBOARD DTO
// ============================================================

const dashboardDTO = ({
  user,
  studentMaster = null,
  profile = null,
  currentOutpass = null,
  statistics = {},
  recentActivities = [],
  notifications = [],
  announcements = [],
  unreadNotificationCount = 0,
  recentOutpasses = [],
}) => {
  const master = studentMaster || {};

  return {
    // ========================================================
    // STUDENT DETAILS
    // ========================================================

    student: {
      id: user._id,

      name: getValue(master.name, user.name),

      enrollmentNo: getValue(
        master.enrollmentNumber,
        user.enrollmentNo,
        user.enrollmentNumber,
      ),

      enrollmentNumber: getValue(
        master.enrollmentNumber,
        user.enrollmentNo,
        user.enrollmentNumber,
      ),

      rollNumber: getValue(master.rollNumber),

      email: getValue(master.email, user.email),

      mobileNumber: getValue(master.mobileNumber, user.mobileNumber),

      course: getValue(master.program?.name, user.course),

      branch: getValue(master.program?.name, user.branch),

      semester: getValue(master.semester, user.semester),

      section: getValue(master.section, user.section),

      group: getValue(master.group),

      batch: getValue(master.batch),
    },

    // ========================================================
    // PROFILE INFORMATION
    // Compatibility only - no profile lock requirement.
    // ========================================================

    profile: {
      completed: Boolean(studentMaster),

      locked: false,

      accountStatus: profile?.accountStatus || null,

      holdReason: profile?.holdReason || "",
    },

    // ========================================================
    // DASHBOARD STATISTICS
    // ========================================================

    statistics: {
      totalRequests: getSafeNumber(statistics.totalRequests),

      pendingRequests: getSafeNumber(statistics.pendingRequests),

      approvedRequests: getSafeNumber(statistics.approvedRequests),

      rejectedRequests: getSafeNumber(statistics.rejectedRequests),

      cancelledRequests: getSafeNumber(statistics.cancelledRequests),

      exitedRequests: getSafeNumber(statistics.exitedRequests),

      returnedRequests: getSafeNumber(statistics.returnedRequests),
    },

    // ========================================================
    // CURRENT OUTPASS
    // ========================================================

    currentOutpass,

    // ========================================================
    // RECENT DATA
    // ========================================================

    recentActivities: Array.isArray(recentActivities) ? recentActivities : [],

    notifications: Array.isArray(notifications) ? notifications : [],

    recentOutpasses: Array.isArray(recentOutpasses) ? recentOutpasses : [],

    announcements: Array.isArray(announcements) ? announcements : [],

    unreadNotificationCount: getSafeNumber(unreadNotificationCount),

    generatedAt: new Date(),
  };
};

module.exports = dashboardDTO;
