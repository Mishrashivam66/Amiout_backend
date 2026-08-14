require("../config/env");

console.log("1. env loaded");

const connectDatabase = require("../config/db");
console.log("2. db loaded");

const app = require("../app");
console.log("3. app loaded");

let isConnected = false;

module.exports = async (req, res) => {
  try {
    console.log("4. function called");

    if (!isConnected) {
      console.log("5. connecting db");
      await connectDatabase();
      console.log("6. db connected");
      isConnected = true;
    }

    console.log("7. calling app");
    return app(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
};
