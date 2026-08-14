const nodemailer = require("nodemailer");

// ============================================================================
// Email Transporter
// ============================================================================

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// ============================================================================
// Send Email
// ============================================================================

const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"AMIOUT" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return info;
  } catch (error) {
    throw error;
  }
};

// ============================================================================
// Generate OTP Email Template
// ============================================================================

const generateOtpTemplate = ({ name, otp }) => {
  return `
    <div style="font-family:Arial,sans-serif;padding:20px">

      <h2>AMIOUT Email Verification</h2>

      <p>Hello <strong>${name}</strong>,</p>

      <p>Your verification code is:</p>

      <h1
        style="
          letter-spacing:8px;
          color:#2563EB;
        "
      >
        ${otp}
      </h1>

      <p>
        This OTP is valid for
        <strong>10 minutes</strong>.
      </p>

      <p>
        If you didn't request this,
        please ignore this email.
      </p>

    </div>
  `;
};

// ============================================================================
// Generate Password Reset Template
// ============================================================================

const generateResetPasswordTemplate = ({ name, resetLink }) => {
  return `
    <div style="font-family:Arial,sans-serif;padding:20px">

      <h2>Reset Your Password</h2>

      <p>Hello <strong>${name}</strong>,</p>

      <p>
        Click the button below to reset your password.
      </p>

      <a
        href="${resetLink}"
        style="
          display:inline-block;
          padding:12px 20px;
          background:#2563EB;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
        "
      >
        Reset Password
      </a>

      <p>
        This link will expire in
        <strong>15 minutes</strong>.
      </p>

    </div>
  `;
};

// ============================================================================
// Generate Welcome Template
// ============================================================================

const generateWelcomeTemplate = ({ name }) => {
  return `
    <div style="font-family:Arial,sans-serif;padding:20px">

      <h2>Welcome to AMIOUT 🎉</h2>

      <p>Hello <strong>${name}</strong>,</p>

      <p>
        Your account has been verified successfully.
      </p>

      <p>
        You can now login and start using
        the Smart Campus Outpass
        Management System.
      </p>

    </div>
  `;
};

module.exports = {
  sendEmail,
  generateOtpTemplate,
  generateResetPasswordTemplate,
  generateWelcomeTemplate,
};
