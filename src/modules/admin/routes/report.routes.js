"use strict";

const express = require("express");

const reportController = require("../controllers/report.controller");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const router = express.Router();

// ============================================================================
// Student Reports
// ============================================================================

router.get(
  "/students/summary",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getStudentSummary,
);

router.get(
  "/students",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getStudentDetailedReport,
);

// ============================================================================
// Mentor Reports
// ============================================================================

router.get(
  "/mentors/summary",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getMentorSummary,
);

router.get(
  "/mentors",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getMentorDetailedReport,
);

// ============================================================================
// Outpass Reports
// ============================================================================

router.get(
  "/outpasses/summary",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassSummary,
);

router.get(
  "/outpasses/status",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassStatusReport,
);

router.get(
  "/outpasses/date-range",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassDateRangeReport,
);

router.get(
  "/outpasses/student-wise",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassStudentReport,
);

router.get(
  "/outpasses/mentor-wise",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassMentorReport,
);

router.get(
  "/outpasses/monthly",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassMonthlyReport,
);

router.get(
  "/outpasses",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getOutpassDetailedReport,
);

// ============================================================================
// Security Reports
// ============================================================================

router.get(
  "/security/summary",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getSecuritySummary,
);

router.get(
  "/security/exit",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getExitVerificationReport,
);

router.get(
  "/security/entry",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getEntryVerificationReport,
);

router.get(
  "/security/pending",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getPendingVerificationReport,
);

router.get(
  "/security/monthly",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getSecurityMonthlyReport,
);

router.get(
  "/security",
  protect,
  authorize(ROLES.ADMIN),
  reportController.getSecurityDetailedReport,
);

module.exports = Object.freeze(router);
