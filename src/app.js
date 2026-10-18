"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

// ==========================================
// ERROR HANDLER
// ==========================================

const errorHandler = require("./middlewares/error.middleware");

// ==========================================
// ROUTES
// ==========================================

const notificationRoutes = require("./modules/notification/routes/notificationRoutes");

const authRoutes = require("./modules/auth/routes/auth.routes");

const mentorAuthRoutes = require("./modules/auth/routes/mentor.routes");

const studentRoutes = require("./modules/student/routes");

const mentorRoutes = require("./modules/mentor/routes");

const coordinatorRoutes = require("./modules/mentor/routes/coordinatorRoutes");

// HOD & HOI ROUTES
const hodRoutes = require("./modules/mentor/routes/hodRoutes");
const hoiRoutes = require("./modules/mentor/routes/hoiRoutes");
const outpassMonitoringRoutes = require("./modules/admin/routes/outpassMonitoring.routes");
const { academicRoutes } = require("./modules/academic");

const adminRoutes = require("./modules/admin");

const adminAuthRoutes = require("./modules/auth/routes/admin.routes");

const outpassRoutes = require("./modules/outpass/routes");

// ==========================================
// INITIALIZE EXPRESS
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

app.use(express.urlencoded({ extended: true }));

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
// AUTHENTICATION ROUTES
// ==========================================

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/auth/mentor", mentorAuthRoutes);
app.use("/api/v1/admin/outpasses", outpassMonitoringRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use("/api/v1/auth/admin", adminAuthRoutes);

// ==========================================
// STUDENT & FACULTY ROUTES
// ==========================================

app.use("/api/v1/student", studentRoutes);

app.use("/api/v1/mentor", mentorRoutes);

app.use("/api/v1/coordinator", coordinatorRoutes);

// HOD & HOI
app.use("/api/v1/hod", hodRoutes);

app.use("/api/v1/hoi", hoiRoutes);

// ==========================================
// ACADEMIC & ADMIN ROUTES
// ==========================================

app.use("/api/v1/academic", academicRoutes);

app.use("/api/v1/admin", adminRoutes);

// ==========================================
// OUTPASS ROUTES
// ==========================================

app.use("/api/v1/outpass", outpassRoutes);

// ==========================================
// NOTIFICATION ROUTES
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
// EXPORT APP
// ==========================================

module.exports = app;
