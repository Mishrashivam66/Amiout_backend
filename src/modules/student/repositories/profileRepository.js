
const StudentProfile = require("../models/StudentProfile");

const {
  ACCOUNT_STATUS,
  PROFILE_STATUS,
} = require("../constants/studentConstants");

// ============================================================================
// Create Student Profile
// ============================================================================
const createProfile = async (payload) => {
  const existingProfile = await StudentProfile.findOne({
    user: payload.user,
  });

  if (existingProfile) {
    return existingProfile;
  }

  return StudentProfile.create(payload);
};

// ============================================================================
// Find Profile By User Id
// ============================================================================
const findByUserId = async (userId) => {
  const profile = await StudentProfile.findOne({
    user: userId,
  });
  return profile;
};

// ============================================================================
// Find Profile By Profile Id
// ============================================================================
const findById = async (profileId) => {
  return StudentProfile.findById(profileId).populate("mentor", "name email");
};

// ============================================================================
// Update Profile
// ============================================================================
const updateProfile = async (userId, payload) => {
  return StudentProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        ...payload,
        lastProfileUpdatedAt: new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );
};

// ============================================================================
// Lock Profile
// ============================================================================
const lockProfile = async (userId) => {
  return StudentProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        profileCompleted: true,
        profileLocked: true,
        profileStatus: PROFILE_STATUS.LOCKED,
        lastProfileUpdatedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Unlock Profile
// ============================================================================
const unlockProfile = async (userId, mentorId) => {
  return StudentProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        profileLocked: false,
        profileStatus: PROFILE_STATUS.INCOMPLETE,
        profileUnlockedBy: mentorId,
        profileUnlockedAt: new Date(),
        lastProfileUpdatedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Hold Student Account
// ============================================================================
const holdAccount = async (userId, reason) => {
  return StudentProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        accountStatus: ACCOUNT_STATUS.HOLD,
        holdReason: reason,
        lastProfileUpdatedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Activate Student Account
// ============================================================================
const activateAccount = async (userId) => {
  return StudentProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        holdReason: "",
        lastProfileUpdatedAt: new Date(),
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Check Profile Exists
// ============================================================================
const exists = async (userId) => {
  return StudentProfile.exists({ user: userId });
};

// ============================================================================
// Delete Profile
// ============================================================================
const deleteProfile = async (userId) => {
  return StudentProfile.findOneAndDelete({
    user: userId,
  });
};

// ============================================================================
// Get Students By Mentor
// ============================================================================
const findStudentsByMentor = async (mentorId) => {


  const students = await StudentProfile.find({
    mentor: mentorId,
  }).populate("user", "name enrollmentNo email");
  return students;
};

const countStudentsByMentor = async (mentorId) => {
  return StudentProfile.countDocuments({
    mentor: mentorId,
  });
};
const findStudentDetails = async (mentorId, studentId) => {
  return StudentProfile.findOne({
    user: studentId,
    mentor: mentorId,
  })
    .populate(
      "user",
      "name email enrollmentNo mobileNumber course branch semester profilePhoto",
    )
    .populate("mentor", "name email");
};

module.exports = {
  createProfile,
  findByUserId,
  findById,
  updateProfile,
  lockProfile,
  unlockProfile,
  holdAccount,
  activateAccount,
  exists,
  deleteProfile,
  findStudentsByMentor,
  countStudentsByMentor,
  findStudentDetails,
};
