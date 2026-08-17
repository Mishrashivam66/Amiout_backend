// require("../config/env");

const connectDatabase = require("../config/db");
const app = require("../app");

let isConnected = false;

module.exports = async (req, res) => {
  try {
    console.log("==============");
    console.log(req.method, req.url);

    if (!isConnected) {
      await connectDatabase();
      isConnected = true;
    }

    return app(req, res);
  } catch (err) {
    console.error("FULL ERROR");
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
};
