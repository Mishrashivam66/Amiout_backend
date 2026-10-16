"use strict";

const TEXTBEE_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

const normalizeNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  const mobile =
    digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error("Invalid Indian mobile number.");
  }

  return `+91${mobile}`;
};

const send = async ({ to, message }) => {
  const apiKey = process.env.TEXTBEE_API_KEY;
  const deviceId = process.env.TEXTBEE_DEVICE_ID;
  const simId = process.env.TEXTBEE_SIM_SUBSCRIPTION_ID;

  if (!apiKey) {
    throw new Error("TEXTBEE_API_KEY is missing.");
  }

  if (typeof message !== "string" || !message.trim()) {
    throw new Error("SMS message cannot be empty.");
  }

  const recipient = normalizeNumber(to);

  // Restrict delivery to approved test numbers.
  const allowedNumbers = String(process.env.SMS_TEST_ALLOWED_NUMBERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeNumber);

  if (allowedNumbers.length === 0 || !allowedNumbers.includes(recipient)) {
    throw new Error("SMS recipient is not in the testing allowlist.");
  }

  const payload = {
    recipients: [recipient],
    message: message.trim(),
  };

  if (deviceId) {
    payload.deviceId = deviceId;
  }

  if (simId !== undefined && simId !== "") {
    const subscriptionId = Number(simId);

    if (!Number.isSafeInteger(subscriptionId) || subscriptionId < 0) {
      throw new Error("Invalid TEXTBEE_SIM_SUBSCRIPTION_ID.");
    }

    payload.simSubscriptionId = subscriptionId;
  }

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

  if (!response.ok || data.success === false) {
    throw new Error(`textbee SMS request failed (HTTP ${response.status}).`);
  }

  return {
    success: true,
    provider: "textbee",
    delivered: false,
    status: "ACCEPTED",
    messageId: data.data?.smsBatchId || data.smsBatchId || null,
    message: "SMS accepted by textbee; delivery not yet confirmed.",
  };
};

module.exports = Object.freeze({ send });
