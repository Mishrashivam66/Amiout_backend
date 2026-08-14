const mongoose = require("mongoose");

// ==========================================
// CONNECT DATABASE
// ==========================================

const connectDatabase = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DB_NAME,
    });

    console.log(`
=========================================
✅ MongoDB Connected Successfully
=========================================
Database : ${connection.connection.name}
Host     : ${connection.connection.host}
Port     : ${connection.connection.port}
=========================================
`);
  } catch (error) {
    console.error(`
=========================================
❌ MongoDB Connection Failed
=========================================
${error.message}
=========================================
`);

    process.exit(1);
  }
};

module.exports = connectDatabase;
