const express = require("express");

const router = express.Router();

const { verifyExitController } = require("../controllers/securityController");

router.patch("/:id/verify-exit", verifyExitController);

module.exports = router;
