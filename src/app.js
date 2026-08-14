console.log("A. app.js started");

const express = require("express");
console.log("B. express loaded");

const cors = require("cors");
console.log("C. cors loaded");

const helmet = require("helmet");
console.log("D. helmet loaded");

const compression = require("compression");
console.log("E. compression loaded");

const morgan = require("morgan");
console.log("F. morgan loaded");

const cookieParser = require("cookie-parser");
console.log("G. cookie-parser loaded");

const errorHandler = require("./middlewares/error.middleware");
console.log("H. error middleware loaded");

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

console.log("Loading notification...");
const notificationRoutes = require("./modules/notification/routes/notificationRoutes");

console.log("Loading auth...");
const authRoutes = require("./modules/auth/routes/auth.routes");

console.log("Loading mentor auth...");
const mentorAuthRoutes = require("./modules/auth/routes/mentor.routes");

console.log("Loading student...");
const studentRoutes = require("./modules/student/routes");

console.log("Loading mentor...");
const mentorRoutes = require("./modules/mentor/routes");

console.log("Loading academic...");
const { academicRoutes } = require("./modules/academic");

console.log("Loading admin...");
const adminRoutes = require("./modules/admin");

console.log("Loading admin auth...");
const adminAuthRoutes = require("./modules/auth/routes/admin.routes");

console.log("Loading outpass...");
const outpassRoutes = require("./modules/outpass/routes");

console.log("All routes loaded.");

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
