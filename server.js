require("./src/config/env");

const app = require("./src/app");
const connectDatabase = require("./src/config/db");

// ==========================================
// PORT
// ==========================================

const PORT = process.env.PORT || 5000;

// ==========================================
// START SERVER
// ==========================================

const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
//       console.log(`
// =========================================
// 🚀 AMIOUT SERVER STARTED
// =========================================
// PORT : ${PORT}
// URL  : http://localhost:${PORT}
// MODE : ${process.env.NODE_ENV}
// =========================================
// `)
;

    });
  } catch (error) {
    console.error("Server Startup Error:", error.message);
    process.exit(1);
  }
};

startServer();
