"use strict";

const fs = require("fs");
const pdf = require("pdf-parse");

const { normalizePDF } = require("./pdfNormalizer");
const { extractHeader } = require("./pdfHeaderExtractor");
const { extractStudents } = require("./pdfRowExtractor");

// ============================================================================
// Parse PDF
// ============================================================================

const parsePDF = async (file) => {
  if (!file) {
    throw new Error("PDF file not found.");
  }

  const buffer = file.buffer || fs.readFileSync(file.path);

  const parsed = await pdf(buffer);
  const rawText = parsed.text || "";

  if (!rawText.trim()) {
    throw new Error("Unable to extract PDF text.");
  }

  const normalizedText = normalizePDF(rawText);
  const header = extractHeader(normalizedText);
  const students = extractStudents(normalizedText);

  return {
    success: true,
    pages: parsed.numpages,
    version: parsed.version,
    header,
    totalStudents: students.length,
    students,
    rawText,
    normalizedText,
  };
};

module.exports = Object.freeze({
  parsePDF,
});
