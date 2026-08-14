"use strict";

const {
  findMentorById,
  updateMentor,
} = require("../repositories/mentor.repository");

// ==========================================
// GET MENTOR PROFILE
// ==========================================

const getMentorProfileService = async (mentorId) => {
  const mentor = await findMentorById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  return {
    success: true,
    user: {
      id: mentor._id,
      name: mentor.name,
      email: mentor.email,
      employeeId: mentor.employeeId,
      phone: mentor.phone,
      department: mentor.department,
      profilePhoto: mentor.profilePhoto,
      role: mentor.role,
      isVerified: mentor.isVerified,
      isActive: mentor.isActive,
      lastLogin: mentor.lastLogin,
      createdAt: mentor.createdAt,
    },
  };
};

// ==========================================
// UPDATE MENTOR PROFILE
// ==========================================

const updateMentorProfileService = async (mentorId, payload) => {
  const mentor = await findMentorById(mentorId);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  const updatedMentor = await updateMentor(mentorId, {
    phone: payload.phone ?? mentor.phone,
    department: payload.department ?? mentor.department,
    profilePhoto: payload.profilePhoto ?? mentor.profilePhoto,
  });

  return {
    success: true,
    message: "Profile updated successfully.",
    user: {
      id: updatedMentor._id,
      name: updatedMentor.name,
      email: updatedMentor.email,
      employeeId: updatedMentor.employeeId,
      phone: updatedMentor.phone,
      department: updatedMentor.department,
      profilePhoto: updatedMentor.profilePhoto,
      role: updatedMentor.role,
    },
  };
};

module.exports = {
  getMentorProfileService,
  updateMentorProfileService,
};
