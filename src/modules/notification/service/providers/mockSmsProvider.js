"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const send = async ({ to, message }) => {
  // Never allow mock SMS in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock SMS cannot be used in production.");
  }

  const isLocalTestEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.SMS_MOCK_OUTBOX_ENABLED === "true";

  const messageId = `mock_${crypto.randomUUID()}`;

  if (isLocalTestEnabled) {
    // Private local development inbox.
    // Never expose this directory using Express static routes.
    const outboxDirectory = path.resolve(process.cwd(), ".local", "sms-outbox");

    await fs.mkdir(outboxDirectory, {
      recursive: true,
      mode: 0o700,
    });

    const filePath = path.join(outboxDirectory, `${messageId}.json`);

    const data = {
      id: messageId,
      recipient: String(to),
      message: String(message || ""),
      createdAt: new Date().toISOString(),
      testingOnly: true,
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }

  return {
    success: true,
    provider: "mock",
    delivered: false,
    status: "MOCK",
    messageId,
    message: "SMS simulated. No real message was delivered.",
  };
};

module.exports = Object.freeze({ send });
