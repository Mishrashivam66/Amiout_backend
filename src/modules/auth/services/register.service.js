const {
  findUserByEmail,
  findUserByEnrollment,
  findUserByMobile,
  createUser,
  createOTP,
  deleteOTP,
} = require("../repositories/auth.repository");
const User = require("../models/User");

const AppError = require("../../../utils/AppError");
const StudentProfile = require("../../student/models/StudentProfile");
const { sendEmail, generateOtpTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// REGISTER SERVICE
// ==========================================

const registerService = async (payload) => {
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

  // ==========================================
  // CHECK EXISTING USER
  // ==========================================

  existingUser = await findUserByEmail(email);

  if (existingUser) {
    throw new AppError("User already exists with this email.", 409);
  }
  // ==========================================
  // CHECK DUPLICATE ENROLLMENT
  // ==========================================
  const existingEnrollment = await findUserByEnrollment(enrollmentNo);

  if (existingEnrollment) {
    throw new AppError("Enrollment number already exists.", 409);
  }

  const existingMobile = await findUserByMobile(mobileNumber);

  if (existingMobile) {
    throw new AppError("Mobile number already exists.", 409);
  }

  // ==========================================
  // CREATE USER
  // ==========================================

  const user = await createUser({
    name,

    email,

    enrollmentNo,

    mobileNumber,

    course,

    branch,

    semester,

    password,
  });

  if (user.role === "STUDENT") {
    await StudentProfile.create({
      user: user._id,
    });
  }

  // ==========================================
  // REMOVE OLD OTP
  // ==========================================

  await deleteOTP(email, "EMAIL_VERIFICATION");

  // ==========================================
  // GENERATE NEW OTP
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

    subject: "Verify Your Email",

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

    message: AUTH_MESSAGES.REGISTER_SUCCESS,

    userId: user._id,
  };
};

module.exports = registerService;
