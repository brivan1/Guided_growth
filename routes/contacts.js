const express = require('express');
const fs = require('fs');
const path = require('path');
const Contact = require('../models/Contact');
const { isConnected } = require('../db');

const router = express.Router();
const DATA_FILE = path.join(__dirname, '../contacts.json');
const MAX_CONTACTS_FILE_SIZE = 5 * 1024 * 1024; // 5MB max
const CONTACTS_BACKUP_DIR = path.join(__dirname, '../contacts_backup');

// Ensure backup directory exists
if (!fs.existsSync(CONTACTS_BACKUP_DIR)) {
  fs.mkdirSync(CONTACTS_BACKUP_DIR, { recursive: true });
}

function rotateContactsFile() {
  if (fs.existsSync(DATA_FILE)) {
    const stat = fs.statSync(DATA_FILE);
    if (stat.size > MAX_CONTACTS_FILE_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(CONTACTS_BACKUP_DIR, `contacts-${timestamp}.json`);
      fs.renameSync(DATA_FILE, backupFile);
      console.log(`✅ Rotated contacts.json to ${backupFile}`);
    }
  }
}

function sanitizeString(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/<[^>]*>/g, '').trim();
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}

function validatePhone(phone) {
  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  return phoneRegex.test(String(phone));
}

function sanitizeContactBody(body) {
  return {
    name:       sanitizeString(body.name),
    email:      sanitizeString(body.email),
    phone:      sanitizeString(body.phone),
    message:    sanitizeString(body.message),
    clientId:   body.clientId ? Number(body.clientId) : undefined,
    submittedAt: new Date()
  };
}

router.post('/contact', async (req, res) => {
  const clean = sanitizeContactBody(req.body || {});
  if (clean.phone && !validatePhone(clean.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number format is invalid. Use format: (123) 456-7890 or 123-456-7890' });
  }
  if (clean.email && !validateEmail(clean.email)) {
    return res.status(400).json({ success: false, message: 'Email address format is invalid.' });
  }

  // Try to save to MongoDB when connected
  if (isConnected()) {
    try {
      const doc = new Contact(clean);
      await doc.save();
      console.log('New contact saved to MongoDB');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Failed to save to MongoDB, falling back to file:', err.message || err);
      // fall through to file fallback
    }
  }

  // Fallback to file with rotation
  rotateContactsFile();
  const newEntry = { ...clean, id: Date.now(), submittedAt: new Date().toISOString() };
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
