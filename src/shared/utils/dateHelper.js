// ============================================================================
// Project : AMIOUT - Smart Outpass Management System
 * Module  : Shared
 * File    : dateHelper.js
 * Author  : Shivam Kumar
 * ============================================================================
 * Description:
 * Common Date Utility Functions
// ============================================================================

const {
  APPLICATION_WINDOW,
  NON_WORKING_DAYS,
} = require("../../modules/outpass/constants/timeSlots");

// ============================================================================
// Get Start Of Day
// ============================================================================
const getStartOfDay = (date = new Date()) => {
  const start = new Date(date);

  start.setHours(0, 0, 0, 0);

  return start;
};

// ============================================================================
// Get End Of Day
// ============================================================================
const getEndOfDay = (date = new Date()) => {
  const end = new Date(date);

  end.setHours(23, 59, 59, 999);

  return end;
};

// ============================================================================
// Check Sunday
// ============================================================================
const isSunday = (date = new Date()) => {
  const day = date
    .toLocaleDateString("en-US", {
      weekday: "long",
    })
    .toUpperCase();

  return NON_WORKING_DAYS.includes(day);
};

// ============================================================================
// Check Today
// ============================================================================
const isToday = (date) => {
  if (!date) return false;

  const today = new Date();

  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// ============================================================================
// Check Apply Window
 * Allowed: 10:00 AM - 02:00 PM
// ============================================================================
const isWithinApplicationWindow = (date = new Date()) => {
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  const startMinutes =
    APPLICATION_WINDOW.START_HOUR * 60 + APPLICATION_WINDOW.START_MINUTE;

  const endMinutes =
    APPLICATION_WINDOW.END_HOUR * 60 + APPLICATION_WINDOW.END_MINUTE;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

// ============================================================================
// Format Date
 * Example:
 * 05-08-2026
// ============================================================================
const formatDate = (date) => {
  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN").format(new Date(date));
};

// ============================================================================
// Format Date & Time
 * Example:
 * 05 Aug 2026, 10:30 AM
// ============================================================================
const formatDateTime = (date) => {
  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
};

module.exports = Object.freeze({
  getStartOfDay,
  getEndOfDay,
  isSunday,
  isToday,
  isWithinApplicationWindow,
  formatDate,
  formatDateTime,
});
