"use strict";

const { runMentorMapping } = require("../services/mentorMappingJob.service");

const profileService = require("../services/profileService");
const profileDTO = require("../dtos/profile.dto");

const User = require("../../auth/models/User");
const StudentMaster = require("../../academic/models/StudentMaster");

// ============================================================
// HELPERS
// ============================================================

const clean = (value) => String(value ?? "").trim();

const normalize = (value) => clean(value).toUpperCase();

const getAuthId = (req) => req.user?._id || req.user?.id;

const getRefName = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    return value;
  }

  return value.name || value.code || null;
};

const formatMentor = (mentor) => {
  if (!mentor || typeof mentor !== "object" || !mentor._id) {
    return null;
  }

  return {
    name: mentor.mentorName || mentor.name || mentor.facultyName || null,

    email: mentor.mentorEmail || mentor.email || null,

    group: mentor.group || null,

    semester: mentor.semester || null,

    section: mentor.section || null,
  };
};

// ============================================================
// GET PROFILE
// GET /student/profile
// Source of truth: StudentMaster
// ============================================================

const getProfile = async (req, res, next) => {
  try {
    const studentId = getAuthId(req);

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: "Student authentication required.",
      });
    }

    // --------------------------------------------------------
    // 1. Authenticated student account
    // --------------------------------------------------------

    const user = await User.findById(studentId)
      .select(
        "name enrollmentNo enrollmentNumber email " + "mobileNumber isActive",
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student account not found.",
      });
    }

    const enrollmentNumber = normalize(
      user.enrollmentNo || user.enrollmentNumber,
    );

    if (!enrollmentNumber) {
      return res.status(400).json({
        success: false,
        message: "Enrollment number is missing from your account.",
      });
    }

    // --------------------------------------------------------
    // 2. Verified StudentMaster record
    // --------------------------------------------------------

    const studentMaster = await StudentMaster.findOne({
      enrollmentNumber,
      isRegistered: true,
      isActive: true,
      isDeleted: false,
    })
      .populate({
        path: "institute",
        select: "name code",
      })
      .populate({
        path: "program",
        select: "name code department",
      })
      .populate({
        path: "mentorGroup",
        select: "name code group",
      })
      .populate({
        path: "primaryMentor",
        select:
          "mentorName name facultyName mentorEmail email " +
          "group semester section",
      })
      .populate({
        path: "backupMentor",
        select:
          "mentorName name facultyName mentorEmail email " +
          "group semester section",
      })
      .lean();

    if (!studentMaster) {
      return res.status(404).json({
        success: false,
        message:
          "Your registered StudentMaster record was not found. Please contact administration.",
      });
    }

    // --------------------------------------------------------
    // 3. Format official student details
    // --------------------------------------------------------

    const result = {
      student: {
        name: studentMaster.name,

        enrollmentNumber: studentMaster.enrollmentNumber,

        rollNumber: studentMaster.rollNumber || null,

        email: studentMaster.email || null,

        mobileNumber: studentMaster.mobileNumber || null,
      },

      academic: {
        institute: {
          name: studentMaster.institute?.name || null,

          code: studentMaster.institute?.code || null,
        },

        program: {
          name: studentMaster.program?.name || null,

          code: studentMaster.program?.code || null,

          department: studentMaster.program?.department || null,
        },

        department: studentMaster.program?.department || null,

        batch: studentMaster.batch || null,

        semester: studentMaster.semester ?? null,

        section: studentMaster.section || null,

        group: studentMaster.group || null,

        mentorGroup: getRefName(studentMaster.mentorGroup),
      },

      mentors: {
        primary: formatMentor(studentMaster.primaryMentor),

        backup: formatMentor(studentMaster.backupMentor),
      },

      parent: {
        name: studentMaster.parentName || null,

        mobileNumber: studentMaster.parentMobileNumber || null,
      },

      profile: {
        source: "StudentMaster",
        readOnly: true,
      },
    };

    return res.status(200).json({
      success: true,
      message: "Student profile fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Student Profile Error:", error);

    next(error);
  }
};

// ============================================================
// LEGACY COMPLETE PROFILE
// Preserved for route compatibility.
// Student no longer needs to complete a profile.
// ============================================================

const completeProfile = async (req, res, next) => {
  try {
    return res.status(410).json({
      success: false,
      message:
        "Manual profile completion is no longer supported. Student details are managed through StudentMaster.",
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// UNLOCK PROFILE
// Legacy admin function preserved.
// ============================================================

const unlockProfile = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const result = await profileService.unlockProfile(
      studentId,
      getAuthId(req),
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// HOLD ACCOUNT
// ============================================================

const holdAccount = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { reason } = req.body;

    const result = await profileService.holdAccount(studentId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ACTIVATE ACCOUNT
// ============================================================

const activateAccount = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const result = await profileService.activateAccount(studentId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// MENTOR MAPPING
// Existing admin endpoint preserved.
// Do not run automatically on profile load.
// ============================================================

const mapStudentMentor = async (req, res, next) => {
  try {
    const data = await runMentorMapping(getAuthId(req));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Mentor Mapping Error:", error);

    next(error);
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  getProfile,
  completeProfile,
  unlockProfile,
  holdAccount,
  activateAccount,
  mapStudentMentor,
});
