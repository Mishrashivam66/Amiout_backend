"use strict";

const StudentMaster = require("../../academic/models/StudentMaster");
const MentorMaster = require("../../academic/models/MentorMaster");
const Group = require("../../academic/models/Group");
const outpassRepository = require("../../outpass/repositories/outpassRepository");

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
  // ============================================================================
  // Get Outpass Statistics
  // ============================================================================
  async getOutpassStatistics() {
    const [total, approved, pending, rejected, exited, returned] =
      await Promise.all([
        outpassRepository.countAllOutpasses(),
        outpassRepository.countApproved(),
        outpassRepository.countPending(),
        outpassRepository.countRejected(),
        outpassRepository.countExited(),
        outpassRepository.countReturned(),
      ]);

    return {
      total,
      approved,
      pending,
      rejected,
      exited,
      returned,
    };
  }
}

module.exports = Object.freeze(new DashboardRepository());
