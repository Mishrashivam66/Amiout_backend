"use strict";

const ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",

  // Faculty hierarchy
  MENTOR: "MENTOR",
  COORDINATOR: "COORDINATOR",
  HOD: "HOD",
  HOI: "HOI",

  SECURITY: "SECURITY",
  STUDENT: "STUDENT",
});

module.exports = ROLES;
