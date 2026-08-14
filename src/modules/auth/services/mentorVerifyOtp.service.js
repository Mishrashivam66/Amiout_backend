const {
  findOTP,
  deleteOTP,
  incrementOtpAttempts,
} = require("../repositories/auth.repository");

const {
  findMentorByEmail,
  updateMentor,
} = require("../repositories/mentor.repository");

const { sendEmail, generateWelcomeTemplate } = require("../utils/email");

const { AUTH_MESSAGES } = require("../constants");

// ==========================================
// VERIFY MENTOR OTP
// ==========================================

const mentorVerifyOtpService = async (
  email,
  otp,
  purpose = "EMAIL_VERIFICATION",
) => {
  // ==========================================
  // FIND OTP
  // ==========================================

  const otpRecord = await findOTP(email, purpose);

  if (!otpRecord) {
    throw new Error(AUTH_MESSAGES.INVALID_OTP);
  }

  // ==========================================
  // OTP EXPIRED
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
  // FIND MENTOR
  // ==========================================

  const mentor = await findMentorByEmail(email);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  // ==========================================
  // VERIFY ACCOUNT
  // ==========================================

  await updateMentor(mentor._id, {
    isVerified: true,
  });

  // ==========================================
  // SEND WELCOME MAIL
  // ==========================================

  await sendEmail({
    to: mentor.email,
    subject: "Welcome to AMIOUT",
    html: generateWelcomeTemplate({
      name: mentor.name,
    }),
  });

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

module.exports = mentorVerifyOtpService;
