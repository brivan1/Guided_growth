const mongoose = require('mongoose');
const { Schema } = mongoose;

const ContactSchema = new Schema({
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  message: { type: String },
  submittedAt: { type: Date, default: Date.now },
  clientId: { type: Number }
}, { strict: false });

module.exports = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
