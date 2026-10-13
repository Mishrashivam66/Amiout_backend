"use strict";

require("dotenv").config();

const { sendSMS } = require("./src/modules/notification/service/smsService");

const run = async () => {
  const result = await sendSMS({
    to: "9999999999",
    message: "AMIOUT SMS testing",
  });

  console.log({
    provider: result.provider,
    success: result.success,
    delivered: result.delivered,
    status: result.status,
  });
};

run().catch((error) => {
  console.error("SMS test failed:", error.message);
  process.exitCode = 1;
});
