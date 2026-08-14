"use strict";

const removeFooter = (text = "") => {
  return text
    .replace(/https?:\/\/amizone\.net\/[^\s]*/gi, "")
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(AM|PM)/gi, "")
    .replace(/groupinformation/gi, "")
    .replace(/\d+\s*\/\s*\d+/g, "");
};

// ============================================================================
// Normalize White Spaces
// ============================================================================

const normalizeSpaces = (text = "") => {
  return text

    .replace(/\r/g, "")

    .replace(/\t/g, " ")

    .replace(/[ ]{2,}/g, " ")

    .replace(/\n{2,}/g, "\n")

    .trim();
};

// ============================================================================
// Normalize Keywords
// ============================================================================

const normalizeKeywords = (text = "") => {
  return text

    .replace(/Institute(?=[A-Z])/g, "Institute ")

    .replace(/Program(?=[A-Z])/g, "Program ")

    .replace(/Semester(?=\d)/g, "Semester ")

    .replace(/Section(?=[A-Z])/g, "Section ")

    .replace(/Category(?=[A-Z])/g, "Category ")

    .replace(/Batch\(year of passing\)(?=\d)/g, "Batch(year of passing) ")

    .replace(/Courses \(Optional\)/g, "Courses (Optional)");
};

// ============================================================================
// Normalize PDF
// ============================================================================

const normalizePDF = (text = "") => {
  let normalized = text;

  normalized = removeFooter(normalized);

  normalized = normalizeKeywords(normalized);

  normalized = normalizeSpaces(normalized);

  return normalized;
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  normalizePDF,

  removeFooter,

  normalizeSpaces,

  normalizeKeywords,
});
