"use strict";

const StudentMaster = require("../../academic/models/StudentMaster");
const MentorMaster = require("../../academic/models/MentorMaster");
const Group = require("../../academic/models/Group");
const Outpass = require("../../outpass/models/Outpass");

const outpassRepository = require("../../outpass/repositories/outpassRepository");

// ============================================================
// AMIOUT ENTERPRISE - ADMIN DASHBOARD REPOSITORY
//
// All statistics are read from MongoDB.
//
// Monthly analytics:
// - Group by outpass creation month in IST
// - APPROVED includes approved passes that later EXITED
//   or RETURNED
// - PENDING / REJECTED reflect current statuses
//
// Recent activities:
// - Most recently updated actual outpass records
// - Not fabricated timeline events
// ============================================================

const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const normalizeStatus = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

class DashboardRepository {
  // ==========================================================
  // STUDENT STATISTICS
  // ==========================================================

  async getStudentStatistics() {
    const [total, registered, unregistered, active, inactive] =
      await Promise.all([
        StudentMaster.countDocuments({
          isDeleted: false,
        }),

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

  // ==========================================================
  // MENTOR MASTER STATISTICS
  // ==========================================================

  async getMentorStatistics() {
    const [total, active, inactive] = await Promise.all([
      MentorMaster.countDocuments({
        isDeleted: false,
      }),

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

  // ==========================================================
  // GROUP STATISTICS
  // ==========================================================

  async getGroupStatistics() {
    const [total, active] = await Promise.all([
      Group.countDocuments({
        isDeleted: false,
      }),

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

  // ==========================================================
  // OUTPASS STATISTICS
  //
  // Reuse the existing working Outpass repository.
  // ==========================================================

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

  // ==========================================================
  // MONTHLY OUTPASS ANALYTICS
  //
  // Last 12 calendar months including current IST month.
  //
  // Only actual MongoDB outpasses are counted.
  // Uses the outpass creation month.
  // ==========================================================

  async getMonthlyOutpassAnalytics() {
    const now = new Date();

    // Convert current instant to IST calendar components.
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);

    const currentYear = istNow.getUTCFullYear();
    const currentMonth = istNow.getUTCMonth();

    // Midnight IST, first day of the oldest month.
    const firstMonthStart = new Date(
      Date.UTC(currentYear, currentMonth - 11, 1) - IST_OFFSET_MS,
    );

    const records = await Outpass.aggregate([
      {
        $match: {
          isDeleted: false,
          createdAt: {
            $gte: firstMonthStart,
            $lte: now,
          },
        },
      },
      {
        $group: {
          _id: {
            month: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
                timezone: "Asia/Kolkata",
              },
            },
            status: "$status",
          },
          total: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          "_id.month": 1,
          "_id.status": 1,
        },
      },
    ]);

    if (!records.length) {
      return [];
    }

    // Build actual 12-month time axis.
    // Zero means MongoDB returned no matching records
    // for that month/status.
    const monthly = [];
    const monthMap = new Map();

    for (let index = 0; index < 12; index += 1) {
      const date = new Date(
        Date.UTC(currentYear, currentMonth - 11 + index, 1),
      );

      const year = date.getUTCFullYear();
      const monthNumber = date.getUTCMonth() + 1;

      const monthKey = [year, String(monthNumber).padStart(2, "0")].join("-");

      const entry = {
        month: `${MONTH_NAMES[monthNumber - 1]} ${year}`,
        period: monthKey,
        approved: 0,
        pending: 0,
        rejected: 0,
        exited: 0,
        returned: 0,
      };

      monthly.push(entry);
      monthMap.set(monthKey, entry);
    }

    for (const record of records) {
      const monthKey = record?._id?.month;
      const status = normalizeStatus(record?._id?.status);

      const count = Number(record.total) || 0;
      const entry = monthMap.get(monthKey);

      if (!entry || count <= 0) continue;

      switch (status) {
        case "PENDING":
          entry.pending += count;
          break;

        case "REJECTED":
          entry.rejected += count;
          break;

        case "APPROVED":
          entry.approved += count;
          break;

        case "EXITED":
          // The pass has already received approval.
          entry.approved += count;
          entry.exited += count;
          break;

        case "RETURNED":
          // A returned pass was previously approved.
          entry.approved += count;
          entry.returned += count;
          break;

        default:
          // Other statuses are not falsely classified.
          break;
      }
    }

    return monthly;
  }

  // ==========================================================
  // RECENT OUTPASS UPDATES
  //
  // Returns real recently updated outpass snapshots.
  // This is not a complete institutional audit feed.
  // ==========================================================

  async getRecentOutpassUpdates(limit = 8) {
    const safeLimit = Math.min(
      50,
      Math.max(1, Number.parseInt(limit, 10) || 8),
    );

    const outpasses = await Outpass.find({
      isDeleted: false,
    })
      .select(
        "_id outpassId studentName enrollmentNumber " +
          "status createdAt updatedAt",
      )
      .sort({
        updatedAt: -1,
        _id: -1,
      })
      .limit(safeLimit)
      .lean();

    return outpasses.map((outpass) => {
      const status = normalizeStatus(outpass.status);

      return {
        _id: outpass._id,
        outpassId: outpass.outpassId,

        studentName: outpass.studentName || null,

        enrollmentNumber: outpass.enrollmentNumber || null,

        action: `Outpass status: ${status || "UNKNOWN"}`,

        status: status || "UNKNOWN",

        createdAt: outpass.createdAt || null,

        updatedAt: outpass.updatedAt || outpass.createdAt || null,

        timestamp: outpass.updatedAt || outpass.createdAt || null,
      };
    });
  }
}

module.exports = Object.freeze(new DashboardRepository());
