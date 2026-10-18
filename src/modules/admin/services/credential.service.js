"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../../auth/models/User");
const Mentor = require("../../auth/models/Mentor");

const StudentMaster = require("../../academic/models/StudentMaster");

const MentorMaster = require("../../academic/models/MentorMaster");

const CredentialDispatch = require("../models/CredentialDispatch");

const {
  sendEmail,
  generateTemporaryPasswordTemplate,
} = require("../../auth/utils/email");

// ============================================================
// CONFIGURATION
// ============================================================

const ROLE_SCOPES = Object.freeze({
  MENTOR: "GROUP",
  COORDINATOR: "SECTION",
  HOD: "DEPARTMENT",
  HOI: "INSTITUTE",
});

const LOCK_MINUTES = 10;

// ============================================================
// HELPERS
// ============================================================

const clean = (value) => String(value ?? "").trim();

const upper = (value) => clean(value).toUpperCase();

const lower = (value) => clean(value).toLowerCase();

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const sameId = (a, b) => String(a ?? "") === String(b ?? "");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// ============================================================
// SECURE TEMPORARY PASSWORD
// ============================================================

const generateTemporaryPassword = () => {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*?",
  ];

  const allCharacters = groups.join("");

  const password = groups.map((group) => group[crypto.randomInt(group.length)]);

  while (password.length < 18) {
    password.push(allCharacters[crypto.randomInt(allCharacters.length)]);
  }

  for (let i = password.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);

    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join("");
};

// ============================================================
// LOGIN URL
// ============================================================

const getLoginUrl = () => {
  const configuredUrl =
    process.env.AMIOUT_LOGIN_URL ||
    (process.env.CLIENT_URL
      ? `${process.env.CLIENT_URL.trim().replace(/\/+$/, "")}/login`
      : "");

  if (!configuredUrl) {
    fail("CLIENT_URL is not configured.", 500);
  }

  let url;

  try {
    url = new URL(configuredUrl.trim());
  } catch {
    fail("Invalid client login URL.", 500);
  }

  const isLocalhost = ["localhost", "127.0.0.1"].includes(url.hostname);

  if (url.protocol !== "https:" && !(isLocalhost && url.protocol === "http:")) {
    fail("Login URL must use HTTPS outside localhost.", 500);
  }

  return url.toString();
};

// ============================================================
// STUDENT MASTER
// ============================================================

const getStudentIdentity = async (masterId) => {
  const master = await StudentMaster.findById(masterId);

  if (!master || master.isDeleted || !master.isActive) {
    fail("Active StudentMaster record not found.", 404);
  }

  const email = lower(master.email);
  const enrollmentNo = upper(master.enrollmentNumber);

  const mobileNumber = clean(master.mobileNumber);

  if (!email || !isValidEmail(email) || !enrollmentNo || !mobileNumber) {
    fail(
      "Student requires a valid email, enrollment number and mobile number.",
    );
  }

  return {
    accountType: "STUDENT",
    email,
    name: clean(master.name),
    enrollmentNo,
    mobileNumber,
    masterIds: [master._id],
    roles: ["STUDENT"],
    assignments: [],
  };
};

// ============================================================
// FACULTY ROLE ASSIGNMENTS
// ============================================================

const buildFacultyAssignment = (master, role) => {
  const institute = upper(master.institute);
  const department = upper(master.department);
  const program = upper(master.program);

  const semester = Number(master.semester);

  const section = upper(master.section);
  const group = upper(master.group);

  if (!institute) {
    fail("Faculty Institute is required.");
  }

  let scopeId;

  if (role === "MENTOR") {
    if (
      !program ||
      !Number.isInteger(semester) ||
      semester < 1 ||
      !section ||
      !group
    ) {
      fail("MENTOR academic scope is incomplete.");
    }

    scopeId = [institute, program, semester, section, group].join("/");
  } else if (role === "COORDINATOR") {
    if (!program || !Number.isInteger(semester) || semester < 1 || !section) {
      fail("COORDINATOR academic scope is incomplete.");
    }

    scopeId = [institute, program, semester, section].join("/");
  } else if (role === "HOD") {
    if (!department) {
      fail("HOD Department is required.");
    }

    scopeId = `${institute}/${department}`;
  } else if (role === "HOI") {
    scopeId = institute;
  } else {
    fail(`Invalid Faculty role: ${role}`);
  }

  return {
    role,
    scopeType: ROLE_SCOPES[role],
    scopeId,
    isActive: true,
  };
};

// ============================================================
// FACULTY MASTER
// ============================================================

