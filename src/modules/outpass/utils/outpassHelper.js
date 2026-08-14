const {
  OUTPASS_STATUS,
  ACTIVE_OUTPASS_STATUS,
  FINAL_OUTPASS_STATUS,
  MENTOR_ACTION_ALLOWED_STATUS,
} = require("../constants/outpassStatus");

// ============================================================================
// Check Active Outpass
// ============================================================================
const isActiveOutpass = (status) => {
  return ACTIVE_OUTPASS_STATUS.includes(status);
};

// ============================================================================
// Check Final Status
// ============================================================================
const isFinalStatus = (status) => {
  return FINAL_OUTPASS_STATUS.includes(status);
};

// ============================================================================
// Student Can Cancel
// ============================================================================
const canCancelOutpass = (status) => {
  return status === OUTPASS_STATUS.PENDING;
};

// ============================================================================
// Mentor Can Take Action
// ============================================================================
const canMentorTakeAction = (status) => {
  return MENTOR_ACTION_ALLOWED_STATUS.includes(status);
};

// ============================================================================
// Check Home Return
// ============================================================================
const isHomeReturn = (expectedReturn) => {
  return expectedReturn === "HOME";
};

// ============================================================================
// Check Pending Status
// ============================================================================
const isPending = (status) => {
  return status === OUTPASS_STATUS.PENDING;
};

// ============================================================================
// Check Approved Status
// ============================================================================
const isApproved = (status) => {
  return status === OUTPASS_STATUS.APPROVED;
};

// ============================================================================
// Check Rejected Status
// ============================================================================
const isRejected = (status) => {
  return status === OUTPASS_STATUS.REJECTED;
};

// ============================================================================
// Check Completed Status
// ============================================================================
const isCompleted = (status) => {
  return status === OUTPASS_STATUS.COMPLETED;
};

module.exports = Object.freeze({
  isActiveOutpass,
  isFinalStatus,
  canCancelOutpass,
  canMentorTakeAction,
  isHomeReturn,
  isPending,
  isApproved,
  isRejected,
  isCompleted,
});
