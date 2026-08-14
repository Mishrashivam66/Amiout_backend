

const dashboardDTO = ({
  user,
  profile,
  currentOutpass = null,
  statistics = {},
  recentActivities = [],
  notifications = [],
  announcements = [],
}) => {
  return {
    student: {
      id: user._id,

      name: user.name,

      enrollmentNo: user.enrollmentNo,

      email: user.email,

      mobileNumber: user.mobileNumber,

      course: user.course,

      branch: user.branch,

      semester: user.semester,

      section: user.section,
    },

    profile: {
      completed: profile.profileCompleted,

      locked: profile.profileLocked,

      accountStatus: profile.accountStatus,

      holdReason: profile.holdReason,
    },

    statistics: {
      totalRequests: statistics.totalRequests || 0,

      pendingRequests: statistics.pendingRequests || 0,

      approvedRequests: statistics.approvedRequests || 0,

      rejectedRequests: statistics.rejectedRequests || 0,

      cancelledRequests: statistics.cancelledRequests || 0,
    },

    currentOutpass,

    recentActivities,

    notifications,

    announcements,

    generatedAt: new Date(),
  };
};

module.exports = dashboardDTO;
