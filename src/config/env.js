const dotenv = require("dotenv");
const path = require("path");

// ==========================================
// LOAD ENV
// ==========================================

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

module.exports = process.env;