const getFacultyIdentity = async (masterId) => {
  const selectedMaster = await MentorMaster.findById(masterId);

  if (!selectedMaster || selectedMaster.isDeleted || !selectedMaster.isActive) {
    fail("Active Faculty Master record not found.", 404);
  }

  const email = lower(selectedMaster.mentorEmail);

  const facultyId = upper(selectedMaster.facultyId);

  if (!email || !isValidEmail(email) || !facultyId) {
    fail("Faculty ID and official email are required.");
  }

  const masters = await MentorMaster.find({
    mentorEmail: email,
    isActive: true,
    isDeleted: false,
  });

  if (!masters.length) {
    fail("No active Faculty academic records found.", 404);
  }

  const roles = [];
  const assignments = [];
  const assignmentKeys = new Set();

  for (const master of masters) {
    if (upper(master.facultyId) !== facultyId) {
      fail("Conflicting Faculty IDs found for the same email.", 409);
    }

    const masterRoles = unique((master.roles || []).map(upper));

    if (!masterRoles.length) {
      fail("Faculty record has no assigned role.");
    }

    for (const role of masterRoles) {
      if (!ROLE_SCOPES[role]) {
        fail(`Unsupported Faculty role: ${role}`);
      }

      const assignment = buildFacultyAssignment(master, role);

      const key = [
        assignment.role,
        assignment.scopeType,
        assignment.scopeId,
      ].join("|");

      if (!assignmentKeys.has(key)) {
        assignmentKeys.add(key);
        assignments.push(assignment);
      }

      roles.push(role);
    }
  }

  return {
    accountType: "FACULTY",
    email,
    name: clean(selectedMaster.name),
    facultyId,
    designation: clean(selectedMaster.designation),
    department: upper(selectedMaster.department),
    masterIds: masters.map((master) => master._id),
    roles: unique(roles),
    assignments,
    masters,
  };
};

// ============================================================
// EXISTING ACCOUNT LOOKUP
// ============================================================

const findExistingAccount = async (identity) => {
  if (identity.accountType === "STUDENT") {
    const byEmail = await User.findOne({
      email: identity.email,
    });

    const byEnrollment = await User.findOne({
      enrollmentNo: identity.enrollmentNo,
    });

    if (byEmail && byEnrollment && !sameId(byEmail._id, byEnrollment._id)) {
      fail("Student email and enrollment belong to different accounts.", 409);
    }

    const account = byEmail || byEnrollment;

    if (
      account &&
      (lower(account.email) !== identity.email ||
        upper(account.enrollmentNo) !== identity.enrollmentNo)
    ) {
      fail("Existing Student account identity does not match.", 409);
    }

    return account;
  }

  const byEmail = await Mentor.findOne({
    email: identity.email,
  });

  const byEmployeeId = await Mentor.findOne({
    employeeId: identity.facultyId,
  });

  if (byEmail && byEmployeeId && !sameId(byEmail._id, byEmployeeId._id)) {
    fail("Faculty email and ID belong to different accounts.", 409);
  }

  const account = byEmail || byEmployeeId;

  if (
    account &&
    (lower(account.email) !== identity.email ||
      upper(account.employeeId) !== identity.facultyId)
  ) {
    fail("Existing Faculty login identity does not match.", 409);
  }

  return account;
};

// ============================================================
// CREATE FIRST-TIME ACCOUNT
// ============================================================

const createAccount = async (identity, temporaryPassword) => {
  if (identity.accountType === "STUDENT") {
    return User.create({
      name: identity.name,
      email: identity.email,
      enrollmentNo: identity.enrollmentNo,
      mobileNumber: identity.mobileNumber,

      password: temporaryPassword,
      role: "STUDENT",

      isVerified: true,
      isActive: false,
      mustChangePassword: true,
    });
  }

  const primaryRole = identity.roles[0];

  return Mentor.create({
    name: identity.name,
    email: identity.email,
    employeeId: identity.facultyId,

    designation: identity.designation,
    department: identity.department,

    password: temporaryPassword,

    role: primaryRole,
    roles: identity.roles,
    roleAssignments: identity.assignments,

    isVerified: true,
    isActive: false,
    mustChangePassword: true,
  });
};

// ============================================================
// LINK FACULTY MASTERS
// ============================================================

const linkFacultyMasters = async (identity, accountId) => {
  if (identity.accountType !== "FACULTY") {
    return;
  }

  for (const master of identity.masters) {
    if (master.mentorUser && !sameId(master.mentorUser, accountId)) {
      fail("Faculty academic record is linked to another login account.", 409);
    }
  }

  await MentorMaster.updateMany(
    {
      _id: {
        $in: identity.masterIds,
      },
      $or: [{ mentorUser: null }, { mentorUser: accountId }],
    },
    {
      $set: {
        mentorUser: accountId,
      },
    },
  );
};

// ============================================================
// RESERVE SEND ATTEMPT
// ============================================================

