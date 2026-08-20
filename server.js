require('dotenv').config();
const express      = require('express');
const fs           = require('fs');
const cors         = require('cors');
const path         = require('path');
const crypto       = require('crypto');
const session      = require('express-session');
const bcrypt       = require('bcrypt');
const MongoStore   = require('connect-mongo');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const csrf         = require('csurf');

const { connectDB, isConnected } = require('./db');
const Contact = require('./models/Contact');

const app  = express();
const PORT = process.env.PORT || 5002;

/* ──────────────────────────────────────────
   MIDDLEWARE
   ────────────────────────────────────────── */
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({
  origin: [
    'https://guided-growth.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors({ credentials: true }));
app.use(helmet());
app.use(express.json());

const sessionSecret = process.env.SESSION_SECRET || 'change-this-secret';
let sessionStore = undefined;

if (process.env.MONGODB_URI) {
  try {
    sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: 'sessions',
      stringify: false,
      touchAfter: 24 * 3600 // lazy session update interval
    });
    sessionStore.on('error', (err) => {
      console.warn('MongoStore error:', err.message);
      console.warn('Sessions will be stored in memory');
    });
  } catch (err) {
    console.warn('Could not create MongoStore:', err.message);
    console.warn('Sessions will be stored in memory');
  }
}

app.use(session({
  name: 'gg_admin_session',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

const csrfProtection = csrf({ cookie: false });

const MAX_CONTACTS_FILE_SIZE = 5 * 1024 * 1024; // 5MB max
const CONTACTS_BACKUP_DIR = path.join(__dirname, 'contacts_backup');

// Ensure backup directory exists
if (!fs.existsSync(CONTACTS_BACKUP_DIR)) {
  fs.mkdirSync(CONTACTS_BACKUP_DIR, { recursive: true });
}

function rotateContactsFile() {
  const dataFile = path.join(__dirname, 'contacts.json');
  if (fs.existsSync(dataFile)) {
    const stat = fs.statSync(dataFile);
    if (stat.size > MAX_CONTACTS_FILE_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(CONTACTS_BACKUP_DIR, `contacts-${timestamp}.json`);
      fs.renameSync(dataFile, backupFile);
      console.log(`✅ Rotated contacts.json to ${backupFile}`);
    }
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});

const csrfLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Allow a reasonable number of token refreshes
});

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
   SESSION AUTH
   MongoDB-backed sessions with HttpOnly cookies.
   ────────────────────────────────────────── */
function requireAuth(req, res, next) {
  if (!req.session || req.session.admin !== true) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in again.' });
  }
  next();
}

/* ----------------------
   Input sanitization
   ---------------------- */
function sanitizeString(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/<[^>]*>/g, '').trim();
}

function sanitizeEventBody(body) {
  return {
    title:       sanitizeString(body.title),
    type:        sanitizeString(body.type),
    date:        sanitizeString(body.date),
    time:        sanitizeString(body.time),
    location:    sanitizeString(body.location),
    description: sanitizeString(body.description),
    slots:       sanitizeString(body.slots || '')
  };
}

function validateEmail(email) {
  // RFC 5322 simplified: local@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}

function validatePhone(phone) {
  // Allow 7-20 digits, optionally with spaces, dashes, or parentheses
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
app.get('/api/admin/session', (req, res) => {
  const authenticated = !!(req.session && req.session.admin === true);
  return res.json({ authenticated });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validPassHash = process.env.ADMIN_PASSWORD_HASH;

  if (!validUser || !validPassHash) {
    console.error('Admin credentials are not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD_HASH in your .env file.');
    return res.status(500).json({ success: false, message: 'Admin authentication is not configured.' });
  }

  if (username !== validUser || !password) {
    return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
  }

  let passwordOk;
  try {
    // bcrypt.compare is designed to be safe against timing attacks
    passwordOk = bcrypt.compareSync(password, validPassHash);
  } catch (err) {
    console.error('Error during bcrypt comparison:', err);
    return res.status(500).json({ success: false, message: 'Error during authentication.' });
  }

  if (!passwordOk) {
    return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error('Session regeneration failed:', err);
      return res.status(500).json({ success: false, message: 'Login failed.' });
    }
    req.session.admin = true;
    return res.json({ success: true });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('gg_admin_session');
    if (err) {
      console.error('Logout failed:', err);
      return res.status(500).json({ success: false, message: 'Logout failed.' });
    }
    return res.json({ success: true });
  });
});

/* ──────────────────────────────────────────
   CSRF TOKEN ENDPOINT
   GET /api/csrf-token
   ────────────────────────────────────────── */
app.get('/api/csrf-token', csrfLimiter, csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Middleware group for protected, state-changing routes
const protectedWriteRoute = [requireAuth, csrfProtection, publicLimiter];


/* ──────────────────────────────────────────
   CONTACT FORM  (public)
   POST /api/contact
   ────────────────────────────────────────── */
const DATA_FILE = path.join(__dirname, 'contacts.json');

app.post('/api/contact', publicLimiter, async (req, res) => {
  // Basic client-supplied validation
  const clean = sanitizeContactBody(req.body || {});
  
  // Strict validation with improved regex patterns
  if (clean.phone && !validatePhone(clean.phone)) {
    return res.status(400).json({ success: false, message: 'Phone number format is invalid. Use format: (123) 456-7890 or 123-456-7890' });
  }
  if (clean.email && !validateEmail(clean.email)) {
    return res.status(400).json({ success: false, message: 'Email address format is invalid.' });
  }

  if (isConnected()) {
    try {
      const doc = new Contact(clean);
      await doc.save();
      console.log('✅ Contact saved to MongoDB');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('MongoDB save failed, falling back to file:', err.message || err);
    }
  }

  // File fallback (sanitized) with rotation
  rotateContactsFile();
  const newEntry = { ...clean, id: Date.now(), submittedAt: new Date().toISOString() };
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

app.post('/api/events', protectedWriteRoute, async (req, res) => {
  try {
    const clean = sanitizeEventBody(req.body || {});
    if (!clean.title || !clean.type || !clean.date || !clean.time || !clean.location || !clean.description) {
      return res.status(400).json({ success: false, message: 'Missing required event fields.' });
    }
    const event = await Event.create(clean);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/events/:id', protectedWriteRoute, async (req, res) => {
  try {
    const clean = sanitizeEventBody(req.body || {});
    const event = await Event.findByIdAndUpdate(req.params.id, clean, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    res.json({ success: true, event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/events/:id', protectedWriteRoute, async (req, res) => {
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