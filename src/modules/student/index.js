const express = require("express");

const router = express.Router();

router.use("/dashboard", require("./dashboardRoutes"));

module.exports = router;
