
const OUTPASS_STATUS = Object.freeze({

  PENDING: "PENDING",


  APPROVED: "APPROVED",


  REJECTED: "REJECTED",

  CANCELLED: "CANCELLED",


  EXITED: "EXITED",

  RETURNED: "RETURNED",
  COMPLETED: "COMPLETED",
});

// ============================================================================
// QR Generation Allowed Status
// ============================================================================
const QR_ALLOWED_STATUS = Object.freeze([OUTPASS_STATUS.APPROVED]);

const ACTIVE_OUTPASS_STATUS = Object.freeze([
  OUTPASS_STATUS.PENDING,
  OUTPASS_STATUS.APPROVED,
  OUTPASS_STATUS.EXITED,
]);

const FINAL_OUTPASS_STATUS = Object.freeze([
  OUTPASS_STATUS.REJECTED,
  OUTPASS_STATUS.CANCELLED,
  OUTPASS_STATUS.COMPLETED,
]);

// ============================================================================
// Mentor Action Allowed
// ============================================================================
const MENTOR_ACTION_ALLOWED_STATUS = Object.freeze([OUTPASS_STATUS.PENDING]);

// ============================================================================
// Security Exit Verification Allowed
// ============================================================================
const EXIT_ALLOWED_STATUS = Object.freeze([OUTPASS_STATUS.APPROVED]);

// ============================================================================
// Security Entry Verification Allowed
// ============================================================================
const ENTRY_ALLOWED_STATUS = Object.freeze([OUTPASS_STATUS.EXITED]);

module.exports = Object.freeze({
  OUTPASS_STATUS,
  QR_ALLOWED_STATUS,
  ACTIVE_OUTPASS_STATUS,
  FINAL_OUTPASS_STATUS,
  MENTOR_ACTION_ALLOWED_STATUS,
  EXIT_ALLOWED_STATUS,
  ENTRY_ALLOWED_STATUS,
});
