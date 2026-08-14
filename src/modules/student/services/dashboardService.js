
const dashboardRepository = require("../repositories/dashboardRepository");
const dashboardDTO = require("../dtos/dashboard.dto");

class DashboardService {
  // ============================================================================
// Student Dashboard
// ============================================================================

  async getDashboard(userId) {
    const [
      user,
      profile,
      statistics,
      currentOutpass,
      recentActivities,
      notifications,
      unreadCount,
      recentOutpasses,
      announcements,
    ] = await Promise.all([
      dashboardRepository.getStudent(userId),

      dashboardRepository.getStudentProfile(userId),

      dashboardRepository.getDashboardStatistics(userId),

      dashboardRepository.getCurrentOutpass(userId),

      dashboardRepository.getRecentActivities(userId),

      dashboardRepository.getLatestNotifications(userId),

      dashboardRepository.getUnreadNotificationCount(userId),

      dashboardRepository.getRecentOutpasses(userId),

      dashboardRepository.getAnnouncements(),
    ]);

    // ============================================================================
// User Not Found
// ============================================================================

    if (!user) {
      throw new Error("Student not found.");
    }

    // ============================================================================
// Profile Not Created Yet
// ============================================================================

    if (!profile) {
      throw new Error("Student profile not found.");
    }

    // ============================================================================
// DTO Response
// ============================================================================

    return dashboardDTO({
      user,
      profile,
      currentOutpass,
      statistics,
      recentActivities,
      notifications,
      announcements,

      unreadNotificationCount: unreadCount,

      recentOutpasses,
    });
  }
}

module.exports = new DashboardService();
