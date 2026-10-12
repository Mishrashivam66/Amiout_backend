"use strict";

const crypto = require("crypto");

const {
  findUserByEnrollment,
  findUserByMobile,
  createUser,
  createOTP,
  deleteOTP,
} = require("../repositories/auth.repository");

const {
  findAccountByEmail,
  normalizeEmail,
} = require("../repositories/commonAuth.repository");

const AppError = require("../../../utils/AppError");

const StudentProfile = require("../../student/models/StudentProfile");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// GENERATE SECURE OTP
// ==========================================

const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

// ==========================================
// REGISTER STUDENT
// ==========================================

const registerService = async (payload = {}) => {
  const {
    name,
    email,
    enrollmentNo,
    mobileNumber,
    course,
    branch,
    semester,
    password,
  } = payload;

  // ========================================
  // NORMALIZE EMAIL
  // ========================================

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AppError("Email is required.", 400);
  }

  // ========================================
  // CHECK EMAIL ACROSS ALL ACCOUNT MODELS
  // ========================================

  const existingAccount = await findAccountByEmail(normalizedEmail);

  if (existingAccount) {
    throw new AppError("An account already exists with this email.", 409);
  }

  // ========================================
  // CHECK DUPLICATE ENROLLMENT
  // ========================================

  const existingEnrollment = await findUserByEnrollment(enrollmentNo);

  if (existingEnrollment) {
    throw new AppError("Enrollment number already exists.", 409);
  }

  // ========================================
  // CHECK DUPLICATE MOBILE
  // ========================================

  const existingMobile = await findUserByMobile(mobileNumber);

  if (existingMobile) {
    throw new AppError("Mobile number already exists.", 409);
  }

  // ========================================
  // CREATE STUDENT ACCOUNT
  // ========================================

  // Only explicitly allowed student fields
  // are forwarded. Public registration
  // cannot assign ADMIN or faculty roles.

  const user = await createUser({
    name,
    email: normalizedEmail,
    enrollmentNo,
    mobileNumber,
    course,
    branch,
    semester,
    password,
    role: "STUDENT",
  });

  // ========================================
  // CREATE STUDENT PROFILE
  // ========================================

  await StudentProfile.create({
    user: user._id,
  });

  // ========================================
  // REMOVE PREVIOUS VERIFICATION OTP
  // ========================================

  await deleteOTP(normalizedEmail, "EMAIL_VERIFICATION");

  // ========================================
  // GENERATE OTP
  // ========================================

  const otp = generateOTP();

  // ========================================
  // SAVE OTP
  // ========================================

  await createOTP({
    email: normalizedEmail,
    accountType: "STUDENT",
    otp,
    purpose: "EMAIL_VERIFICATION",
  });

  // ========================================
  // SEND VERIFICATION EMAIL
  // ========================================

  await sendEmail({
    to: normalizedEmail,
    subject: "Verify Your AMIOUT Email",
    html: generateOtpTemplate({
      name: user.name,
      otp,
      purpose: "EMAIL_VERIFICATION",
    }),
  });

  // ========================================
  // RESPONSE
  // ========================================

  return {
    success: true,
    message: AUTH_MESSAGES.REGISTER_SUCCESS,
    userId: user._id,
  };
};

// ==========================================
// EXPORT
// ==========================================

module.exports = registerService;
