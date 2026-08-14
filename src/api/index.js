require("../config/env");

const connectDatabase = require("../config/db");
const app = require("../app");

let isConnected = false;

module.exports = async (req, res) => {
  try {
    if (!isConnected) {
      await connectDatabase();
      isConnected = true;
      console.log("✅ MongoDB Connected");
    }

    return app(req, res);
  } catch (error) {
    console.error("Vercel Function Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Function crashed",
    });
  }
};