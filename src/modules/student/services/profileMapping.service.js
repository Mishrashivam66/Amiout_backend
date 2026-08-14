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

  let section = "";

  if (group.startsWith("A")) {
    section = "A";
  } else if (group.startsWith("B")) {
    section = "B";
  } else if (group.startsWith("C")) {
    section = "C";
  } else {
    throw new Error("Invalid student group.");
  }

  // ============================================================
  // Find Mentor Mapping
  // ============================================================
 
  const mentorMaster = await MentorMaster.findOne({
    semester: student.semester,
    group,
    isActive: true,
    isDeleted: false,
  });



  if (!mentorMaster) {
    throw new Error(
      `No mentor mapping found for Semester ${student.semester}, Section ${section}, Group ${group}.`,
    );
  }

  if (!mentorMaster.mentorUser) {
    throw new Error("Mentor has not registered yet.");
  }

  // ============================================================
  // Prevent Duplicate Mapping
  // ============================================================

  if (
    profile.mentor &&
    profile.mentor.toString() === mentorMaster.mentorUser._id.toString()
  ) {
    return {
      success: true,
      message: "Student is already mapped with this mentor.",
      data: profile,
    };
  }

  // ============================================================
  // Update Student Profile
  // ============================================================

  const updatedProfile = await profileRepository.updateProfile(userId, {
    mentor: mentorMaster.mentorUser._id,
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
