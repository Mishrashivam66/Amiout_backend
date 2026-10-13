"use strict";

const StudentProfile = require("../models/StudentProfile");

const StudentMaster = require("../../academic/models/StudentMaster");

const MentorMaster = require("../../academic/models/MentorMaster");

const Mentor = require("../../auth/models/Mentor");

const authRepository = require("../../auth/repositories/auth.repository");

const {
  ACCOUNT_STATUS,
  PROFILE_STATUS,
} = require("../constants/studentConstants");

// ============================================================
// HELPERS
// ============================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const clean = (value) => String(value ?? "").trim();

const idOf = (value) => String(value?._id ?? value ?? "");

const fail = (message) => ({
  success: false,
  message,
});

const getEnrollmentNumber = (student) =>
  normalize(student?.enrollmentNo || student?.enrollmentNumber);

// ============================================================
// RESOLVE VERIFIED PRIMARY MENTOR ACCOUNT
// ============================================================

const resolvePrimaryMentor = async (studentMaster) => {
  if (!studentMaster.primaryMentor) {
    return null;
  }

  const mentorMaster = await MentorMaster.findOne({
    _id: studentMaster.primaryMentor,
    isActive: true,
    isDeleted: false,
    roles: "MENTOR",
  }).lean();

  if (!mentorMaster || !mentorMaster.mentorUser) {
    return null;
  }

  // Check that the mapped MentorMaster still belongs
  // to this student's academic group.
  const groupMatches =
    normalize(mentorMaster.section) === normalize(studentMaster.section) &&
    normalize(mentorMaster.group) === normalize(studentMaster.group) &&
    Number(mentorMaster.semester) === Number(studentMaster.semester);

  if (!groupMatches) {
    return null;
  }

  const mentor = await Mentor.findOne({
    _id: mentorMaster.mentorUser,
    isActive: true,
    isVerified: true,
    roles: "MENTOR",
  })
    .select("_id name email employeeId")
    .lean();

  if (!mentor) {
    return null;
  }

  if (
    clean(mentorMaster.mentorEmail).toLowerCase() !==
    clean(mentor.email).toLowerCase()
  ) {
    return null;
  }

  return {
    mentor,
    mentorMaster,
  };
};

// ============================================================
// SYNC STUDENT PROFILE FROM STUDENTMASTER
// ============================================================

