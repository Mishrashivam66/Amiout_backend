require("../config/env");

const connectDatabase = require("../config/db");
const app = require("../app");

let isConnected = false;

module.exports = async (req, res) => {
  try {
    console.log("Function invoked");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);
    console.log("DB_NAME:", process.env.DB_NAME);

    if (!isConnected) {
      await connectDatabase();
      isConnected = true;
    }

    return app(req, res);
  } catch (error) {
    console.error("Vercel Function Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack,
    });
  }
};
