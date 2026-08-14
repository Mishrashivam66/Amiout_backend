const mongoose = require("mongoose");

// ==========================================
// CONNECT DATABASE
// ==========================================

const connectDatabase = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.DB_NAME || undefined,
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

    return connection;
  } catch (error) {
    console.error(`
=========================================
❌ MongoDB Connection Failed
=========================================
${error.message}
=========================================
`);

    throw error;
  }
};

module.exports = connectDatabase;
