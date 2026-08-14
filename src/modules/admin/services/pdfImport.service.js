"use strict";


const studentImportService = require("../../academic/services/studentImport.service");

// ============================================================================
// Import Students From PDF
// ============================================================================

const importStudentsFromPDF = async (file) => {
  return studentImportService.importStudentsFromPDF(file);
};

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  importStudentsFromPDF,
});