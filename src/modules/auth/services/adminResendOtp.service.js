"use strict";

const { deleteOTP, createOTP } = require("../repositories/auth.repository");

const { findAdminByEmail } = require("../repositories/admin.repository");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// RESEND OTP
// ==========================================

const adminResendOtpService = async (email, purpose = "EMAIL_VERIFICATION") => {
  // ==========================================
  // FIND ADMIN
  // ==========================================

  const admin = await findAdminByEmail(email);

  if (!admin) {
    throw new Error("Admin not found.");
  }

  // ==========================================
  // DELETE OLD OTP
  // ==========================================

  await deleteOTP(email, purpose);

  // ==========================================
  // GENERATE OTP
  // ==========================================

  const otp = generateOTP();

  await createOTP({
    email,
    otp,
    purpose,
  });

  // ==========================================
  // SEND EMAIL
  // ==========================================

  await sendEmail({
    to: admin.email,
    subject: "Verify Your Email",
    html: generateOtpTemplate({
      name: admin.name,
      otp,
    }),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: "OTP sent successfully.",
  };
};

module.exports = adminResendOtpService;
