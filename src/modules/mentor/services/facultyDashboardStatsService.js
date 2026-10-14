"use strict";

const Outpass = require("../../outpass/models/Outpass");

const { OUTPASS_STATUS } = require("../../outpass/constants/outpassStatus");

const { getStudentsForRole } = require("./facultyStudentsService");

// ============================================================
// IST DATE RANGE
// ============================================================

const getISTDayRange = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const dayKey = `${values.year}-${values.month}-${values.day}`;

  const start = new Date(`${dayKey}T00:00:00+05:30`);

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end, dayKey };
};

// ============================================================
// AUTHORIZED STUDENT SCOPE
// ============================================================

const getAuthorizedStudentScope = async (facultyId, role) => {
  const result = await getStudentsForRole(facultyId, role);

  if (!result?.success) {
    return {
      success: false,
      message: result?.message || "Unable to verify academic scope.",
    };
  }

  // An authorization/configuration failure must not
  // silently appear as an empty dashboard.
  if (result.message && result.total === 0) {
    return {
      success: false,
      message: result.message,
    };
  }

  const enrollmentNumbers = [
    ...new Set(
      (result.data || [])
        .map((student) =>
          String(student.enrollmentNumber || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];

  return {
    success: true,
    totalStudents: result.total,
    enrollmentNumbers,
  };
};

// ============================================================
// ROLE-SCOPED DASHBOARD STATISTICS
// ============================================================

const getFacultyDashboardStats = async (facultyId, requestedRole) => {
  const role = String(requestedRole || "")
    .trim()
    .toUpperCase();

  if (!["MENTOR", "COORDINATOR"].includes(role)) {
    return {
      success: false,
      message: "Unsupported dashboard role.",
    };
  }

  // Faculty role, active assignment, and academic
  // scope are checked by getStudentsForRole().
  const scope = await getAuthorizedStudentScope(facultyId, role);

  if (!scope.success) {
    return scope;
  }

  const emptyDashboard = {
    totalStudents: scope.totalStudents,
    pendingOutpasses: 0,
    approvedToday: 0,
    rejectedToday: 0,
    approvedTotal: 0,
    rejectedTotal: 0,
    recentRequests: [],
    recentActivities: [],
  };

  if (scope.enrollmentNumbers.length === 0) {
    return {
      success: true,
      role,
      data: emptyDashboard,
    };
  }

  const { start, end, dayKey } = getISTDayRange();

  // Only outpasses belonging to students in
  // this faculty member's verified academic scope.
  const baseFilter = {
    enrollmentNumber: {
      $in: scope.enrollmentNumbers,
    },
    isDeleted: false,
  };

  /*
   * Mentor dashboard continues to represent
   * requests actually assigned to that Mentor.
   *
   * Coordinator dashboard monitors the authorized
   * section groups, including requests whose current
   * approving faculty is another Mentor.
   *
   * This is read-only reporting. Approval actions
   * still need independent backend authorization.
   */
  if (role === "MENTOR") {
    baseFilter.mentor = facultyId;
  }

  const approvedHistoryStatuses = [
    OUTPASS_STATUS.APPROVED,
    OUTPASS_STATUS.EXITED,
    OUTPASS_STATUS.RETURNED,
    OUTPASS_STATUS.COMPLETED,
  ].filter(Boolean);

  const [
    pendingOutpasses,
    approvedToday,
    rejectedToday,
    approvedTotal,
    rejectedTotal,
    recentRequests,
  ] = await Promise.all([
    Outpass.countDocuments({
      ...baseFilter,
      status: OUTPASS_STATUS.PENDING,
    }),

    // Decision timestamp, not requested travel date.
    Outpass.countDocuments({
      ...baseFilter,
      approvedAt: {
        $gte: start,
        $lt: end,
      },
    }),

    Outpass.countDocuments({
      ...baseFilter,
      rejectedAt: {
        $gte: start,
        $lt: end,
      },
    }),

    // Count approved journeys even if later EXITED
    // or RETURNED. approvedAt records the decision.
    Outpass.countDocuments({
      ...baseFilter,
      $or: [
        {
          approvedAt: {
            $ne: null,
            $exists: true,
          },
        },
        {
          status: {
            $in: approvedHistoryStatuses,
          },
        },
      ],
    }),

    Outpass.countDocuments({
      ...baseFilter,
      status: OUTPASS_STATUS.REJECTED,
    }),

    Outpass.find(baseFilter)
      .select(
        "_id outpassId studentName " +
          "enrollmentNumber destination status " +
          "createdAt approvedAt rejectedAt",
      )
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .lean(),
  ]);

  return {
    success: true,
    role,
    data: {
      totalStudents: scope.totalStudents,
      pendingOutpasses,
      approvedToday,
      rejectedToday,
      approvedTotal,
      rejectedTotal,
      recentRequests,

      // Preserve the expected response field.
      // We can adapt actual RecentActivity component
      // after confirming its required DTO.
      recentActivities: [],

      dayKeyIST: dayKey,
      generatedAt: new Date().toISOString(),
    },
  };
};

module.exports = {
  getFacultyDashboardStats,
};
