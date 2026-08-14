
const outpassDTO = (outpass) => {
  if (!outpass) return null;

  return {
    id: outpass._id,

    outpassId: outpass.outpassId,

    status: outpass.status,

    student: {
      id:
        typeof outpass.student === "object"
          ? outpass.student?._id
          : outpass.student || null,

      name: outpass.studentName,

      enrollmentNumber: outpass.enrollmentNumber,

      course: outpass.course,

      branch: outpass.branch,

      semester: outpass.semester,
    },

    mentor:
      outpass.mentor && typeof outpass.mentor === "object"
        ? {
            id: outpass.mentor._id,
            name: outpass.mentor.name,
            email: outpass.mentor.email,
          }
        : outpass.mentor
          ? {
              id: outpass.mentor,
            }
          : null,

    parent: {
      name: outpass.parentName,
      email: outpass.parentEmail,
      mobileNumber: outpass.parentMobileNumber,
    },

    reason: outpass.reason,

    destination: outpass.destination,

    outDate: outpass.outDate,

    outTime: outpass.outTime,

    expectedReturn: outpass.expectedReturn,

    mentorRemark: outpass.mentorRemark,

    qrGenerated: outpass.qrGenerated,

    exitVerified: outpass.exitVerified,

    entryVerified: outpass.entryVerified,

    approvedAt: outpass.approvedAt,

    rejectedAt: outpass.rejectedAt,

    cancelledAt: outpass.cancelledAt,

    exitVerifiedAt: outpass.exitVerifiedAt,

    entryVerifiedAt: outpass.entryVerifiedAt,

    createdAt: outpass.createdAt,

    updatedAt: outpass.updatedAt,
  };
};

// ============================================================================
// List DTO
// ============================================================================

const outpassListDTO = (outpasses = []) => outpasses.map(outpassDTO);

module.exports = {
  outpassDTO,
  outpassListDTO,
};
