"use strict";

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

const normalizeNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  const mobile =
    digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    throw new Error("Invalid Indian mobile number.");
  }

  return mobile;
};

const send = async ({ to, templateVariables = [] }) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID;
  const templateId = process.env.SMS_DLT_TEMPLATE_ID;

  if (!apiKey || !senderId || !templateId) {
    throw new Error("Fast2SMS DLT configuration is incomplete.");
  }

  if (
    !Array.isArray(templateVariables) ||
    templateVariables.some(
      (value) =>
        value === null || value === undefined || String(value).includes("|"),
    )
  ) {
    throw new Error("Invalid SMS template variables.");
  }

  const number = normalizeNumber(to);

  // DLT API payload. Verify the exact template
  // variable format against the university's
  // approved Fast2SMS account before activation.
  const payload = {
    route: "dlt",
    sender_id: senderId,
    message: templateId,
    variables_values: templateVariables.map(String).join("|"),
    numbers: number,
  };

  const response = await fetch(FAST2SMS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();

  if (!response.ok || data.return !== true) {
    throw new Error(
      `Fast2SMS rejected SMS request: ${data.message || response.status}`,
    );
  }

  return {
    success: true,
    provider: "fast2sms",
    delivered: false,
    status: "ACCEPTED",
    messageId: Array.isArray(data.request_id)
      ? data.request_id[0]
      : data.request_id || null,
    message: "SMS accepted by gateway; delivery not confirmed.",
  };
};

module.exports = Object.freeze({ send });
