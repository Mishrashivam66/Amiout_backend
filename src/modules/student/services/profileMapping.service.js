const profileRepository = require("../repositories/profileRepository");
const authRepository = require("../../auth/repositories/auth.repository");
const MentorMaster = require("../../academic/models/MentorMaster");

const { PROFILE_STATUS } = require("../constants/studentConstants");

// ============================================================================
// Map Student With Mentor
// ============================================================================
const mapMentor = async (userId) => {
  // ============================================================
  // Student Profile
  // ============================================================

  const profile = await profileRepository.findByUserId(userId);

  if (!profile) {
    throw new Error("Profile not found.");
  }

  // ============================================================
  // Student Auth Details
  // ============================================================

  const student = await authRepository.findUserById(userId);

  if (!student) {
    throw new Error("Student not found.");
  }

  // ============================================================
  // Validate Group
  // ============================================================

  if (!profile.group) {
    throw new Error("Student group not found.");
  }

  const group = profile.group.trim().toUpperCase();

  // ============================================================
  // Auto Detect Section From Group
  // ============================================================

  // ============================================================
  // Find Mentor Mapping
  // ============================================================
  const mentorMaster = await MentorMaster.findOne({
    mentorEmail: profile.mentorEmail.toLowerCase(),
    semester: student.semester,
    group,
    isActive: true,
    isDeleted: false,
  });

  if (!mentorMaster) {
    throw new Error(
      "Invalid mentor email or mentor is not assigned to your group.",
    );
  }
  // Mentor login nahi hua hai
  if (!mentorMaster.mentorUser) {
    const updatedProfile = await profileRepository.updateProfile(userId, {
      profileCompleted: true,
      profileLocked: false,
      profileStatus: PROFILE_STATUS.COMPLETED,
      lastProfileUpdatedAt: new Date(),
    });

    return {
      success: true,
      message: "Profile saved. Mentor account is not active yet.",
      data: updatedProfile,
    };
  }

  // Already mapped
  if (
    profile.mentor &&
    profile.mentor.toString() === mentorMaster.mentorUser.toString()
  ) {
    return {
      success: true,
      message: "Student is already mapped with this mentor.",
      data: profile,
    };
  }

  // Mentor available → map student
  const updatedProfile = await profileRepository.updateProfile(userId, {
    mentor: mentorMaster.mentorUser,
    profileCompleted: true,
    profileLocked: true,
    profileStatus: PROFILE_STATUS.LOCKED,
    lastProfileUpdatedAt: new Date(),
  });

  return {
    success: true,
    message: "Mentor mapped successfully.",
    data: updatedProfile,
  };
};

module.exports = Object.freeze({
  mapMentor,
});
