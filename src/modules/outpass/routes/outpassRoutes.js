"use strict";

const express = require("express");
const router = express.Router();

const studentController = require("../controllers/studentController");

const { protect } = require("../../../middlewares/auth.middleware");
const authorize = require("../../../middlewares/role.middleware");
const ROLES = require("../../auth/constants/roles");
const { getStudentQR } = require("../controllers/studentQrController");
// All routes below require Student authentication.
router.use(protect);
router.use(authorize(ROLES.STUDENT));

router.post("/apply", studentController.applyOutpass);
router.get("/active", studentController.getActiveOutpass);
router.get("/history", studentController.getHistory);
router.get("/:outpassId", studentController.getOutpassDetails);
router.patch("/:outpassId/cancel", studentController.cancelOutpass);
router.get("/:outpassId/qr", getStudentQR);
module.exports = router;
