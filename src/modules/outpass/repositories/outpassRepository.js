const Outpass = require("../models/Outpass");

const { OUTPASS_STATUS } = require("../constants/outpassStatus");
const { ACTIVE_OUTPASS_STATUS } = require("../constants/outpassStatus");
// ============================================================================
// Create Outpass
// ============================================================================
const createOutpass = async (payload) => {
  return Outpass.create(payload);
};

// ============================================================================
// Find By Mongo ID
// ============================================================================
const findById = async (id) => {
  const data = await Outpass.findById(id)
    .populate("student", "name enrollmentNumber email")
    .populate("mentor", "name email");

  return data;
};

// ============================================================================
// Find By Outpass ID
// ============================================================================
const findByOutpassId = async (outpassId) => {
  return Outpass.findOne({
    outpassId,
    isDeleted: false,
  })
    .populate("student")
    .populate("mentor", "name email");
};

// ============================================================================
// Find Active Outpass
// ============================================================================
const findActiveOutpass = async (studentId) => {
  return Outpass.findOne({
    student: studentId,
    status: {
      $in: ACTIVE_OUTPASS_STATUS,
    },
    isDeleted: false,
  }).sort({
    createdAt: -1,
  });
};

// ============================================================================
// Find Today's Outpass
// ============================================================================
const findTodayOutpass = async (studentId, startOfDay, endOfDay) => {
  return Outpass.findOne({
    student: studentId,
    outDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    isDeleted: false,
    status: {
      $in: ACTIVE_OUTPASS_STATUS,
    },
  });
};

