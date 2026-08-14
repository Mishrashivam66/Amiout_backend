require("../config/env");

const connectDatabase = require("../config/db");
const app = require("../app");

let isConnected = false;

module.exports = async (req, res) => {
  try {
    console.log("Function called:", req.method, req.url);

    if (!isConnected) {
      console.log("Connecting DB...");
      await connectDatabase();
      console.log("DB Connected");
      isConnected = true;
    }

    // Sirf test ke liye
    if (req.url === "/test") {
      return res.status(200).json({
        success: true,
        message: "Function + MongoDB OK",
      });
    }

    return app(req, res);
  } catch (err) {
    console.error("FULL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
};
