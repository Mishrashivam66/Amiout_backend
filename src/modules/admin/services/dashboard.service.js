
const dashboardRepository = require("../repositories/dashboard.repository");

class DashboardService {
  // ============================================================================
// Get Dashboard Statistics
// ============================================================================
  async getDashboard() {
    const [students, mentors, groups, outpasses] = await Promise.all([
      dashboardRepository.getStudentStatistics(),
      dashboardRepository.getMentorStatistics(),
      dashboardRepository.getGroupStatistics(),
      dashboardRepository.getOutpassStatistics(),
    ]);

    return {
      students,
      mentors,
      groups,
      outpasses,
    };
  }
}

module.exports = Object.freeze(new DashboardService());
