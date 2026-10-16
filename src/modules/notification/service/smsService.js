"use strict";

const mockSmsProvider = require("./providers/mockSmsProvider");

const fast2smsProvider = require("./providers/fast2smsProvider");

const textbeeProvider = require("./providers/textbeeProvider");

// ==========================================
// AVAILABLE SMS PROVIDERS
// ==========================================

const PROVIDERS = Object.freeze({
  mock: mockSmsProvider,
  fast2sms: fast2smsProvider,
  textbee: textbeeProvider,
});

// ==========================================
// SEND SMS
// ==========================================

const sendSMS = async ({ to, message, templateVariables = [] }) => {
  if (!to) {
    throw new Error("SMS recipient is required.");
  }

  const selectedProvider = String(process.env.SMS_PROVIDER || "mock")
    .trim()
    .toLowerCase();

  const provider = PROVIDERS[selectedProvider];

  if (!provider) {
    throw new Error(`Unsupported SMS provider: ${selectedProvider}`);
  }

  if (
    selectedProvider !== "fast2sms" &&
    (typeof message !== "string" || !message.trim())
  ) {
    throw new Error("SMS message is required.");
  }

  return provider.send({
    to,
    message,
    templateVariables,
  });
};

module.exports = Object.freeze({
  sendSMS,
});
