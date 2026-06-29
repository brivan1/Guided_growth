const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || '';

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not set — MongoDB will not be used.');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message || err);
    throw err;
  }
}

function isConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isConnected };
