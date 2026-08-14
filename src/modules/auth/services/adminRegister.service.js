"use strict";

const {
  findAdminByEmail,
  createAdmin,
} = require("../repositories/admin.repository");

const { createOTP, deleteOTP } = require("../repositories/auth.repository");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// ADMIN REGISTER SERVICE
// ==========================================

const adminRegisterService = async (payload) => {
  const { name, email, password } = payload;

  // ==========================================
  // REQUIRED FIELDS
  // ==========================================

  if (!name || !email || !password) {
    throw new Error("All fields are required.");
  }

  // ==========================================
  // EMAIL DOMAIN VALIDATION
  // ==========================================

  const allowedDomains = ["@s.amity.edu", "@gwa.amity.edu"];

  const isValid = allowedDomains.some((domain) =>
    email.toLowerCase().endsWith(domain),
  );

  if (!isValid) {
    throw new Error("Only Amity admin email is allowed.");
  }

  // ==========================================
  // CHECK EXISTING ADMIN
  // ==========================================

  const existing = await findAdminByEmail(email);

  if (existing) {
    throw new Error("Admin already exists.");
  }

  // ==========================================
  // CREATE ADMIN
  // ==========================================

  const admin = await createAdmin({
    name,
    email,
    password,
  });

  // ==========================================
  // DELETE OLD OTP
  // ==========================================

  await deleteOTP(email, "EMAIL_VERIFICATION");

  // ==========================================
  // GENERATE OTP
  // ==========================================

  const otp = generateOTP();

  await createOTP({
    email,
    otp,
    purpose: "EMAIL_VERIFICATION",
  });

  // ==========================================
  // SEND EMAIL
  // ==========================================

  await sendEmail({
    to: email,
    subject: "Admin Email Verification",
    html: generateOtpTemplate({
      name,
      otp,
    }),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: "OTP sent successfully. Please verify your email.",
    adminId: admin._id,
  };
};

module.exports = adminRegisterService;
