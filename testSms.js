"use strict";

require("dotenv").config();

const { sendSMS } = require("./src/modules/notification/service/smsService");

// ==========================================
// SMS TEST
// ==========================================

const run = async () => {
  await sendSMS({
    to: "9999999999",
    message: "AMIOUT SMS testing",
  });
};

run().catch((error) => {
  console.error("SMS test failed:", error.message);
  process.exitCode = 1;
});
