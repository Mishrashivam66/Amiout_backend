"use strict";

const connectDatabase = require("../config/db");
const app = require("../app");

let isConnected = false;

// ==========================================
// VERCEL SERVERLESS HANDLER
// ==========================================

module.exports = async (req, res) => {
  try {
    // ======================================
    // DATABASE CONNECTION
    // ======================================

    if (!isConnected) {
      await connectDatabase();
      isConnected = true;
    }

    // ======================================
    // EXPRESS APPLICATION
    // ======================================

    return app(req, res);
  } catch (err) {
    console.error("Vercel API Error:", err);

    return res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error."
          : err.message,
      ...(process.env.NODE_ENV !== "production" && {
        stack: err.stack,
      }),
    });
  }
};
