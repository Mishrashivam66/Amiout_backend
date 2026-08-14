const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadPath = path.join(__dirname, "../../uploads/imports");

// ============================================================================
// Create Upload Directory
// ============================================================================

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, {
    recursive: true,
  });
}

// ============================================================================
// Storage
// ============================================================================

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadPath);
  },

  filename(req, file, cb) {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "_");

    cb(null, uniqueName);
  },
});

// ============================================================================
// Excel Filter
// ============================================================================

const excelFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (![".xlsx", ".xls"].includes(extension)) {
    return cb(new Error("Only Excel (.xlsx, .xls) files are allowed."), false);
  }

  cb(null, true);
};

// ============================================================================
// PDF Filter
// ============================================================================

const pdfFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension !== ".pdf") {
    return cb(new Error("Only PDF files are allowed."), false);
  }

  cb(null, true);
};

// ============================================================================
// Upload Excel
// ============================================================================

const uploadExcel = multer({
  storage,

  fileFilter: excelFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ============================================================================
// Upload PDF
// ============================================================================

const uploadPDF = multer({
  storage,

  fileFilter: pdfFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ============================================================================
// Export
// ============================================================================

module.exports = Object.freeze({
  uploadExcel,

  uploadPDF,
});
