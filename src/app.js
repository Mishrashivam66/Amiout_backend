const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const errorHandler = require("./middlewares/error.middleware");

// ==========================================
// ROUTES
// ==========================================

const notificationRoutes = require("./modules/notification/routes/notificationRoutes");
const authRoutes = require("./modules/auth/routes/auth.routes");
const mentorAuthRoutes = require("./modules/auth/routes/mentor.routes");

const studentRoutes = require("./modules/student/routes");
const mentorRoutes = require("./modules/mentor/routes");

const { academicRoutes } = require("./modules/academic");
const adminRoutes = require("./modules/admin");
const adminAuthRoutes = require("./modules/auth/routes/admin.routes");
const outpassRoutes = require("./modules/outpass/routes");

// ==========================================
// APP
// ==========================================

const app = express();

// ==========================================
// MIDDLEWARE
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
  res.status(200).json({
    success: true,
    message: "🚀 AMIOUT Backend Running Successfully",
    environment: process.env.NODE_ENV,
  });
});

// ==========================================
// API ROUTES
// ==========================================

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/auth/mentor", mentorAuthRoutes);

app.use("/api/v1/student", studentRoutes);

app.use("/api/v1/auth/admin", adminAuthRoutes);

app.use("/api/v1/mentor", mentorRoutes);

app.use("/api/v1/academic", academicRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use("/api/v1/outpass", outpassRoutes);

app.use("/api/v1/notifications", notificationRoutes);

app.use("/api/v1/student", studentRoutes);

// ==========================================
// 404
// ==========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use(errorHandler);

module.exports = app;