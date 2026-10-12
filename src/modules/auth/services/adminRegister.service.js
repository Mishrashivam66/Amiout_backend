"use strict";

const crypto = require("crypto");

const { createAdmin } = require("../repositories/admin.repository");

const { createOTP, deleteOTP } = require("../repositories/auth.repository");

const {
  findAccountByEmail,
  normalizeEmail,
} = require("../repositories/commonAuth.repository");

const {
  sendEmail,
  generateAccountActivationTemplate,
} = require("../utils/email");

const AppError = require("../../../utils/AppError");

// ==========================================
// GENERATE SECURE OTP
// ==========================================

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

// ==========================================
// ADMIN REGISTER SERVICE
// ==========================================

const adminRegisterService = async (payload = {}, actor = null) => {
  // ========================================
  // AUTHORIZATION
  // ========================================

  if (!actor || actor.accountType !== "ADMIN" || actor.role !== "ADMIN") {
    throw new AppError(
      "Only an authorized Admin can create Admin accounts.",
      403,
    );
  }

  // ========================================
  // INPUT
  // ========================================

  const name = String(payload.name || "").trim();

  const email = normalizeEmail(payload.email);

  if (!name || !email) {
    throw new AppError("Name and email are required.", 400);
  }

  // ========================================
  // EMAIL DOMAIN
  // ========================================

  const allowedDomains = ["@s.amity.edu", "@gwa.amity.edu"];

  const isAllowedDomain = allowedDomains.some((domain) =>
    email.endsWith(domain),
  );

  if (!isAllowedDomain) {
    throw new AppError("Only authorized Amity email domains are allowed.", 400);
  }

  // ========================================
  // DUPLICATE EMAIL CHECK
  // ========================================

  const existingAccount = await findAccountByEmail(email);

  if (existingAccount) {
    throw new AppError("An account already exists with this email.", 409);
  }

  // ========================================
  // CREATE PENDING ADMIN
  // ========================================

  // Admin schema currently requires a
  // password. Generate a random secret
  // which is NOT sent to the user.
  //
  // After OTP verification, the activation
  // service will establish the first-login
  // credential.

  const pendingPassword = crypto.randomBytes(32).toString("base64url");

  const admin = await createAdmin({
    name,
    email,
    password: pendingPassword,
    role: "ADMIN",
    roles: ["ADMIN"],
    isVerified: false,
    isActive: true,
  });

  // ========================================
  // CREATE ACTIVATION OTP
  // ========================================

  const otp = generateOTP();

  try {
    await deleteOTP(email, "ACCOUNT_ACTIVATION");

    await createOTP({
      email,
      accountType: "ADMIN",
      otp,
      purpose: "ACCOUNT_ACTIVATION",
    });

    // ======================================
    // SEND OTP EMAIL
    // ======================================

    await sendEmail({
      to: email,
      subject: "Activate Your AMIOUT Admin Account",
      html: generateAccountActivationTemplate({
        name,
        otp,
        role: "ADMIN",
      }),
    });
  } catch (error) {
    // The account remains unverified.
    // A resend/recovery flow must handle
    // incomplete provisioning.

    throw error;
  }

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message: "Admin account created. Activation OTP sent to registered email.",
    adminId: admin._id,
  };
};

module.exports = adminRegisterService;
