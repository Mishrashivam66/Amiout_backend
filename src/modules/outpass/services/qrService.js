"use strict";

const crypto = require("node:crypto");

// ============================================================
// QR CONFIGURATION
// ============================================================

const QR_TYPE = "AMIOUT_OUTPASS";
const QR_VERSION = 1;

const IST_TIMEZONE = "Asia/Kolkata";

// AMIOUT QR Validity Window
// Start: 09:15 AM IST
// End:   06:00 PM IST (exclusive)

const QR_START_TIME = "09:15:00";
const QR_END_TIME = "18:00:00";

// ============================================================
// SECRET KEY
// ============================================================

const getQRSecret = () => {
  const secret = process.env.OUTPASS_QR_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("OUTPASS_QR_SECRET must contain at least 32 bytes.");
  }

  return secret;
};

// ============================================================
// SIGN QR TOKEN
// ============================================================

const sign = (data) => {
  return crypto
    .createHmac("sha256", getQRSecret())
    .update(data)
    .digest("base64url");
};

// ============================================================
// GET IST CALENDAR DATE
// ============================================================

const getISTDay = (date) => {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid outpass date.");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsedDate);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

// ============================================================
// QR VALIDITY WINDOW
//
// Valid From : 09:15 AM IST
// Expires At : 06:00 PM IST
//
// End time is exclusive.
// QR becomes invalid at exactly 06:00 PM.
// ============================================================

const getValidityWindow = (outDate) => {
  const day = getISTDay(outDate);

  const validFrom = new Date(`${day}T${QR_START_TIME}+05:30`);

  const expiresAt = new Date(`${day}T${QR_END_TIME}+05:30`);

  if (
    Number.isNaN(validFrom.getTime()) ||
    Number.isNaN(expiresAt.getTime()) ||
    validFrom >= expiresAt
  ) {
    throw new Error("Invalid QR validity window configuration.");
  }

  return {
    validFrom,
    expiresAt,
  };
};

// ============================================================
// CREATE SECURE QR TOKEN
//
// Does NOT update the database.
// Caller must save token and validity timestamps.
//
// Existing version 1 token format is preserved.
// ============================================================

const createQRToken = (outpass, now = new Date()) => {
  if (!outpass?._id || !outpass?.outDate) {
    throw new Error("Outpass ID and date are required.");
  }

  const currentTime = new Date(now);

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("Invalid QR issue time.");
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

  if (currentTime >= expiresAt) {
    throw new Error("The QR validity window has expired.");
  }

  const payload = {
    type: QR_TYPE,

    version: QR_VERSION,

    outpassId: String(outpass._id),

    nonce: crypto.randomBytes(24).toString("base64url"),

    issuedAt: Math.floor(currentTime.getTime() / 1000),

    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  const signature = sign(encodedPayload);

  const token = `${encodedPayload}.${signature}`;

  return {
    token,
    qrGeneratedAt: currentTime,
    qrValidFrom: validFrom,
    qrExpiresAt: expiresAt,
  };
};

// ============================================================
// VERIFY QR SIGNATURE AND EXPIRY
//
// Checks:
// - Token structure
// - HMAC SHA256 signature
// - Payload validity
// - Token issue timestamp
// - Token expiry timestamp
//
// Database and gate-window checks must also be performed
// by the security verification service.
// ============================================================

const verifyQRSignature = (token, now = new Date()) => {
  try {
    if (
      typeof token !== "string" ||
      token.length > 4096 ||
      token.length === 0
    ) {
      return {
        valid: false,
        message: "Invalid QR token.",
      };
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return {
        valid: false,
        message: "Malformed QR token.",
      };
    }

    const [encodedPayload, receivedSignature] = parts;

    if (
      !encodedPayload ||
      !receivedSignature ||
      !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
      !/^[A-Za-z0-9_-]+$/.test(receivedSignature)
    ) {
      return {
        valid: false,
        message: "Malformed QR token.",
      };
    }

    const expectedSignature = sign(encodedPayload);

    const actual = Buffer.from(receivedSignature, "base64url");

    const expected = Buffer.from(expectedSignature, "base64url");

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return {
        valid: false,
        message: "Invalid QR signature.",
      };
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (
      payload.type !== QR_TYPE ||
      payload.version !== QR_VERSION ||
      !/^[a-f0-9]{24}$/i.test(payload.outpassId || "") ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16 ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.issuedAt >= payload.expiresAt
    ) {
      return {
        valid: false,
        message: "Invalid QR payload.",
      };
    }

    const currentDate = new Date(now);

    if (Number.isNaN(currentDate.getTime())) {
      return {
        valid: false,
        message: "Invalid verification time.",
      };
    }

    const currentTime = Math.floor(currentDate.getTime() / 1000);

    if (currentTime >= payload.expiresAt) {
      return {
        valid: false,
        message: "QR has expired.",
      };
    }

    if (currentTime < payload.issuedAt) {
      return {
        valid: false,
        message: "QR is not yet valid.",
      };
    }

    return {
      valid: true,
      payload,
    };
  } catch {
    return {
      valid: false,
      message: "QR verification failed.",
    };
  }
};

// ============================================================
// CHECK QR VALIDITY WINDOW
//
// Used by Security EXIT / ENTRY verification.
// ============================================================

const isWithinQRValidityWindow = (outDate, now = new Date()) => {
  try {
    const currentTime = new Date(now);

    if (Number.isNaN(currentTime.getTime())) {
      return false;
    }

    const { validFrom, expiresAt } = getValidityWindow(outDate);

    return currentTime >= validFrom && currentTime < expiresAt;
  } catch {
    return false;
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  createQRToken,
  verifyQRSignature,
  getValidityWindow,
  getISTDay,
  isWithinQRValidityWindow,
});
