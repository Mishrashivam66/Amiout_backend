"use strict";

const dashboardRepository = require("../repositories/dashboard.repository");

// ============================================================
// AMIOUT ENTERPRISE - ADMIN DASHBOARD SERVICE
//
// Data comes exclusively from database repositories.
// ============================================================

class DashboardService {
  // ==========================================================
  // OVERVIEW COUNTS
  // ==========================================================

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

  // ==========================================================
  // MONTHLY ANALYTICS
  // ==========================================================

  async getAnalytics() {
    const monthly = await dashboardRepository.getMonthlyOutpassAnalytics();

    return {
      monthly,

      period: "LAST_12_MONTHS",

      timezone: "Asia/Kolkata",

      grouping: "OUTPASS_CREATION_MONTH",

      description:
        "Outpasses grouped by submission month and current status. Approved totals include passes that have subsequently exited or returned.",

      generatedAt: new Date(),
    };
  }

  // ==========================================================
  // RECENT ACTIVITIES
  // ==========================================================

  async getRecentActivities(limit = 8) {
    const activities = await dashboardRepository.getRecentOutpassUpdates(limit);

    return {
      activities,
      count: activities.length,

      source: "RECENT_OUTPASS_UPDATES",

      generatedAt: new Date(),
    };
  }

  // ==========================================================
  // DASHBOARD SUMMARY
  //
  // Keep the same confirmed stats structure
  // so no extra fabricated metrics are introduced.
  // ==========================================================

  async getSummary() {
    const dashboard = await this.getDashboard();

    return {
      ...dashboard,
      generatedAt: new Date(),
    };
  }
}

module.exports = Object.freeze(new DashboardService());
