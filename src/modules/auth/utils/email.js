"use strict";

const nodemailer = require("nodemailer");

const { AUTH_CONSTANTS } = require("../constants");

// ==========================================
// EMAIL CONFIGURATION
// ==========================================

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// ==========================================
// HTML ESCAPING
// ==========================================

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });

// ==========================================
// COMMON EMAIL LAYOUT
// ==========================================

const emailLayout = (content) => `
  <div style="
    background:#f1f5f9;
    padding:32px 16px;
    font-family:Arial,sans-serif;
    color:#0f172a;
  ">
    <div style="
      max-width:560px;
      margin:0 auto;
      background:#ffffff;
      border-radius:12px;
      padding:32px;
      border:1px solid #e2e8f0;
    ">
      <h2 style="
        color:#2563eb;
        margin-top:0;
      ">
        AMIOUT
      </h2>

      ${content}

      <hr style="
        border:none;
        border-top:1px solid #e2e8f0;
        margin:28px 0 16px;
      " />

      <p style="
        color:#64748b;
        font-size:12px;
        line-height:1.6;
      ">
        AMIOUT — Smart Campus Outpass
        Management System
      </p>
    </div>
  </div>
`;

// ==========================================
// SEND EMAIL
// ==========================================

const sendEmail = async ({ to, subject, html }) => {
  if (!to || !subject || !html) {
    throw new Error("Email recipient, subject and content are required.");
  }

  return transporter.sendMail({
    from: `"AMIOUT" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ==========================================
// GENERATE OTP EMAIL TEMPLATE
// ==========================================

const generateOtpTemplate = ({ name, otp, purpose = "EMAIL_VERIFICATION" }) => {
  const safeName = escapeHtml(name);
  const safeOtp = escapeHtml(otp);

  const heading =
    purpose === "ACCOUNT_ACTIVATION"
      ? "Activate Your AMIOUT Account"
      : purpose === "PASSWORD_RESET"
        ? "Password Reset Verification"
        : "Email Verification";

  const expiryMinutes = AUTH_CONSTANTS.OTP_EXPIRY_MINUTES;

  return emailLayout(`
    <h2>${heading}</h2>

    <p>Hello <strong>${safeName}</strong>,</p>

    <p>
      Your AMIOUT verification code is:
    </p>

    <div style="
      text-align:center;
      background:#eff6ff;
      padding:20px;
      border-radius:8px;
      margin:20px 0;
    ">
      <span style="
        font-size:32px;
        font-weight:bold;
        letter-spacing:8px;
        color:#2563eb;
      ">
        ${safeOtp}
      </span>
    </div>

    <p>
      This code is valid for
      <strong>${expiryMinutes} minutes</strong>.
    </p>

    <p>
      Do not share this code with anyone.
    </p>

    <p>
      If you did not request this,
      please ignore this email.
    </p>
  `);
};

// ==========================================
// PASSWORD RESET TEMPLATE
// ==========================================

const generateResetPasswordTemplate = ({ name, resetLink }) => {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(resetLink);

  return emailLayout(`
    <h2>Reset Your Password</h2>

    <p>Hello <strong>${safeName}</strong>,</p>

    <p>
      We received a request to reset
      your AMIOUT account password.
    </p>

    <p style="margin:24px 0;">
      <a
        href="${safeLink}"
        style="
          display:inline-block;
          padding:12px 20px;
          background:#2563eb;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
        "
      >
        Reset Password
      </a>
    </p>

    <p>
      This link will expire in
      <strong>15 minutes</strong>.
    </p>

    <p>
      If you did not request a reset,
      you can ignore this email.
    </p>
  `);
};

// ==========================================
// WELCOME EMAIL TEMPLATE
// ==========================================

const generateWelcomeTemplate = ({ name }) => {
  const safeName = escapeHtml(name);

  return emailLayout(`
    <h2>Welcome to AMIOUT!</h2>

    <p>Hello <strong>${safeName}</strong>,</p>

    <p>
      Your email has been verified
      successfully.
    </p>

    <p>
      You can now sign in to the
      AMIOUT Smart Campus Outpass
      Management System.
    </p>
  `);
};

// ==========================================
// ACCOUNT ACTIVATION OTP TEMPLATE
// ==========================================

const generateAccountActivationTemplate = ({ name, otp, role }) => {
  const safeRole = escapeHtml(role);

  return emailLayout(`
    <h2>AMIOUT Account Activation</h2>

    <p>
      Hello <strong>${escapeHtml(name)}</strong>,
    </p>

    <p>
      An AMIOUT account has been created
      for you with the role:
      <strong>${safeRole}</strong>.
    </p>

    <p>
      Please verify your email using
      the following OTP:
    </p>

    <div style="
      background:#eff6ff;
      border-radius:8px;
      padding:20px;
      text-align:center;
      margin:20px 0;
    ">
      <span style="
        font-size:32px;
        font-weight:bold;
        letter-spacing:8px;
        color:#2563eb;
      ">
        ${escapeHtml(otp)}
      </span>
    </div>

    <p>
      The OTP is valid for
      <strong>
        ${AUTH_CONSTANTS.OTP_EXPIRY_MINUTES}
        minutes
      </strong>.
    </p>

    <p>
      Once your email is verified,
      you can complete the
      first-time login process.
    </p>

    <p>
      If you did not expect this
      account, contact your
      university administrator.
    </p>
  `);
};

// ==========================================
// TEMPORARY PASSWORD EMAIL TEMPLATE
// ==========================================

const generateTemporaryPasswordTemplate = ({
  name,
  email,
  role,
  temporaryPassword,
  loginUrl,
}) => {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(role);

  const safePassword = escapeHtml(temporaryPassword);

  const safeLoginUrl = escapeHtml(loginUrl);

  return emailLayout(`
    <h2>Your AMIOUT Account Is Ready</h2>

    <p>
      Hello <strong>${safeName}</strong>,
    </p>

    <p>
      Your AMIOUT account has been
      activated successfully.
    </p>

    <p>
      <strong>Role:</strong>
      ${safeRole}
    </p>

    <p>
      <strong>Login Email:</strong>
      ${safeEmail}
    </p>

    <div style="
      background:#f8fafc;
      border:1px solid #e2e8f0;
      border-radius:8px;
      padding:18px;
      margin:20px 0;
    ">
      <p style="margin-top:0;">
        <strong>Temporary Password</strong>
      </p>

      <p style="
        font-size:20px;
        font-family:monospace;
        font-weight:bold;
        word-break:break-all;
      ">
        ${safePassword}
      </p>
    </div>

    <p>
      This is a temporary password.
      You must change it when you
      sign in for the first time.
    </p>

    <p style="margin:24px 0;">
      <a
        href="${safeLoginUrl}"
        style="
          display:inline-block;
          padding:12px 20px;
          background:#2563eb;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
        "
      >
        Login to AMIOUT
      </a>
    </p>

    <p>
      Do not share your password.
      If you did not request this
      account, contact your
      university administrator.
    </p>
  `);
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  sendEmail,

  generateOtpTemplate,
  generateResetPasswordTemplate,
  generateWelcomeTemplate,

  generateAccountActivationTemplate,
  generateTemporaryPasswordTemplate,
};
