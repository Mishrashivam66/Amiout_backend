
// ============================================================================
// Reason Validation
// ============================================================================
const REASON = Object.freeze({
  MIN_LENGTH: 10,
  MAX_LENGTH: 300,
});

// ============================================================================
// Destination Validation
// ============================================================================
const DESTINATION = Object.freeze({
  MIN_LENGTH: 2,
  MAX_LENGTH: 100,
});

// ============================================================================
// Pagination
// ============================================================================
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

// ============================================================================
// Outpass Rules
// ============================================================================
const OUTPASS_RULES = Object.freeze({
  MAX_OUTPASS_PER_DAY: 1,
  ALLOW_CANCEL_BEFORE_APPROVAL: true,
  REQUIRE_PROFILE_COMPLETION: true,
  REQUIRE_PROFILE_LOCK: true,
});

// ============================================================================
// QR Configuration
// ============================================================================
const QR = Object.freeze({
  ENABLED: true,
  WATERMARK: "AMIOUT - Amity University",
});

// ============================================================================
// Search Configuration
// ============================================================================
const SEARCH = Object.freeze({
  MIN_LENGTH: 2,
  MAX_LENGTH: 50,
});

// ============================================================================
// Dashboard Configuration
// ============================================================================
const DASHBOARD = Object.freeze({
  RECENT_ACTIVITY_LIMIT: 5,
  RECENT_NOTIFICATION_LIMIT: 5,
});

// ============================================================================
// Export Configuration
// ============================================================================
const EXPORT = Object.freeze({
  ENABLE_PDF: false,
  ENABLE_PRINT: false,
});

// ============================================================================
// History Configuration
// ============================================================================
const HISTORY = Object.freeze({
  AUTO_DELETE_DAYS: 7,
});

module.exports = Object.freeze({
  REASON,
  DESTINATION,
  PAGINATION,
  OUTPASS_RULES,
  QR,
  SEARCH,
  DASHBOARD,
  EXPORT,
  HISTORY,
});
