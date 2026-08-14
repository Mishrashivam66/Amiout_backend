"use strict";


const Outpass = require("../../../outpass/models/Outpass");

const { OUTPASS_STATUS } = require("../../../outpass/constants/outpassStatus");

class SecurityReportRepository {
  // ============================================================================
// Security Report Summary
// ============================================================================
  async getSummary() {
    const [
      totalOutpasses,
      exitVerified,
      exitPending,
      entryVerified,
      entryPending,
    ] = await Promise.all([
      Outpass.countDocuments({
        isDeleted: false,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        exitVerified: true,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        exitVerified: false,
        status: {
          $in: [OUTPASS_STATUS.APPROVED, OUTPASS_STATUS.EXITED],
        },
      }),

      Outpass.countDocuments({
        isDeleted: false,
        entryVerified: true,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        entryVerified: false,
        status: OUTPASS_STATUS.EXITED,
      }),
    ]);

    return {
      totalOutpasses,
      exitVerified,
      exitPending,
      entryVerified,
      entryPending,
    };
  }

  // ============================================================================
// Exit Verification Report
// ============================================================================
  async getExitVerificationReport() {
    return Outpass.find({
      isDeleted: false,
      exitVerified: true,
    })
      .populate("student", "name enrollmentNo")
      .populate("mentor", "name")
      .populate("exitVerifiedBy", "name")
      .sort({
        exitVerifiedAt: -1,
      });
  }

  // ============================================================================
// Entry Verification Report
// ============================================================================
  async getEntryVerificationReport() {
    return Outpass.find({
      isDeleted: false,
      entryVerified: true,
    })
      .populate("student", "name enrollmentNo")
      .populate("mentor", "name")
      .populate("entryVerifiedBy", "name")
      .sort({
        entryVerifiedAt: -1,
      });
  }

  // ============================================================================
// Pending Security Verification
// ============================================================================
  async getPendingVerificationReport() {
    return Outpass.find({
      isDeleted: false,
      $or: [
        {
          status: OUTPASS_STATUS.APPROVED,
          exitVerified: false,
        },
        {
          status: OUTPASS_STATUS.EXITED,
          entryVerified: false,
        },
      ],
    })
      .populate("student", "name enrollmentNo")
      .populate("mentor", "name")
      .sort({
        createdAt: -1,
      });
  }

  // ============================================================================
// Monthly Security Report
// ============================================================================
  async getMonthlyReport(year = new Date().getFullYear()) {
    return Outpass.aggregate([
      {
        $match: {
          isDeleted: false,
          createdAt: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: {
            month: {
              $month: "$createdAt",
            },
          },

          exitVerified: {
            $sum: {
              $cond: ["$exitVerified", 1, 0],
            },
          },

          entryVerified: {
            $sum: {
              $cond: ["$entryVerified", 1, 0],
            },
          },

          totalOutpasses: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,

          month: "$_id.month",

          totalOutpasses: 1,

          exitVerified: 1,

          entryVerified: 1,
        },
      },
      {
        $sort: {
          month: 1,
        },
      },
    ]);
  }

  // ============================================================================
// Detailed Security Report
// ============================================================================
  async getDetailedReport(filters = {}) {
    return Outpass.find({
      isDeleted: false,
      ...filters,
    })
      .populate("student", "name enrollmentNo email")
      .populate("mentor", "name email")
      .populate("exitVerifiedBy", "name")
      .populate("entryVerifiedBy", "name")
      .sort({
        createdAt: -1,
      });
  }
}

module.exports = Object.freeze(new SecurityReportRepository());
