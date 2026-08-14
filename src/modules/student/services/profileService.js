const { validateProfile } = require("../validators/profileValidator");
const { mapMentor } = require("./profileMapping.service");
const profileRepository = require("../repositories/profileRepository");

const {
  ACCOUNT_STATUS,
  PROFILE_STATUS,
} = require("../constants/studentConstants");

const getProfile = async (userId) => {
  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  return {
    success: true,
    data: profile,
  };
};

// ============================================================================
// Complete Student Profile
// ============================================================================
const completeProfile = async (userId, payload) => {
  // ============================================================
  // Validate Input
  // ============================================================

  const validation = validateProfile(payload);

  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  // ============================================================
  // Check Profile Exists
  // ============================================================

  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  // ============================================================
  // Prevent Update If Locked
  // ============================================================

  if (profile.profileLocked) {
    return {
      success: false,
      message: "Profile is locked. Please contact your mentor.",
    };
  }

  // ============================================================
  // Already Completed
  // ============================================================

  if (profile.profileCompleted) {
    return {
      success: false,
      message: "Profile has already been completed.",
    };
  }

  // ============================================================
  // STEP 1 : Save Student Profile
  // ============================================================

  const updatedProfile = await profileRepository.updateProfile(userId, {
    section: payload.section.toUpperCase(),
    group: payload.group.toUpperCase(),

    parentName: payload.parentName.trim(),
    parentEmail: payload.parentEmail.trim().toLowerCase(),
    parentMobileNumber: payload.parentMobileNumber.toString().trim(),
  });

  // ============================================================
  // Success
  // ============================================================

  return {
    success: true,
    message: "Profile completed successfully.",
    data: updatedProfile,
  };
};

// ============================================================================
// Unlock Student Profile
// ============================================================================
const unlockProfile = async (userId, mentorId) => {
  /**
   * Check Profile Exists
   */
  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  /**
   * Already Unlocked
   */
  if (!profile.profileLocked) {
    return {
      success: false,
      message: "Profile is already unlocked.",
    };
  }

  if (!profile.mentor) {
    return {
      success: false,
      message: "No mentor assigned to this student.",
    };
  }

  const profileMentorId = profile.mentor._id
    ? profile.mentor._id.toString()
    : profile.mentor.toString();

  if (profileMentorId !== mentorId.toString()) {
    return {
      success: false,
      message: "You are not authorized to unlock this student's profile.",
    };
  }

  /**
   * Unlock Profile
   */
  const updatedProfile = await profileRepository.unlockProfile(
    userId,
    mentorId,
  );

  if (!updatedProfile) {
    return {
      success: false,
      message: "Unable to unlock profile.",
    };
  }

  return {
    success: true,
    message: "Profile unlocked successfully.",
    data: updatedProfile,
  };
};
// ============================================================================
// Hold Student Account
// ============================================================================
const holdAccount = async (userId, reason) => {
  /**
   * Validate Hold Reason
   */
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return {
      success: false,
      message: "Hold reason is required.",
    };
  }

  /**
   * Check Profile Exists
   */
  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  /**
   * Already On Hold
   */
  if (profile.accountStatus === ACCOUNT_STATUS.HOLD) {
    return {
      success: false,
      message: "Student account is already on hold.",
    };
  }

  /**
   * Hold Account
   */
  const updatedProfile = await profileRepository.holdAccount(
    userId,
    reason.trim(),
  );

  if (!updatedProfile) {
    return {
      success: false,
      message: "Unable to hold student account.",
    };
  }

  return {
    success: true,
    message: "Student account placed on hold successfully.",
    data: updatedProfile,
  };
};

// ============================================================================
// Activate Student Account
// ============================================================================
const activateAccount = async (userId) => {
  /**
   * Check Profile Exists
   */
  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    return {
      success: false,
      message: "Student profile not found.",
    };
  }

  /**
   * Already Active
   */
  if (profile.accountStatus === ACCOUNT_STATUS.ACTIVE) {
    return {
      success: false,
      message: "Student account is already active.",
    };
  }

  /**SF
   * Activate Account
   */
  const updatedProfile = await profileRepository.activateAccount(userId);

  if (!updatedProfile) {
    return {
      success: false,
      message: "Unable to activate student account.",
    };
  }

  return {
    success: true,
    message: "Student account activated successfully.",
    data: updatedProfile,
  };
};

// ============================================================================
// Export Service
// ============================================================================

module.exports = Object.freeze({
  getProfile,
  completeProfile,
  unlockProfile,
  holdAccount,
  activateAccount,
});
