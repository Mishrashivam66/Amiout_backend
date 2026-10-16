"use strict";

// ============================================================
// TEXTBEE SMS PROVIDER - AMIOUT
// ============================================================

const TEXTBEE_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

// ============================================================
// INDIAN MOBILE NUMBER NORMALIZATION
// Supports:
// 9876543210
// +919876543210
// 919876543210
// 09876543210
// ============================================================

const normalizeNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");

  let mobile = digits;

  if (digits.length === 12 && digits.startsWith("91")) {
    mobile = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    mobile = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error("Invalid Indian mobile number.");
  }

  return `+91${mobile}`;
};

// ============================================================
// TEST RECIPIENT ALLOWLIST
// ============================================================

const validateTestRecipient = (recipient) => {
  const raw = String(process.env.SMS_TEST_ALLOWED_NUMBERS || "");

  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error(
      "SMS_TEST_ALLOWED_NUMBERS is empty. " +
        "Add an authorized testing number in Vercel.",
    );
  }

  const allowedNumbers = entries.map((value) => {
    try {
      return normalizeNumber(value);
    } catch {
      throw new Error(
        "Invalid SMS_TEST_ALLOWED_NUMBERS configuration. " +
          "Replace placeholders with real authorized numbers.",
      );
    }
  });

  if (!allowedNumbers.includes(recipient)) {
    throw new Error("SMS recipient is not in the testing allowlist.");
  }
};

// ============================================================
// SEND SMS
// ============================================================

const send = async ({ to, message }) => {
  const apiKey = String(process.env.TEXTBEE_API_KEY || "").trim();

  const deviceId = String(process.env.TEXTBEE_DEVICE_ID || "").trim();

  const simId = String(process.env.TEXTBEE_SIM_SUBSCRIPTION_ID ?? "").trim();

  if (!apiKey) {
    throw new Error("TEXTBEE_API_KEY is missing.");
  }

  if (typeof message !== "string" || !message.trim()) {
    throw new Error("SMS message cannot be empty.");
  }

  // Normalize the actual StudentMaster parent number.
  const recipient = normalizeNumber(to);

  // Only approved testing numbers can receive SMS.
  validateTestRecipient(recipient);

  const payload = {
    recipients: [recipient],
    message: message.trim(),
  };

  if (deviceId) {
    payload.deviceId = deviceId;
  }

  if (simId !== "") {
    const subscriptionId = Number(simId);

    if (!Number.isSafeInteger(subscriptionId) || subscriptionId < 0) {
      throw new Error("Invalid TEXTBEE_SIM_SUBSCRIPTION_ID.");
    }

    payload.simSubscriptionId = subscriptionId;
  }

  // ==========================================================
  // TEXTBEE API REQUEST
  // ==========================================================

  let response;

  try {
    response = await fetch(TEXTBEE_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`textbee connection failed: ${error.message}`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false || data.data?.success === false) {
    throw new Error(`textbee SMS request failed (HTTP ${response.status}).`);
  }

  return {
    success: true,
    provider: "textbee",
    delivered: false,
    status: "ACCEPTED",
    messageId: data.data?.smsBatchId || data.smsBatchId || null,
    message: "SMS accepted by textbee; delivery not confirmed.",
  };
};

module.exports = Object.freeze({
  send,
});
