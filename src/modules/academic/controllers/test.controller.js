"use strict";

const XLSX = require("xlsx");

const testExcel = async (req, res) => {
  console.log("========== TEST ==========");
  console.log("req.file =", req.file);

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "No file received",
    });
  }

  try {
    let workbook;

    // Vercel
    if (req.file.buffer) {
      workbook = XLSX.read(req.file.buffer, {
        type: "buffer",
      });
    }
    // Local
    else {
      workbook = XLSX.readFile(req.file.path);
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
    });

    return res.json({
      success: true,
      file: {
        originalname: req.file.originalname,
        size: req.file.size,
      },
      totalRows: rows.length,
      firstRow: rows[0],
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  testExcel,
};
