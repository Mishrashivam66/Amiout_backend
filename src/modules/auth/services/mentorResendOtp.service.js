const { deleteOTP, createOTP } = require("../repositories/auth.repository");

const { findMentorByEmail } = require("../repositories/mentor.repository");

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

const mentorResendOtpService = async (
  email,
  purpose = "EMAIL_VERIFICATION",
) => {
  const mentor = await findMentorByEmail(email);

  if (!mentor) {
    throw new Error("Mentor not found.");
  }

  await deleteOTP(email, purpose);

  const otp = generateOTP();

  await createOTP({
    email,
    otp,
    purpose,
  });

  await sendEmail({
    to: mentor.email,

    subject:
      purpose === "PASSWORD_RESET"
        ? "AMIOUT Mentor Password Reset OTP"
        : "Verify Your Email",

    html: generateOtpTemplate({
      name: mentor.name,
      otp,
    }),
  });

  return {
    success: true,
    message: "OTP sent successfully.",
  };
};

module.exports = mentorResendOtpService;
