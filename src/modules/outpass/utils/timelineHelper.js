const {
  OUTPASS_TIMELINE,
  TIMELINE_LABELS,
} = require("../constants/outpassTimeline");

// ============================================================================
// Create Timeline Event
// ============================================================================
const createTimelineEvent = ({
  event,
  description = "",
  performedBy = null,
}) => {
  return {
    event,

    title: TIMELINE_LABELS[event] || event,

    description,

    performedBy,

    performedAt: new Date(),
  };
};

// ============================================================================
// Applied Event
// ============================================================================
const appliedEvent = (studentId) =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.APPLIED,
    description: "Outpass request submitted.",
    performedBy: studentId,
  });

// ============================================================================
// Approved Event
// ============================================================================
const approvedEvent = (mentorId, remark = "") =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.APPROVED,
    description: remark || "Outpass approved.",
    performedBy: mentorId,
  });

// ============================================================================
// Rejected Event
// ============================================================================
const rejectedEvent = (mentorId, remark = "") =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.REJECTED,
    description: remark || "Outpass rejected.",
    performedBy: mentorId,
  });

// ============================================================================
// QR Generated Event
// ============================================================================
const qrGeneratedEvent = () =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.QR_GENERATED,
    description: "QR Code generated successfully.",
  });

// ============================================================================
// Exit Verified Event
// ============================================================================
const exitVerifiedEvent = (securityId) =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.EXIT_VERIFIED,
    description: "Exit verified by security.",
    performedBy: securityId,
  });

// ============================================================================
// Entry Verified Event
// ============================================================================
const entryVerifiedEvent = (securityId) =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.ENTRY_VERIFIED,
    description: "Entry verified by security.",
    performedBy: securityId,
  });

// ============================================================================
// Completed Event
// ============================================================================
const completedEvent = () =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.COMPLETED,
    description: "Outpass completed successfully.",
  });

// ============================================================================
// Cancelled Event
// ============================================================================
const cancelledEvent = (studentId) =>
  createTimelineEvent({
    event: OUTPASS_TIMELINE.CANCELLED,
    description: "Outpass cancelled by student.",
    performedBy: studentId,
  });

module.exports = Object.freeze({
  createTimelineEvent,
  appliedEvent,
  approvedEvent,
  rejectedEvent,
  qrGeneratedEvent,
  exitVerifiedEvent,
  entryVerifiedEvent,
  completedEvent,
  cancelledEvent,
});
