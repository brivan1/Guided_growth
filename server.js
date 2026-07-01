const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB, isConnected } = require('./db');
const Contact = require('./models/Contact');

const app = express();
app.use(cors({
  origin: [
    'https://guided-growth.vercel.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'contacts.json');

// attempt DB connection (if MONGODB_URI provided)
connectDB().catch(() => {
  console.warn('Continuing without MongoDB');
});

app.post('/api/contact', async (req, res) => {
  if (req.body.phone && !/^\d+$/.test(req.body.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number must contain only digits' });
  }

  // Try to save to MongoDB when connected, otherwise fallback to file
  if (isConnected()) {
    try {
      const doc = new Contact({ ...req.body, submittedAt: new Date() });
      await doc.save();
      console.log('New contact saved to MongoDB');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Failed to save to MongoDB, falling back to file:', err.message || err);
      // fall through to file fallback
    }
  }

  const newEntry = {
    ...req.body,
    id: Date.now(),
    submittedAt: new Date().toISOString()
  };

  let contacts = [];
  if (fs.existsSync(DATA_FILE)) {
    const fileData = fs.readFileSync(DATA_FILE, 'utf8');
    try {
      contacts = JSON.parse(fileData || '[]');
    } catch (e) {
      contacts = [];
    }
  }

  contacts.push(newEntry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));

  console.log('New contact saved to contacts.json');
  res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));



app.get('/api/contacts', async (req, res) => {
  try {
    if (isConnected()) {
      const contacts = await Contact.find().sort({ submittedAt: -1 });
      return res.status(200).json(contacts);
    } else {
      // Fallback to file
      if (fs.existsSync(DATA_FILE)) {
        const fileData = fs.readFileSync(DATA_FILE, 'utf8');
        const contacts = JSON.parse(fileData || '[]');
        return res.status(200).json(contacts);
      }
      return res.status(200).json([]);
    }
  } catch (err) {
    console.error('Error retrieving contacts:', err);
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});
