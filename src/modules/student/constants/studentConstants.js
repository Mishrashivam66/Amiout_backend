
const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  HOLD: "HOLD",
});
const REQUIRED_PROFILE_FIELDS = Object.freeze([
  "parentName",
  "parentEmail",
  "parentMobileNumber",
]);
const OUTPASS = Object.freeze({
  MAX_REQUESTS_PER_DAY: 1,
  ALLOW_CANCEL_BEFORE_APPROVAL: true,
});

const PROFILE_STATUS = Object.freeze({
  INCOMPLETE: "INCOMPLETE",
  COMPLETED: "COMPLETED",
  LOCKED: "LOCKED",
});

const PROFILE_LOCK_FIELDS = Object.freeze([
  "parentName",
  "parentEmail",
  "parentMobileNumber",
]);

const REASON = Object.freeze({
  MIN_LENGTH: 10,
  MAX_LENGTH: 300,
});

const DESTINATION = Object.freeze({
  MIN_LENGTH: 2,
  MAX_LENGTH: 100,
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

const DASHBOARD = Object.freeze({
  RECENT_ACTIVITY_LIMIT: 5,
  NOTIFICATION_LIMIT: 5,
});

const GREETINGS = Object.freeze({
  MORNING: "Good Morning",
  AFTERNOON: "Good Afternoon",
  EVENING: "Good Evening",
});

module.exports = {
  ACCOUNT_STATUS,
  PROFILE_STATUS,
  PROFILE_LOCK_FIELDS,
  REQUIRED_PROFILE_FIELDS,
  REASON,
  DESTINATION,
  PAGINATION,
  DASHBOARD,
  GREETINGS,
  OUTPASS,
};
