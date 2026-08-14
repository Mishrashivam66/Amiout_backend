const { findUserById, updateUser } = require("../repositories/auth.repository");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// GET MY PROFILE
// ==========================================

const getProfileService = async (userId) => {
  const user = await findUserById(userId);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  return {
    success: true,

    user: {
      id: user._id,

      name: user.name,

      email: user.email,

      enrollmentNo: user.enrollmentNo,

      mobileNumber: user.mobileNumber,

      profilePhoto: user.profilePhoto,

      gender: user.gender,

      dateOfBirth: user.dateOfBirth,

      course: user.course,

      branch: user.branch,

      semester: user.semester,

      section: user.section,

      role: user.role,

      isVerified: user.isVerified,

      isActive: user.isActive,

      lastLogin: user.lastLogin,

      createdAt: user.createdAt,
    },
  };
};

// ==========================================
// UPDATE PROFILE
// ==========================================

const updateProfileService = async (userId, payload) => {
  const user = await findUserById(userId);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  const updatedUser = await updateUser(userId, {
    name: payload.name ?? user.name,

    mobileNumber: payload.mobileNumber ?? user.mobileNumber,

    gender: payload.gender ?? user.gender,

    dateOfBirth: payload.dateOfBirth ?? user.dateOfBirth,

    course: payload.course ?? user.course,

    branch: payload.branch ?? user.branch,

    semester: payload.semester ?? user.semester,

    section: payload.section ?? user.section,

    profilePhoto: payload.profilePhoto ?? user.profilePhoto,
  });

  return {
    success: true,

    message: "Profile updated successfully.",

    user: {
      id: updatedUser._id,

      name: updatedUser.name,

      email: updatedUser.email,

      enrollmentNo: updatedUser.enrollmentNo,

      mobileNumber: updatedUser.mobileNumber,

      profilePhoto: updatedUser.profilePhoto,

      gender: updatedUser.gender,

      dateOfBirth: updatedUser.dateOfBirth,

      course: updatedUser.course,

      branch: updatedUser.branch,

      semester: updatedUser.semester,

      section: updatedUser.section,
    },
  };
};

module.exports = {
  getProfileService,

  updateProfileService,
};
