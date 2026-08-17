const XLSX = require("xlsx");

// ============================================================================
// Parse Excel File
// ============================================================================
const parseExcel = (file) => {
  if (!file) {
    throw new Error("Excel file not found.");
  }

  let workbook;

  // Vercel (memoryStorage)
  if (file.buffer) {
    workbook = XLSX.read(file.buffer, {
      type: "buffer",
    });
  }
  // Local (diskStorage)
  else if (file.path) {
    workbook = XLSX.readFile(file.path);
  } else {
    throw new Error("Invalid uploaded file.");
  }

  const sheetName = workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: "",
  });

  return {
    headers: Object.keys(data[0] || {}),
    data,
  };
};

// ============================================================================
// Normalize Excel Headers
// ============================================================================
const normalizeHeaders = (rows = []) => {
  return rows.map((row) => {
    const normalized = {};

    Object.keys(row).forEach((key) => {
      normalized[key.trim().toLowerCase()] = row[key];
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

module.exports = Object.freeze({
  parseExcel,
  normalizeHeaders,
  removeEmptyRows,
});
