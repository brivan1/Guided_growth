require('dotenv').config();
const express  = require('express');
const fs       = require('fs');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');

const { connectDB, isConnected } = require('./db');
const Contact = require('./models/Contact');

const app  = express();
const PORT = process.env.PORT || 5001;

/* ──────────────────────────────────────────
   MIDDLEWARE
   ────────────────────────────────────────── */
app.use(cors({
  origin: [
    'https://guided-growth.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ──────────────────────────────────────────
   DATABASE
   ────────────────────────────────────────── */
connectDB().catch(() => console.warn('Continuing without MongoDB'));

/* ──────────────────────────────────────────
   EVENT SCHEMA
   ────────────────────────────────────────── */
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    type:        { type: String, required: true, enum: ['Workshop','Support Group','Outreach','Seminar'] },
    date:        { type: Date,   required: true },
    time:        { type: String, required: true },
    location:    { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    slots:       { type: String, default: '' }
  },
  { timestamps: true }
);

const Event = mongoose.model('Event', eventSchema);

/* ──────────────────────────────────────────
   SESSION TOKENS
   In-memory store — tokens expire after 8h.
   ────────────────────────────────────────── */
const activeSessions = new Map();
const TOKEN_TTL_MS   = 8 * 60 * 60 * 1000;

function createSession() {
  const token   = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function isValidToken(token) {
  if (!token || !activeSessions.has(token)) return false;
  if (Date.now() > activeSessions.get(token)) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!isValidToken(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in again.' });
  }
  next();
}

/* ──────────────────────────────────────────
   HEALTH CHECK
   ────────────────────────────────────────── */
app.get('/', (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'Guided Growth server is running ✅', database: db });
});

/* ──────────────────────────────────────────
   ADMIN LOGIN
   POST /api/admin/login
   ────────────────────────────────────────── */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (!validUser || !validPass) {
    console.error('Admin credentials are not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.');
    return res.status(500).json({ success: false, message: 'Admin authentication is not configured.' });
  }

  if (username === validUser && password === validPass) {
    return res.json({ success: true, token: createSession() });
  }
  return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
});

/* ──────────────────────────────────────────
   CONTACT FORM  (public)
   POST /api/contact
   ────────────────────────────────────────── */
const DATA_FILE = path.join(__dirname, 'contacts.json');

app.post('/api/contact', async (req, res) => {
  if (req.body.phone && !/^\d+$/.test(req.body.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number must contain only digits' });
  }

  if (isConnected()) {
    try {
      const doc = new Contact({ ...req.body, submittedAt: new Date() });
      await doc.save();
      console.log('✅ Contact saved to MongoDB');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('MongoDB save failed, falling back to file:', err.message);
    }
  }

  // File fallback
  const newEntry = { ...req.body, id: Date.now(), submittedAt: new Date().toISOString() };
  let contacts = [];
  if (fs.existsSync(DATA_FILE)) {
    try { contacts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); } catch {}
  }
  contacts.push(newEntry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));
  console.log('✅ Contact saved to contacts.json');
  res.status(200).json({ success: true });
});

/* ──────────────────────────────────────────
   CONTACTS (protected)
   GET /api/contacts
   ────────────────────────────────────────── */
app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    if (isConnected()) {
      const contacts = await Contact.find().sort({ submittedAt: -1 });
      return res.status(200).json(contacts);
    }
    if (fs.existsSync(DATA_FILE)) {
      return res.status(200).json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'));
    }
    res.status(200).json([]);
  } catch (err) {
    console.error('Error retrieving contacts:', err);
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

/* ──────────────────────────────────────────
   EVENTS
   GET  /api/events       — public
   POST /api/events       — protected
   PUT  /api/events/:id   — protected
   DELETE /api/events/:id — protected
   ────────────────────────────────────────── */
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not fetch events.' });
  }
});

app.post('/api/events', requireAuth, async (req, res) => {
  try {
    const event = await Event.create(req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/events/:id', requireAuth, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/events/:id', requireAuth, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ──────────────────────────────────────────
   KEEP ALIVE  (prevents Render free tier sleep)
   ────────────────────────────────────────── */
const RENDER_URL = process.env.RENDER_URL || '';
if (RENDER_URL) {
  setInterval(async () => {
    try   { await fetch(RENDER_URL); console.log('🔄 Keep-alive ping sent'); }
    catch (err) { console.error('Keep-alive failed:', err.message); }
  }, 14 * 60 * 1000);
}

/* ──────────────────────────────────────────
   START
   ────────────────────────────────────────── */
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));