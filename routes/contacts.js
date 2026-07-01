const express = require('express');
const fs = require('fs');
const path = require('path');
const Contact = require('../models/Contact');
const { isConnected } = require('../db');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../contacts.json');

router.post('/contact', async (req, res) => {
  if (req.body.phone && !/^\d+$/.test(req.body.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number must contain only digits' });
  }

  // Try to save to MongoDB when connected
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

  // Fallback to file
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

router.get('/contacts', async (req, res) => {
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

module.exports = router;
