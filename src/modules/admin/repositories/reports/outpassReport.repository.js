"use strict";


const Outpass = require("../../../outpass/models/Outpass");

const { OUTPASS_STATUS } = require("../../../outpass/constants/outpassStatus");

class OutpassReportRepository {
  // ============================================================================
// Get Overall Outpass Summary
// ============================================================================
  async getSummary() {
    const [
      totalOutpasses,
      pendingOutpasses,
      approvedOutpasses,
      rejectedOutpasses,
      cancelledOutpasses,
      exitedOutpasses,
      returnedOutpasses,
      completedOutpasses,
    ] = await Promise.all([
      Outpass.countDocuments({
        isDeleted: false,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.PENDING,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.APPROVED,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.REJECTED,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.CANCELLED,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.EXITED,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.RETURNED,
      }),

      Outpass.countDocuments({
        isDeleted: false,
        status: OUTPASS_STATUS.COMPLETED,
      }),
    ]);

    return {
      totalOutpasses,
      pendingOutpasses,
      approvedOutpasses,
      rejectedOutpasses,
      cancelledOutpasses,
      exitedOutpasses,
      returnedOutpasses,
      completedOutpasses,
    };
  }

  // ============================================================================
// Status Wise Report
// ============================================================================
  async getStatusReport() {
    const report = await Outpass.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$status",
          total: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          total: 1,
        },
      },
      {
        $sort: {
          status: 1,
        },
      },
    ]);

    return report;
  }

  // ============================================================================
// Date Range Report
// ============================================================================
  async getDateRangeReport(startDate, endDate) {
    const filter = {
      isDeleted: false,
    };

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    return Outpass.find(filter)
      .populate("student", "name email enrollmentNo")
      .populate("mentor", "name email")
      .populate("approvedBy", "name")
      .populate("rejectedBy", "name")
      .sort({
        createdAt: -1,
      });
  }

  // ============================================================================
// Student Wise Report
// ============================================================================
  async getStudentWiseReport() {
    return Outpass.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$student",

          totalOutpasses: {
            $sum: 1,
          },

          pending: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.PENDING],
                },
                1,
                0,
              ],
            },
          },

          approved: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.APPROVED],
                },
                1,
                0,
              ],
            },
          },

          rejected: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.REJECTED],
                },
                1,
                0,
              ],
            },
          },

          completed: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.COMPLETED],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: {
          path: "$student",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,

          studentId: "$student._id",

          studentName: "$student.name",

          email: "$student.email",

          enrollmentNo: "$student.enrollmentNo",

          totalOutpasses: 1,

          pending: 1,

          approved: 1,

          rejected: 1,

          completed: 1,
        },
      },
      {
        $sort: {
          totalOutpasses: -1,
        },
      },
    ]);
  }

  // ============================================================================
// Mentor Wise Report
// ============================================================================
  async getMentorWiseReport() {
    return Outpass.aggregate([
      {
        $match: {
          isDeleted: false,
          mentor: {
            $ne: null,
          },
        },
      },
      {
        $group: {
          _id: "$mentor",

          totalOutpasses: {
            $sum: 1,
          },

          approved: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.APPROVED],
                },
                1,
                0,
              ],
            },
          },

          rejected: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.REJECTED],
                },
                1,
                0,
              ],
            },
          },

          pending: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.PENDING],
                },
                1,
                0,
              ],
            },
          },

          completed: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.COMPLETED],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "mentor",
        },
      },
      {
        $unwind: {
          path: "$mentor",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,

          mentorId: "$mentor._id",

          mentorName: "$mentor.name",

          mentorEmail: "$mentor.email",

          totalOutpasses: 1,

          approved: 1,

          rejected: 1,

          pending: 1,

          completed: 1,
        },
      },
      {
        $sort: {
          totalOutpasses: -1,
        },
      },
    ]);
  }

  // ============================================================================
// Security Verification Report
// ============================================================================
  async getSecurityReport() {
    const [exitVerified, exitPending, entryVerified, entryPending] =
      await Promise.all([
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
      exitVerified,
      exitPending,
      entryVerified,
      entryPending,
    };
  }

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

          totalOutpasses: {
            $sum: 1,
          },

          approved: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.APPROVED],
                },
                1,
                0,
              ],
            },
          },

          rejected: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.REJECTED],
                },
                1,
                0,
              ],
            },
          },

          completed: {
            $sum: {
              $cond: [
                {
                  $eq: ["$status", OUTPASS_STATUS.COMPLETED],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,

          month: "$_id.month",

          totalOutpasses: 1,

          approved: 1,

          rejected: 1,

          completed: 1,
        },
      },
      {
        $sort: {
          month: 1,
        },
      },
    ]);
  }

  async getDetailedReport(filters = {}) {
    return Outpass.find({
      isDeleted: false,
      ...filters,
    })
      .populate(
        "student",
        "name email enrollmentNo mobileNumber branch semester",
      )
      .populate("mentor", "name email")
      .populate("approvedBy", "name")
      .populate("rejectedBy", "name")
      .populate("exitVerifiedBy", "name")
      .populate("entryVerifiedBy", "name")
      .sort({
        createdAt: -1,
      });
  }
}

module.exports = new OutpassReportRepository();
