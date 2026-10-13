"use strict";

const crypto = require("crypto");

const send = async ({ to, message }) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock SMS cannot be used in production.");
  }

  // Never print approval tokens or full mobile numbers
  // in application logs.
  return {
    success: true,
    provider: "mock",
    delivered: false,
    status: "MOCK",
    messageId: `mock_${crypto.randomUUID()}`,
    message: "SMS simulated. No real message was delivered.",
  };
};

module.exports = Object.freeze({ send });
