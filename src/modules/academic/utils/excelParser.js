const XLSX = require("xlsx");


// ============================================================================
// Parse Excel File
// ============================================================================
const parseExcel = (filePath) => {
  const workbook = XLSX.readFile(filePath);

  const sheetName = workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: "",
  });

  return rows;
};

// ============================================================================
// Normalize Excel Headers
// ============================================================================
const normalizeHeaders = (rows = []) => {
  return rows.map((row) => {
    const normalized = {};

    Object.keys(row).forEach((key) => {
      const formattedKey = key
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[()]/g, "")
        .toLowerCase();

      normalized[formattedKey] = row[key];
    });

    return normalized;
  });
};

// ============================================================================
// Remove Empty Rows
// ============================================================================
const removeEmptyRows = (rows = []) => {
  return rows.filter((row) =>
    Object.values(row).some(
      (value) => value !== "" && value !== null && value !== undefined,
    ),
  );
};

// ============================================================================
// Parse & Clean Excel
// ============================================================================
const parseAndNormalizeExcel = (filePath) => {
  const rows = parseExcel(filePath);

  const normalized = normalizeHeaders(rows);

  return removeEmptyRows(normalized);
};

module.exports = Object.freeze({
  parseExcel,
  normalizeHeaders,
  removeEmptyRows,
  parseAndNormalizeExcel,
});
