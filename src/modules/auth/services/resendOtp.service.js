const {
  findUserByEmail,
  deleteOTP,
  createOTP,
} = require("../repositories/auth.repository");

const { sendEmail, generateOtpTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// RESEND OTP SERVICE
// ==========================================

const resendOtpService = async (email, purpose = "EMAIL_VERIFICATION") => {
  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // ACCOUNT ALREADY VERIFIED
  // (Only for Email Verification)
  // ==========================================

  if (purpose === "EMAIL_VERIFICATION" && user.isVerified) {
    throw new Error("Your email is already verified.");
  }

  // ==========================================
  // DELETE OLD OTP
  // ==========================================

  await deleteOTP(email, purpose);

  // ==========================================
  // GENERATE NEW OTP
  // ==========================================

  const otp = generateOTP();

  // ==========================================
  // SAVE OTP
  // ==========================================

  await createOTP({
    email,
    otp,
    purpose,
  });

  // ==========================================
  // EMAIL SUBJECT
  // ==========================================

  const subject =
    purpose === "EMAIL_VERIFICATION"
      ? "AMIOUT Email Verification OTP"
      : "AMIOUT Password Reset OTP";

  // ==========================================
  // SEND EMAIL
  // ==========================================

  await sendEmail({
    to: email,

    subject,

    html: generateOtpTemplate({
      name: user.name,
      otp,
    }),
  });

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,
    message: AUTH_MESSAGES.OTP_SENT,
  };
};

module.exports = resendOtpService;
