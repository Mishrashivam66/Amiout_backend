"use strict";

const crypto = require("node:crypto");

const QR_TYPE = "AMIOUT_OUTPASS";
const QR_VERSION = 1;

const QR_SECRET = process.env.OUTPASS_QR_SECRET;

const getQRSecret = () => {
  if (!QR_SECRET || Buffer.byteLength(QR_SECRET, "utf8") < 32) {
    throw new Error("OUTPASS_QR_SECRET must contain at least 32 bytes.");
  }

  return QR_SECRET;
};

const sign = (data) =>
  crypto.createHmac("sha256", getQRSecret()).update(data).digest("base64url");

const getISTDay = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const getValidityWindow = (outDate) => {
  const date = new Date(outDate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid outpass date.");
  }

  const day = getISTDay(date);

  return {
    validFrom: new Date(`${day}T09:15:00+05:30`),
    expiresAt: new Date(`${day}T18:00:00+05:30`),
  };
};

// Prepare a new signed static QR token.
// This function DOES NOT update the database.
const createQRToken = (outpass, now = new Date()) => {
  if (!outpass?._id || !outpass?.outDate) {
    throw new Error("Outpass ID and date are required.");
  }

  const { validFrom, expiresAt } = getValidityWindow(outpass.outDate);

  if (now >= expiresAt) {
    throw new Error("The QR validity window has expired.");
  }

  const payload = {
    type: QR_TYPE,
    version: QR_VERSION,
    outpassId: String(outpass._id),
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Math.floor(now.getTime() / 1000),
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    qrGeneratedAt: now,
    qrValidFrom: validFrom,
    qrExpiresAt: expiresAt,
  };
};

// Verify signature and expiry.
// Database approval/revocation checks are separate.
const verifyQRSignature = (token, now = new Date()) => {
  try {
    if (typeof token !== "string" || token.length > 4096) {
      return { valid: false, message: "Invalid QR token." };
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return { valid: false, message: "Malformed QR token." };
    }

    const [encodedPayload, receivedSignature] = parts;
    const expectedSignature = sign(encodedPayload);

    const actual = Buffer.from(receivedSignature, "base64url");

    const expected = Buffer.from(expectedSignature, "base64url");

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      return { valid: false, message: "Invalid QR signature." };
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (
      payload.type !== QR_TYPE ||
      payload.version !== QR_VERSION ||
      !/^[a-f0-9]{24}$/i.test(payload.outpassId || "") ||
      typeof payload.nonce !== "string" ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.issuedAt >= payload.expiresAt
    ) {
      return { valid: false, message: "Invalid QR payload." };
    }

    const currentTime = Math.floor(now.getTime() / 1000);

    if (currentTime >= payload.expiresAt) {
      return { valid: false, message: "QR has expired." };
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

module.exports = Object.freeze({
  createQRToken,
  verifyQRSignature,
  getValidityWindow,
  getISTDay,
});
