"use strict";

const mappingService = require("./mapping.service");

// =====================================================
// AUTOMATIC MENTOR MAPPING AFTER ACADEMIC IMPORT
// =====================================================

const runAutomaticMapping = async (source) => {
  try {
    const result = await mappingService.generateMapping();

    return {
      triggered: true,
      success: result.success,
      source,
      totalStudents: result.totalStudents,
      mapped: result.mapped,
      failed: result.failed,
      errors: result.errors,
    };
  } catch (error) {
    console.error(`[AMIOUT] Mapping failed after ${source}:`, error);

    return {
      triggered: true,
      success: false,
      source,
      totalStudents: null,
      mapped: 0,
      failed: null,
      errors: [
        {
          reason: error.message,
        },
      ],
    };
  }
};

module.exports = Object.freeze({
  runAutomaticMapping,
});
