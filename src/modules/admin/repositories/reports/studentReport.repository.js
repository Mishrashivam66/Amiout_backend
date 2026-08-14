"use strict";
const StudentMaster = require("../../../academic/models/StudentMaster");

class StudentReportRepository {
  // ============================================================================
// Get Student Report Summary
// ============================================================================
  async getSummary() {
    const [
      totalStudents,
      activeStudents,
      inactiveStudents,
      registeredStudents,
      unregisteredStudents,
      mappedStudents,
      unmappedStudents,
    ] = await Promise.all([
      StudentMaster.countDocuments({ isDeleted: false }),

      StudentMaster.countDocuments({
        isDeleted: false,
        isActive: true,
      }),

      StudentMaster.countDocuments({
        isDeleted: false,
        isActive: false,
      }),

      StudentMaster.countDocuments({
        isDeleted: false,
        isRegistered: true,
      }),

      StudentMaster.countDocuments({
        isDeleted: false,
        isRegistered: false,
      }),

      StudentMaster.countDocuments({
        isDeleted: false,
        mentorGroup: {
          $ne: null,
        },
      }),

      StudentMaster.countDocuments({
        isDeleted: false,
        mentorGroup: null,
      }),
    ]);

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      registeredStudents,
      unregisteredStudents,
      mappedStudents,
      unmappedStudents,
    };
  }

  // ============================================================================
// Institute Wise Report
// ============================================================================
  async getInstituteWiseReport() {
    return StudentMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$institute",
          totalStudents: {
            $sum: 1,
          },
          activeStudents: {
            $sum: {
              $cond: ["$isActive", 1, 0],
            },
          },
          registeredStudents: {
            $sum: {
              $cond: ["$isRegistered", 1, 0],
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
          totalStudents: 1,
          activeStudents: 1,
          registeredStudents: 1,
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
    return StudentMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$program",
          totalStudents: {
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
          totalStudents: 1,
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
    return StudentMaster.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$semester",
          totalStudents: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          semester: "$_id",
          totalStudents: 1,
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
// Detailed Student Report
// ============================================================================
  async getDetailedReport(filters = {}) {
    return StudentMaster.find({
      isDeleted: false,
      ...filters,
    })
      .populate("institute", "name")
      .populate("program", "name")
      .populate("mentorGroup", "groupName")
      .populate("primaryMentor", "name employeeId")
      .populate("backupMentor", "name employeeId")
      .sort({
        createdAt: -1,
      });
  }
}

module.exports = Object.freeze(new StudentReportRepository());
