"use strict";

const dashboardRepository = require("../repositories/dashboardRepository");

const dashboardDTO = require("../dtos/dashboard.dto");

// ============================================================
// STUDENT DASHBOARD SERVICE
// ============================================================

class DashboardService {
  async getDashboard(userId) {
    if (!userId) {
      throw new Error("Student authentication is required.");
    }

    // ========================================================
    // 1. AUTHENTICATED USER
    // ========================================================

    const user = await dashboardRepository.getStudent(userId);

    if (!user) {
      throw new Error("Student account not found.");
    }

    // ========================================================
    // 2. OFFICIAL STUDENTMASTER
    // ========================================================

    const studentMaster = await dashboardRepository.getStudentMaster(user);

    if (!studentMaster) {
      throw new Error(
        "Your active registered StudentMaster record was not found. Please contact the university administrator.",
      );
    }

    // ========================================================
    // 3. FETCH DASHBOARD MODULES
    // ========================================================

    const [
      profile,
      statistics,
      currentOutpass,
      recentActivities,
      notifications,
      unreadCount,
      recentOutpasses,
      announcements,
    ] = await Promise.all([
      dashboardRepository.getStudentProfile(userId),

      dashboardRepository.getDashboardStatistics(userId),

      dashboardRepository.getCurrentOutpass(userId),

      dashboardRepository.getRecentActivities(userId),

      dashboardRepository.getLatestNotifications(userId),

      dashboardRepository.getUnreadNotificationCount(userId),

      dashboardRepository.getRecentOutpasses(userId),

      dashboardRepository.getAnnouncements(),
    ]);

    // ========================================================
    // 4. RESPONSE
    // No profile completion/lock prerequisite.
    // ========================================================

    return dashboardDTO({
      user,
      studentMaster,
      profile,
      statistics,
      currentOutpass,
      recentActivities,
      notifications,
      unreadNotificationCount: unreadCount,
      recentOutpasses,
      announcements,
    });
  }
}

module.exports = new DashboardService();