// ============================================================================
// Student History
// ============================================================================
const getStudentHistory = async (
  studentId,
  page = 1,
  limit = 10,
  search = "",
) => {
  const filter = {
    student: studentId,
    isDeleted: false,
  };

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.find(filter)
    .populate("mentor", "name")
    .sort({
      createdAt: -1,
    })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Student History Count
// ============================================================================
const countStudentHistory = async (studentId, search = "") => {
  const filter = {
    student: studentId,
    isDeleted: false,
  };

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.countDocuments(filter);
};

// ============================================================================
// Cancel Outpass
// ============================================================================
const cancelOutpass = async (outpassId, studentId) => {
  return Outpass.findOneAndUpdate(
    {
      _id: outpassId,
      student: studentId,
      status: OUTPASS_STATUS.PENDING,
      isDeleted: false,
    },
    {
      $set: {
        status: OUTPASS_STATUS.CANCELLED,
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Mentor - Pending Requests
// ============================================================================
const findPendingForMentor = async (
  mentorId,
  page = 1,
  limit = 10,
  search = "",
) => {
  const filter = {
    mentor: mentorId,
    status: OUTPASS_STATUS.PENDING,
    isDeleted: false,
  };

  const data = await Outpass.find(filter);

  return data;
};

// ============================================================================
// Mentor - Approved Requests
// ============================================================================
const findApprovedForMentor = async (mentorId, page = 1, limit = 10) => {
  return Outpass.find({
    mentor: mentorId,
    status: OUTPASS_STATUS.APPROVED,
    isDeleted: false,
  })
    .sort({ approvedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Mentor - Rejected Requests
// ============================================================================
const findRejectedForMentor = async (mentorId, page = 1, limit = 10) => {
  return Outpass.find({
    mentor: mentorId,
    status: OUTPASS_STATUS.REJECTED,
    isDeleted: false,
  })
    .sort({ rejectedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Count Mentor Pending Requests
// ============================================================================
const countPendingForMentor = async (mentorId) => {
  return Outpass.countDocuments({
    mentor: mentorId,
    status: OUTPASS_STATUS.PENDING,
    isDeleted: false,
  });
};

// ============================================================================
// Security - Pending Exit Verification
// ============================================================================
const findPendingExitVerification = async (page = 1, limit = 10) => {
  return Outpass.find({
    status: OUTPASS_STATUS.APPROVED,
    exitVerified: false,
    isDeleted: false,
  })
    .sort({ approvedAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Security - Pending Entry Verification
// ============================================================================
const findPendingEntryVerification = async (page = 1, limit = 10) => {
  return Outpass.find({
    status: OUTPASS_STATUS.EXITED,
    entryVerified: false,
    expectedReturn: {
      $ne: "HOME",
    },
    isDeleted: false,
  })
    .sort({ exitVerifiedAt: 1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const countPendingExitVerification = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.APPROVED,
    exitVerified: false,
    isDeleted: false,
  });
};

const countPendingEntryVerification = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.EXITED,
    entryVerified: false,
    expectedReturn: {
      $ne: "HOME",
    },
    isDeleted: false,
  });
};

// ============================================================================
// Soft Delete
// ============================================================================
const softDelete = async (outpassId, deletedBy) => {
  return Outpass.findByIdAndUpdate(
    outpassId,
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Restore Soft Deleted Outpass
// ============================================================================
const restore = async (outpassId) => {
  return Outpass.findByIdAndUpdate(
    outpassId,
    {
      $set: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    },
    {
      new: true,
    },
  );
};

// ============================================================================
// Permanent Delete
// ============================================================================
const deleteOutpass = async (outpassId) => {
  return Outpass.findByIdAndDelete(outpassId);
};

// ============================================================================
// Admin Search
// ============================================================================
const adminSearch = async (filter = {}) => {
  return Outpass.find(filter)
    .populate("student", "name enrollmentNo")
    .populate("mentor", "name")
    .sort({
      createdAt: -1,
    });
};

// ============================================================================
// Update Outpass
// ============================================================================
const updateOutpass = async (outpassId, update) => {
  return Outpass.findByIdAndUpdate(outpassId, update, {
    returnDocument: "after",
    runValidators: true,
  });
};

// ============================================================================
// Save Timeline Event
// ============================================================================
const addTimelineEvent = async (outpassId, timeline) => {
  return Outpass.findByIdAndUpdate(
    outpassId,
    {
      $push: {
        timeline,
      },
    },
    {
      new: true,
    },
  );
};

const findByQrToken = async (qrToken) => {
  return Outpass.findOne({
    qrToken,
    isDeleted: false,
  })
    .populate(
      "student",
      "name enrollmentNo email course branch semester section",
    )
    .populate("mentor", "name email");
};

// ============================================================================
// Count Student Outpasses
// ============================================================================
const countStudentOutpasses = async (studentId) => {
  return Outpass.countDocuments({
    student: studentId,
    isDeleted: false,
  });
};

// ============================================================================
// Count Student By Status
// ============================================================================
const countStudentByStatus = async (studentId, status) => {
  return Outpass.countDocuments({
    student: studentId,
    status,
    isDeleted: false,
  });
};

// ============================================================================
// Count Mentor By Status
// ============================================================================
const countMentorByStatus = async (mentorId, status) => {
  return Outpass.countDocuments({
    mentor: mentorId,
    status,
    isDeleted: false,
  });
};

// ============================================================================
// Save QR Information
// ============================================================================

// ============================================================================
// Export Repository Methods
// ============================================================================
// ============================================================================
// Count All Outpasses
// ============================================================================
const countAllOutpasses = async () => {
  return Outpass.countDocuments({
    isDeleted: false,
  });
};

// ============================================================================
// Count Approved Outpasses
// ============================================================================
const countApproved = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.APPROVED,
    isDeleted: false,
  });
};

// ============================================================================
// Count Rejected Outpasses
// ============================================================================
const countRejected = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.REJECTED,
    isDeleted: false,
  });
};

// ============================================================================
// Count Pending Outpasses
// ============================================================================
const countPending = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.PENDING,
    isDeleted: false,
  });
};

// ============================================================================
// Count Exited Outpasses
// ============================================================================
const countExited = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.EXITED,
    isDeleted: false,
  });
};

// ============================================================================
// Count Returned Outpasses
// ============================================================================
const countReturned = async () => {
  return Outpass.countDocuments({
    status: OUTPASS_STATUS.RETURNED,
    isDeleted: false,
  });
};
// ============================================================================
// Mentor History
// ============================================================================
const findHistoryForMentor = async (
  mentorId,
  page = 1,
  limit = 10,
  search = "",
) => {
  const filter = {
    mentor: mentorId,
    status: {
      $in: [
        OUTPASS_STATUS.APPROVED,
        OUTPASS_STATUS.REJECTED,
        OUTPASS_STATUS.EXITED,
        OUTPASS_STATUS.RETURNED,
      ],
    },
    isDeleted: false,
  };

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.find(filter)
    .populate("student", "name enrollmentNo")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Count Mentor History
// ============================================================================
const countHistoryForMentor = async (mentorId, search = "") => {
  const filter = {
    mentor: mentorId,
    status: {
      $in: [
        OUTPASS_STATUS.APPROVED,
        OUTPASS_STATUS.REJECTED,
        OUTPASS_STATUS.EXITED,
        OUTPASS_STATUS.RETURNED,
      ],
    },
    isDeleted: false,
  };

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.countDocuments(filter);
};

// ============================================================================
// Mentor Outpass Details
// ============================================================================

const findOutpassDetailsForMentor = async (mentorId, outpassId) => {
  return Outpass.findOne({
    _id: outpassId,
    mentor: mentorId,
    isDeleted: false,
  })
    .populate("student", "name enrollmentNo email mobileNumber")
    .populate("mentor", "name email");
};

const findRecentForMentor = async (mentorId, limit = 5) => {
  return Outpass.find({
    mentor: mentorId,
    isDeleted: false,
  })
    .populate("student", "name enrollmentNo")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};
// ============================================================================
// Verify Exit (Student OK Button)
// ============================================================================
const verifyExit = async (outpassId) => {
  return Outpass.findByIdAndUpdate(
    outpassId,
    {
      $set: {
        status: OUTPASS_STATUS.EXITED,
        exitVerified: true,
        exitVerifiedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .populate("student", "name enrollmentNumber email")
    .populate("mentor", "name email");
};
// ============================================================================
// Admin - All Outpass History
// ============================================================================
const getAllOutpasses = async (
  page = 1,
  limit = 10,
  search = "",
  status = "",
) => {
  const filter = {
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
      {
        "student.name": {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.find(filter)
    .populate(
      "student",
      "name enrollmentNumber email hostel roomNumber course branch semester",
    )
    .populate("mentor", "name email")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// ============================================================================
// Count All Outpasses
// ============================================================================
const countAllOutpassesHistory = async (search = "", status = "") => {
  const filter = {
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (search) {
    filter.$or = [
      {
        outpassId: {
          $regex: search,
          $options: "i",
        },
      },
      {
        destination: {
          $regex: search,
          $options: "i",
        },
      },
      {
        reason: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  return Outpass.countDocuments(filter);
};
module.exports = Object.freeze({
  // Student
  createOutpass,
  findById,
  findByOutpassId,
  findActiveOutpass,
  findTodayOutpass,
  getStudentHistory,
  countStudentHistory,
  cancelOutpass,
  updateOutpass,
  addTimelineEvent,
  findByQrToken,

  // Dashboard
  countStudentOutpasses,
  countStudentByStatus,
  countMentorByStatus,
  // Admin Dashboard
  countAllOutpasses,
  countApproved,
  countRejected,
  countPending,
  countExited,
  countReturned,

  // Mentor
  findPendingForMentor,
  findApprovedForMentor,
  findRejectedForMentor,
  findRecentForMentor,
  findHistoryForMentor,
  countPendingForMentor,
  countHistoryForMentor,
  findOutpassDetailsForMentor,

  // Security
  findPendingExitVerification,
  findPendingEntryVerification,
  countPendingExitVerification,
  countPendingEntryVerification,
  // Admin
  adminSearch,
  softDelete,
  restore,
  deleteOutpass,
  verifyExit,

  getAllOutpasses,
  countAllOutpassesHistory,
});
