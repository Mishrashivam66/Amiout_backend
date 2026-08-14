const historyDTO = (outpass) => {
  if (!outpass) return null;

  return {
    id: outpass._id,

    outpassId: outpass.outpassId,

    studentName: outpass.studentName,

    enrollmentNumber: outpass.enrollmentNumber,

    destination: outpass.destination,

    reason: outpass.reason,

    outDate: outpass.outDate,

    outTime: outpass.outTime,

    expectedReturn: outpass.expectedReturn,

    status: outpass.status,

    mentor: outpass.mentor
      ? {
          id: outpass.mentor._id,
          name: outpass.mentor.name,
        }
      : null,

    createdAt: outpass.createdAt,
  };
};

// ============================================================================
// History List DTO
// ============================================================================

const historyListDTO = (outpasses = []) =>
  outpasses.map(historyDTO);

module.exports = {
  historyDTO,
  historyListDTO,
};