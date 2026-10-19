"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

const errorHandler = require("./middlewares/error.middleware");

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

const authRoutes = require("./modules/auth/routes/auth.routes");

const mentorAuthRoutes = require("./modules/auth/routes/mentor.routes");

const adminAuthRoutes = require("./modules/auth/routes/admin.routes");

// ==========================================
// STUDENT ROUTES
// ==========================================

const studentRoutes = require("./modules/student/routes");

// ==========================================
// FACULTY ROUTES
// ==========================================

const mentorRoutes = require("./modules/mentor/routes");

const coordinatorRoutes = require("./modules/mentor/routes/coordinatorRoutes");

// ==========================================
// HOD & HOI ROUTES
// ==========================================

const hodRoutes = require("./modules/mentor/routes/hodRoutes");

const hoiRoutes = require("./modules/mentor/routes/hoiRoutes");

// ==========================================
// ADMIN ROUTES
// ==========================================

const adminRoutes = require("./modules/admin");

const outpassMonitoringRoutes = require("./modules/admin/routes/outpassMonitoring.routes");

// ==========================================
// SUPER ADMIN ROUTES
// ==========================================

const superAdminRoutes = require("./modules/superAdmin/routes/superAdmin.routes");

// ==========================================
// ACADEMIC ROUTES
// ==========================================

const { academicRoutes } = require("./modules/academic");

// ==========================================
// OUTPASS ROUTES
// ==========================================

const outpassRoutes = require("./modules/outpass/routes");

// ==========================================
// NOTIFICATION ROUTES
// ==========================================

const notificationRoutes = require("./modules/notification/routes/notificationRoutes");

// ==========================================
// INITIALIZE EXPRESS APPLICATION
// ==========================================

const app = express();

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================

app.use(cookieParser());

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.options("*", cors());

app.use(helmet());

app.use(compression());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "AMIOUT Backend Running Successfully",
    environment: process.env.NODE_ENV,
  });
});

// ==========================================
// COMMON AUTHENTICATION
// ==========================================

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/auth/mentor", mentorAuthRoutes);

app.use("/api/v1/auth/admin", adminAuthRoutes);

// ==========================================
// SUPER ADMIN
//
// Only SUPER_ADMIN may create/manage Admins.
//
// Authorization is enforced inside
// superAdmin.routes.js and the service.
// ==========================================

app.use("/api/v1/super-admin", superAdminRoutes);

// ==========================================
// ADMIN OUTPASS MONITORING
// ==========================================

app.use("/api/v1/admin/outpasses", outpassMonitoringRoutes);

// ==========================================
// ADMIN MODULE
//
// Mounted once only.
// ==========================================

app.use("/api/v1/admin", adminRoutes);

// ==========================================
// STUDENT MODULE
// ==========================================

app.use("/api/v1/student", studentRoutes);

// ==========================================
// MENTOR MODULE
// ==========================================

app.use("/api/v1/mentor", mentorRoutes);

// ==========================================
// COORDINATOR MODULE
// ==========================================

app.use("/api/v1/coordinator", coordinatorRoutes);

// ==========================================
// HOD MODULE
// ==========================================

app.use("/api/v1/hod", hodRoutes);

// ==========================================
// HOI MODULE
// ==========================================

app.use("/api/v1/hoi", hoiRoutes);

// ==========================================
// ACADEMIC MODULE
// ==========================================

app.use("/api/v1/academic", academicRoutes);

// ==========================================
// OUTPASS MODULE
// ==========================================

app.use("/api/v1/outpass", outpassRoutes);

// ==========================================
// NOTIFICATIONS
// ==========================================

app.use("/api/v1/notifications", notificationRoutes);

// ==========================================
// 404 - ROUTE NOT FOUND
// ==========================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use(errorHandler);

// ==========================================
// EXPORT EXPRESS APPLICATION
// ==========================================

module.exports = app;
