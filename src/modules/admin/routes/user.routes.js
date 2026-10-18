"use strict";

const express = require("express");

const userController = require("../controllers/user.controller");

const credentialController = require("../controllers/credential.controller");

const { protect } = require("../../../middlewares/auth.middleware");

const authorize = require("../../../middlewares/role.middleware");

const ROLES = require("../../auth/constants/roles");

const router = express.Router();

// ============================================================
// ALL USER MANAGEMENT ROUTES ARE ADMIN ONLY
// ============================================================

router.use(protect, authorize(ROLES.ADMIN));

// ============================================================
// CREDENTIAL MANAGEMENT
// ============================================================

// Imported Student / Faculty listing,
// filter, search, counts and pagination.

router.get(
  "/credentials/candidates",
  credentialController.getCredentialCandidates,
);

// Delivery history.

router.get("/credentials/status", credentialController.getCredentialStatuses);

// Send initial Student login credentials.

router.post(
  "/credentials/students/:id/send",
  credentialController.sendStudentCredentials,
);

// Send initial Faculty login credentials.

router.post(
  "/credentials/faculty/:id/send",
  credentialController.sendFacultyCredentials,
);

// ============================================================
// EXISTING USER MANAGEMENT
// ============================================================

router.get("/", userController.getAllUsers);

router.get("/:id", userController.getUserById);

router.patch("/:id/activate", userController.activateUser);

router.patch("/:id/deactivate", userController.deactivateUser);

module.exports = Object.freeze(router);
