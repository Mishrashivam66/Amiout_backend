"use strict";

const MentorMaster = require("../../../academic/models/MentorMaster");

class MentorReportRepository {
  // ============================================================================
// Get Mentor Report Summary
// ============================================================================
  async getSummary() {
    const [totalMentors, activeMentors, inactiveMentors] = await Promise.all([
      MentorMaster.countDocuments({
        isDeleted: false,
      }),

      MentorMaster.countDocuments({
        isDeleted: false,
        isActive: true,
      }),

      MentorMaster.countDocuments({
        isDeleted: false,
        isActive: false,
      }),
    ]);

    return {
      totalMentors,
      activeMentors,
      inactiveMentors,
    };
  }

  // ============================================================================
// Institute Wise Report
// ============================================================================
  async getInstituteWiseReport() {
    return MentorMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$institute",
          totalMentors: {
            $sum: 1,
          },
          activeMentors: {
            $sum: {
              $cond: ["$isActive", 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: "institutes",
          localField: "_id",
          foreignField: "_id",
          as: "institute",
        },
      },
      {
        $unwind: {
          path: "$institute",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          instituteId: "$institute._id",
          instituteName: "$institute.name",
          totalMentors: 1,
          activeMentors: 1,
        },
      },
      {
        $sort: {
          instituteName: 1,
        },
      },
    ]);
  }

  // ============================================================================
// Program Wise Report
// ============================================================================
  async getProgramWiseReport() {
    return MentorMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$program",
          totalMentors: {
            $sum: 1,
          },
        },
      },
      {
        $lookup: {
          from: "programs",
          localField: "_id",
          foreignField: "_id",
          as: "program",
        },
      },
      {
        $unwind: {
          path: "$program",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          programId: "$program._id",
          programName: "$program.name",
          totalMentors: 1,
        },
      },
      {
        $sort: {
          programName: 1,
        },
      },
    ]);
  }

  // ============================================================================
// Semester Wise Report
// ============================================================================
  async getSemesterWiseReport() {
    return MentorMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$semester",
          totalMentors: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          semester: "$_id",
          totalMentors: 1,
        },
      },
      {
        $sort: {
          semester: 1,
        },
      },
    ]);
  }

  // ============================================================================
// Detailed Mentor Report
// ============================================================================
  async getDetailedReport(filters = {}) {
    return MentorMaster.find({
      isDeleted: false,
      ...filters,
    })
      .populate("institute", "name")
      .populate("program", "name")
      .sort({
        createdAt: -1,
      });
  }
}

module.exports = Object.freeze(new MentorReportRepository());
