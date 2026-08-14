"use strict";
// ============================================================================
// Extract Student Groups
// ============================================================================
const extractGroups = (text = "") => {
  const groups = [];
  const regex =
    /([A-Z])\s*-\s*(\d+)\s*([A-Z])\s*-\s*(\d+)\s*(No Group|[A-Z]\s*-\s*\d+)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    groups.push({
      primaryGroup: `${match[1]}-${match[2]}`,

      secondaryGroup: `${match[3]}-${match[4]}`,

      assignedGroup: match[5].replace(/\s+/g, " ").trim(),
    });
  }

  return groups;
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  extractGroups,
});
