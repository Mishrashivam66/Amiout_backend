"use strict";


const StudentMaster = require("../../academic/models/StudentMaster");
const MentorMaster = require("../../academic/models/MentorMaster");
const Group = require("../../academic/models/Group");
const Outpass = require("../../outpass/models/Outpass");

class DashboardRepository {
  // ============================================================================
// Get Student Statistics
// ============================================================================
  async getStudentStatistics() {
    const [total, registered, unregistered, active, inactive] =
      await Promise.all([
        StudentMaster.countDocuments({ isDeleted: false }),
        StudentMaster.countDocuments({
          isRegistered: true,
          isDeleted: false,
        }),
        StudentMaster.countDocuments({
          isRegistered: false,
          isDeleted: false,
        }),
        StudentMaster.countDocuments({
          isActive: true,
          isDeleted: false,
        }),
        StudentMaster.countDocuments({
          isActive: false,
          isDeleted: false,
        }),
      ]);

    return {
      total,
      registered,
      unregistered,
      active,
      inactive,
    };
  }

  // ============================================================================
// Get Mentor Statistics
// ============================================================================
  async getMentorStatistics() {
    const [total, active, inactive] = await Promise.all([
      MentorMaster.countDocuments({ isDeleted: false }),
      MentorMaster.countDocuments({
        isActive: true,
        isDeleted: false,
      }),
      MentorMaster.countDocuments({
        isActive: false,
        isDeleted: false,
      }),
    ]);

    return {
      total,
      active,
      inactive,
    };
  }

  // ============================================================================
// Get Group Statistics
// ============================================================================
  async getGroupStatistics() {
    const [total, active] = await Promise.all([
      Group.countDocuments({ isDeleted: false }),
      Group.countDocuments({
        isActive: true,
        isDeleted: false,
      }),
    ]);

    return {
      total,
      active,
    };
  }

  // ============================================================================
// Get Outpass Statistics
// ============================================================================
  async getOutpassStatistics() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const [
      today,
      pending,
      approvedToday,
      rejectedToday,
      insideCampus,
      outsideCampus,
    ] = await Promise.all([
      Outpass.countDocuments({
        createdAt: {
          $gte: start,
          $lte: end,
        },
      }),

      Outpass.countDocuments({
        status: "PENDING",
      }),

      Outpass.countDocuments({
        status: "APPROVED",
        updatedAt: {
          $gte: start,
          $lte: end,
        },
      }),

      Outpass.countDocuments({
        status: "REJECTED",
        updatedAt: {
          $gte: start,
          $lte: end,
        },
      }),

      Outpass.countDocuments({
        campusStatus: "INSIDE",
      }),

      Outpass.countDocuments({
        campusStatus: "OUTSIDE",
      }),
    ]);

    return {
      today,
      pending,
      approvedToday,
      rejectedToday,
      insideCampus,
      outsideCampus,
    };
  }
}

module.exports = Object.freeze(new DashboardRepository());
