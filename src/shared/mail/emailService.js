// ============================================================================
// Project : AMIOUT - Smart Outpass Management System
 * Module  : Shared
 * File    : emailService.js
 * Author  : Shivam Kumar
 * ============================================================================
 * Description:
 * Centralized Email Service
 * Used across Auth, Student, Outpass, Mentor and Admin modules.
// ============================================================================

const nodemailer = require("nodemailer");

// ============================================================================
// Mail Transport
// ============================================================================
const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ============================================================================
// Send Email
// ============================================================================
const sendEmail = async ({ to, subject, html, text = "" }) => {
  const mailOptions = {
    from: `"AMIOUT" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };

  return transporter.sendMail(mailOptions);
};

// ============================================================================
// Verify SMTP Connection
// ============================================================================
const verifyConnection = async () => {
  return transporter.verify();
};

module.exports = Object.freeze({
  sendEmail,
  verifyConnection,
});
