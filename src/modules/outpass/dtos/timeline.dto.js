const timelineDTO = (outpass) => {
  if (!outpass) return null;

  return {
    outpassId: outpass.outpassId,

    status: outpass.status,

    timeline:
      outpass.timeline?.map((event) => ({
        id: event._id,

        event: event.event,

        title: event.title,

        description: event.description,

        performedBy: event.performedBy
          ? {
              id: event.performedBy._id,
              name: event.performedBy.name,
              role: event.performedBy.role,
            }
          : null,

        performedAt: event.performedAt,
      })) || [],

    createdAt: outpass.createdAt,

    approvedAt: outpass.approvedAt,

    rejectedAt: outpass.rejectedAt,

    qrGeneratedAt: outpass.qrGeneratedAt,

    exitVerifiedAt: outpass.exitVerifiedAt,

    entryVerifiedAt: outpass.entryVerifiedAt,

    updatedAt: outpass.updatedAt,
  };
};

// ============================================================================
// Timeline List DTO
// ============================================================================

const timelineListDTO = (outpasses = []) => outpasses.map(timelineDTO);

module.exports = {
  timelineDTO,
  timelineListDTO,
};
