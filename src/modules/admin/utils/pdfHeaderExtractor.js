"use strict";
// ============================================================================
// Get Value
// ============================================================================

const getValue = (text = "", regex) => {
  const match = text.match(regex);

  if (!match) {
    return "";
  }

  return match[1].trim();
};

// ============================================================================
// Extract Header
// ============================================================================

const extractHeader = (text = "") => {
  return {
    institute: getValue(text, /Institute\s+(.*?)\s+Program/i),

    program: getValue(text, /Program\s+(.*?)\s+Semester/i),

    semester: getValue(text, /Semester\s+(\d+)/i),

    batch: getValue(text, /Batch\(year of passing\)\s+(\d+)/i),

    section: getValue(text, /Section\s+([A-Z])/i),

    category: getValue(text, /Category\s+(.*?)\s+SNo/i),
  };
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  extractHeader,
});
