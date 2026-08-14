
// ============================================================================
// Notification Types
// ============================================================================
const NOTIFICATION_TYPES = Object.freeze({
  SYSTEM: "SYSTEM",
  OUTPASS: "OUTPASS",
  APPROVAL: "APPROVAL",
  SECURITY: "SECURITY",
  ACCOUNT: "ACCOUNT",
  ANNOUNCEMENT: "ANNOUNCEMENT",
});

// ============================================================================
// Notification Roles
// ============================================================================
const NOTIFICATION_ROLES = Object.freeze({
  STUDENT: "STUDENT",
  MENTOR: "MENTOR",
  SECURITY: "SECURITY",
  ADMIN: "ADMIN",
});

// ============================================================================
// Notification Priority
// ============================================================================
const NOTIFICATION_PRIORITY = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
});

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  NOTIFICATION_TYPES,
  NOTIFICATION_ROLES,
  NOTIFICATION_PRIORITY,
});