const reserveDispatch = async (identity) => {
  try {
    await CredentialDispatch.findOneAndUpdate(
      {
        accountType: identity.accountType,
        email: identity.email,
      },
      {
        $setOnInsert: {
          status: "PENDING",
        },
      },
      {
        upsert: true,
      },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  const current = await CredentialDispatch.findOne({
    accountType: identity.accountType,
    email: identity.email,
  });

  if (current?.status === "SENT") {
    fail(
      "Initial credentials were already sent. Use Forgot Password if needed.",
      409,
    );
  }

  const staleBefore = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);

  const dispatch = await CredentialDispatch.findOneAndUpdate(
    {
      accountType: identity.accountType,
      email: identity.email,

      $or: [
        {
          status: {
            $in: ["PENDING", "FAILED"],
          },
        },
        {
          status: "SENDING",
          lastAttemptAt: {
            $lt: staleBefore,
          },
        },
      ],
    },
    {
      $set: {
        status: "SENDING",
        lastAttemptAt: new Date(),
        lastError: "",
      },

      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
    },
  );

  if (!dispatch) {
    fail("Credential sending is already in progress.", 409);
  }

  return dispatch;
};

// ============================================================
// SEND INITIAL CREDENTIALS
// ============================================================

const sendCredentials = async (accountType, masterId) => {
  if (!mongoose.isValidObjectId(masterId)) {
    fail("Invalid Master record ID.");
  }

  const type = upper(accountType);

  if (!["STUDENT", "FACULTY"].includes(type)) {
    fail("Invalid account type.");
  }

  // Validate master data and roles before
  // reserving an email delivery attempt.

  const identity =
    type === "STUDENT"
      ? await getStudentIdentity(masterId)
      : await getFacultyIdentity(masterId);

  const loginUrl = getLoginUrl();

  // Never reset a pre-existing active
  // account's password.

  const existingBeforeDispatch = await findExistingAccount(identity);

  const previousDispatch = await CredentialDispatch.findOne({
    accountType: type,
    email: identity.email,
  });

  if (existingBeforeDispatch) {
    const eligibleFailedInitialAttempt =
      previousDispatch &&
      previousDispatch.accountId &&
      sameId(previousDispatch.accountId, existingBeforeDispatch._id) &&
      previousDispatch.status !== "SENT" &&
      existingBeforeDispatch.isActive === false &&
      existingBeforeDispatch.mustChangePassword === true &&
      !existingBeforeDispatch.lastLogin;

    if (!eligibleFailedInitialAttempt) {
      fail(
        "Faculty/Student login account already exists. Existing passwords will not be reset.",
        409,
      );
    }
  }

  const dispatch = await reserveDispatch(identity);

  let account = existingBeforeDispatch;

  try {
    const temporaryPassword = generateTemporaryPassword();

    if (!account) {
      account = await createAccount(identity, temporaryPassword);

      dispatch.accountId = account._id;
      await dispatch.save();
    } else {
      // Retry only for an undelivered,
      // inactive, never-used initial account.

      account.password = temporaryPassword;
      account.mustChangePassword = true;

      await account.save();
    }

    await linkFacultyMasters(identity, account._id);

    const html = generateTemporaryPasswordTemplate({
      name: identity.name,
      email: identity.email,
      role: identity.roles.join(", "),
      temporaryPassword,
      loginUrl,
    });

    const mailResult = await sendEmail({
      to: identity.email,
      subject: "Your AMIOUT Login Credentials",
      html,
    });

    const accepted = (mailResult.accepted || []).some(
      (email) => lower(email) === identity.email,
    );

    if (!accepted) {
      throw new Error("Email provider did not accept the recipient.");
    }

    // Activate only after the email provider
    // accepts the outgoing welcome message.

    account.isActive = true;
    await account.save();

    dispatch.status = "SENT";
    dispatch.sentAt = new Date();
    dispatch.lastError = "";

    await dispatch.save();

    // Never return the password to the API.

    return {
      success: true,
      message: "Initial login credentials sent successfully.",
      accountType: type,
      email: identity.email,
      status: "SENT",
    };
  } catch (error) {
    // An email attempt can fail after an
    // account was already created.
    // Retain it for controlled retry.

    dispatch.status = "FAILED";
    dispatch.lastError = clean(error.message).slice(0, 300);

    await dispatch.save();

    throw error;
  }
};

// ============================================================
// GET CREDENTIAL DELIVERY STATUS
// ============================================================

const getCredentialStatuses = async () => {
  return CredentialDispatch.find()
    .select("accountType email status attempts sentAt lastAttemptAt lastError")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = Object.freeze({
  sendCredentials,
  getCredentialStatuses,
});
