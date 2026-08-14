"use strict";

const {
  findMentorByEmail,
  createMentor,
} = require("../repositories/mentor.repository");

const { createOTP, deleteOTP } = require("../repositories/auth.repository");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// MENTOR REGISTER SERVICE
// ==========================================

const mentorRegisterService = async (payload) => {
  const { name, email, employeeId, password } = payload;

  // ==========================================
  // REQUIRED FIELDS
  // ==========================================

  if (!name || !email || !employeeId || !password) {
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
    throw new Error("Only Amity mentor email is allowed.");
  }

  // ==========================================
  // CHECK EXISTING MENTOR
  // ==========================================

  const existing = await findMentorByEmail(email);

  if (existing) {
    throw new Error("Mentor already exists.");
  }

  // ==========================================
  // CREATE MENTOR
  // ==========================================

  const mentor = await createMentor({
    name,
    email,
    employeeId,
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

    subject: "Mentor Email Verification",

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

    mentorId: mentor._id,
  };
};

module.exports = mentorRegisterService;