const syncProfileFromMaster = async (userId) => {
  // ----------------------------------------------------------
  // 1. AUTH USER
  // ----------------------------------------------------------

  const student = await authRepository.findUserById(userId);

  if (!student) {
    return fail("Student account not found.");
  }

  const enrollmentNumber = getEnrollmentNumber(student);

  if (!enrollmentNumber) {
    return fail("Student enrollment number is missing.");
  }

  // ----------------------------------------------------------
  // 2. STUDENTMASTER
  // ----------------------------------------------------------

  const master = await StudentMaster.findOne({
    enrollmentNumber,
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!master) {
    return fail("StudentMaster record not found. Contact administration.");
  }

  if (master.isRegistered !== true) {
    return fail("StudentMaster registration is not activated.");
  }

  // ----------------------------------------------------------
  // 3. VALIDATE MASTER DETAILS
  // ----------------------------------------------------------

  const section = normalize(master.section);
  const group = normalize(master.group);
  const parentName = clean(master.parentName);
  const parentMobileNumber = clean(master.parentMobileNumber);

  if (
    !section ||
    !group ||
    !master.institute ||
    !master.program ||
    !master.mentorGroup
  ) {
    return fail(
      "Student academic details or mentor group mapping are incomplete.",
    );
  }

  if (!parentName) {
    return fail("Parent name is missing in StudentMaster.");
  }

  if (!/^[6-9]\d{9}$/.test(parentMobileNumber)) {
    return fail("Valid registered parent mobile number is missing.");
  }

  // ----------------------------------------------------------
  // 4. PRIMARY MENTOR ACCOUNT
  // ----------------------------------------------------------

  const mentorData = await resolvePrimaryMentor(master);

  if (!mentorData) {
    return fail("Primary Mentor account is not linked or verified yet.");
  }

  // ----------------------------------------------------------
  // 5. PRESERVE EXISTING ACCOUNT HOLD
  // ----------------------------------------------------------

  const existing = await StudentProfile.findOne({
    user: student._id,
  }).lean();

  const now = new Date();

  // Use an actual enum value from studentConstants.
  // Avoid saving an unknown status.
  const completedProfileStatus =
    PROFILE_STATUS.COMPLETED ??
    PROFILE_STATUS.COMPLETE ??
    PROFILE_STATUS.VERIFIED ??
    null;

  const syncFields = {
    mentor: mentorData.mentor._id,

    mentorEmail: mentorData.mentor.email.toLowerCase(),

    section,
    group,

    parentName,
    parentMobileNumber,

    // StudentMaster currently has no parentEmail.
    // Preserve any existing verified value rather
    // than inventing one.
    parentEmail: existing?.parentEmail || "",

    profileCompleted: true,
    profileLocked: true,

    lastProfileUpdatedAt: now,
  };

  if (completedProfileStatus) {
    syncFields.profileStatus = completedProfileStatus;
  } else {
    // No assumption about PROFILE_STATUS enum values.
    // Profile status remains at its existing/default
    // schema value until constants are confirmed.
    console.warn("PROFILE_STATUS completed enum not configured.");
  }

  // ----------------------------------------------------------
  // 6. ATOMIC PROFILE UPSERT
  // ----------------------------------------------------------

  // Never overwrite accountStatus/holdReason here.
  // Admin account HOLD must survive synchronization.
  const profile = await StudentProfile.findOneAndUpdate(
    {
      user: student._id,
    },
    {
      $set: syncFields,

      $setOnInsert: {
        user: student._id,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  return {
    success: true,
    message: "Student profile synchronized from StudentMaster.",
    data: profile,
  };
};

// ============================================================
// GET STUDENT PROFILE
// Automatically sync before returning it.
// ============================================================

const getProfile = async (userId) => {
  const syncResult = await syncProfileFromMaster(userId);

  if (!syncResult.success) {
    return syncResult;
  }

  // Only return the student's own profile.
  const profile = await StudentProfile.findOne({
    user: userId,
  })
    .populate("mentor", "name email employeeId designation availabilityStatus")
    .lean();

  return {
    success: true,
    message: "Student profile loaded successfully.",
    data: profile,
  };
};

// ============================================================
// COMPLETE PROFILE
// Backward-compatible endpoint name.
// No manual payload fields are accepted.
// ============================================================

const completeProfile = async (userId, _payload) => {
  // Ignore all client-submitted profile information.
  // StudentMaster is the trusted source.
  return syncProfileFromMaster(userId);
};

// ============================================================
// UNLOCK PROFILE
// Manual student profile editing is disabled.
// ============================================================

const unlockProfile = async (_userId, _mentorId) => {
  return fail(
    "Student profiles are managed through StudentMaster. Manual editing is disabled. Contact Admin to correct academic or parent details.",
  );
};

// ============================================================
// HOLD STUDENT ACCOUNT
// ============================================================

const holdAccount = async (userId, reason) => {
  if (typeof reason !== "string" || !reason.trim()) {
    return fail("Hold reason is required.");
  }

  const profile = await StudentProfile.findOne({
    user: userId,
  });

  if (!profile) {
    return fail("Student profile not found.");
  }

  if (profile.accountStatus === ACCOUNT_STATUS.HOLD) {
    return fail("Student account is already on hold.");
  }

  const updated = await StudentProfile.findOneAndUpdate(
    {
      user: userId,
      accountStatus: {
        $ne: ACCOUNT_STATUS.HOLD,
      },
    },
    {
      $set: {
        accountStatus: ACCOUNT_STATUS.HOLD,
        holdReason: reason.trim(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    return fail("Unable to hold student account.");
  }

  return {
    success: true,
    message: "Student account placed on hold successfully.",
    data: updated,
  };
};

// ============================================================
// ACTIVATE HELD STUDENT ACCOUNT
// ============================================================

const activateAccount = async (userId) => {
  const profile = await StudentProfile.findOne({
    user: userId,
  });

  if (!profile) {
    return fail("Student profile not found.");
  }

  if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
    return fail("Student account is already active.");
  }

  const updated = await StudentProfile.findOneAndUpdate(
    {
      user: userId,
      accountStatus: ACCOUNT_STATUS.HOLD,
    },
    {
      $set: {
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        holdReason: "",
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    return fail("Unable to activate student account.");
  }

  return {
    success: true,
    message: "Student account activated successfully.",
    data: updated,
  };
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  getProfile,
  completeProfile,
  syncProfileFromMaster,
  unlockProfile,
  holdAccount,
  activateAccount,
});
