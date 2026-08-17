const profileDTO = (user, profile) => {
  if (!user || !profile) {
    return null;
  }

  return {
    student: {
      id: user._id,
      name: user.name,
      enrollmentNumber: user.enrollmentNo,
      email: user.email,
      mobileNumber: user.mobileNumber,
      course: user.course,
      branch: user.branch,
      semester: user.semester,
    },

    academic: {
      section: profile.section,
      group: profile.group,
      mentorEmail: profile.mentorEmail,
    },

    mentor: profile.mentor
      ? {
          id: profile.mentor._id,
          name: profile.mentor.name,
          email: profile.mentor.email,
        }
      : null,

    parent: {
      name: profile.parentName,

      email: profile.parentEmail,

      mobileNumber: profile.parentMobileNumber,
    },

    profile: {
      completed: profile.profileCompleted,
      locked: profile.profileLocked,
      status: profile.profileStatus,
      accountStatus: profile.accountStatus,
      holdReason: profile.holdReason,
    },

    timestamps: {
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      lastProfileUpdatedAt: profile.lastProfileUpdatedAt,
      profileUnlockedAt: profile.profileUnlockedAt,
    },
  };
};

module.exports = profileDTO;
