const NOTIFICATION_TYPES = Object.freeze({
  // ============================================================================
  // Student Notifications
  // ============================================================================

  OUTPASS_SUBMITTED: "OUTPASS_SUBMITTED",

  OUTPASS_APPROVED: "OUTPASS_APPROVED",

  OUTPASS_REJECTED: "OUTPASS_REJECTED",

  OUTPASS_CANCELLED: "OUTPASS_CANCELLED",

  // ============================================================================
  // QR Notifications
  // ============================================================================

  QR_GENERATED: "QR_GENERATED",

  // ============================================================================
  // Security Notifications
  // ============================================================================

  EXIT_VERIFIED: "EXIT_VERIFIED",

  ENTRY_VERIFIED: "ENTRY_VERIFIED",

  // ============================================================================
  // Profile Notifications
  // ============================================================================

  PROFILE_COMPLETED: "PROFILE_COMPLETED",

  PROFILE_UNLOCKED: "PROFILE_UNLOCKED",

  ACCOUNT_HOLD: "ACCOUNT_HOLD",

  ACCOUNT_ACTIVE: "ACCOUNT_ACTIVE",

  // ============================================================================
  // Admin Notifications
  // ============================================================================

  ADMIN: "ADMIN",

  ANNOUNCEMENT: "ANNOUNCEMENT",

  SYSTEM: "SYSTEM",

  // ============================================================================
  // General Notifications
  // ============================================================================

  SUCCESS: "SUCCESS",

  WARNING: "WARNING",

  ERROR: "ERROR",
});

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  NOTIFICATION_TYPES,
});
