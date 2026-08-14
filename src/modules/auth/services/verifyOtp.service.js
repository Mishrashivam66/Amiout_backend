const {
  findOTP,
  findUserByEmail,
  saveUser,
  deleteOTP,
  incrementOtpAttempts,
} = require("../repositories/auth.repository");

const { sendEmail, generateWelcomeTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// VERIFY OTP SERVICE
// ==========================================

const verifyOtpService = async (email, otp, purpose = "EMAIL_VERIFICATION") => {
  // ==========================================
  // FIND OTP
  // ==========================================

  const otpRecord = await findOTP(email, purpose);

  if (!otpRecord) {
    throw new Error(AUTH_MESSAGES.INVALID_OTP);
  }

  // ==========================================
  // OTP EXPIRY
  // ==========================================

  if (otpRecord.expiresAt < new Date()) {
    await deleteOTP(email, purpose);

    throw new Error("OTP has expired.");
  }

  // ==========================================
  // MAX ATTEMPTS
  // ==========================================

  if (otpRecord.attempts >= 5) {
    throw new Error("Maximum OTP attempts exceeded.");
  }

  // ==========================================
  // OTP MATCH
  // ==========================================

  if (otpRecord.otp !== otp) {
    await incrementOtpAttempts(otpRecord._id);

    throw new Error(AUTH_MESSAGES.INVALID_OTP);
  }

  // ==========================================
  // FIND USER
  // ==========================================

  const user = await findUserByEmail(email);

  if (!user) {
    throw new Error(AUTH_MESSAGES.USER_NOT_FOUND);
  }

  // ==========================================
  // EMAIL VERIFICATION
  // ==========================================

  if (purpose === "EMAIL_VERIFICATION") {
    user.isVerified = true;

    await saveUser(user);

    await sendEmail({
      to: user.email,

      subject: "Welcome to AMIOUT",

      html: generateWelcomeTemplate({
        name: user.name,
      }),
    });
  }

  // ==========================================
  // DELETE OTP
  // ==========================================

  await deleteOTP(email, purpose);

  // ==========================================
  // RESPONSE
  // ==========================================

  return {
    success: true,

    message: AUTH_MESSAGES.OTP_VERIFIED,
  };
};

module.exports = verifyOtpService;
