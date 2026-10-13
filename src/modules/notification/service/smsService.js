"use strict";

const mockSmsProvider = require("./providers/mockSmsProvider");

const fast2smsProvider = require("./providers/fast2smsProvider");

const PROVIDERS = Object.freeze({
  mock: mockSmsProvider,
  fast2sms: fast2smsProvider,
});

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

  return provider.send({
    to,
    message,
    templateVariables,
  });
};

module.exports = Object.freeze({
  sendSMS,
});
