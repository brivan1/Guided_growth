/* ══════════════════════════════════════════
   GUIDED GROWTH — events.js
   Script for events.html
   ══════════════════════════════════════════ */

/* ── API CONFIG ── */
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5001'
  : 'https://guided-growth-api.onrender.com';

/* ── SESSION ── */
const SESSION_KEY = 'gg_admin_token';
function getToken()  { return sessionStorage.getItem(SESSION_KEY); }
function setToken(t) { sessionStorage.setItem(SESSION_KEY, t); }


/* ══════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════ */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

window.addEventListener('scroll', () =>
  navbar.classList.toggle('scrolled', window.scrollY > 20)
);

hamburger.addEventListener('click', () =>
  navLinks.classList.toggle('open')
);

navLinks.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => navLinks.classList.remove('open'))
);


/* ══════════════════════════════════════════
   SCROLL REVEAL
   ══════════════════════════════════════════ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });


/* ══════════════════════════════════════════
   ADMIN LOGIN MODAL
   Opens immediately on button click —
   server is only called when Sign In is pressed.
   ══════════════════════════════════════════ */
const modal         = document.getElementById('adminModal');
const modalError    = document.getElementById('modalError');
const modalLoginBtn = document.getElementById('modalLoginBtn');
const adminUserEl   = document.getElementById('adminUser');
const adminPassEl   = document.getElementById('adminPass');

/* ── Open ── */
document.getElementById('adminAccessBtn').addEventListener('click', () => {
  /* Already logged in → go straight to panel */
  if (getToken()) {
    window.location.href = 'admin.html';
    return;
  }
  openModal();
});

function openModal() {
  modal.classList.add('open');
  /* Small delay so the transition plays after display kicks in */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => adminUserEl.focus());
  });
}

/* ── Close ── */
function closeModal() {
  modal.classList.remove('open');
  modalError.style.display = 'none';
  modalError.textContent   = '';
  adminUserEl.value        = '';
  adminPassEl.value        = '';
  modalLoginBtn.textContent = 'Sign In';
  modalLoginBtn.disabled    = false;
}

document.getElementById('modalClose').addEventListener('click', closeModal);

/* Click outside modal box to close */
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

/* Escape key to close */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

/* ── Login submit ── */
async function tryLogin() {
  const username = adminUserEl.value.trim();
  const password = adminPassEl.value;

  /* Client-side empty check */
  if (!username || !password) {
    showModalError('Please enter both username and password.');
    return;
  }

  modalLoginBtn.textContent = 'Signing in...';
  modalLoginBtn.disabled    = true;
  modalError.style.display  = 'none';

  try {
    const res  = await fetch(`${API_BASE}/api/admin/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      /* Success — store token and go to admin panel */
      setToken(data.token);
      window.location.href = 'admin.html';
    } else {
      showModalError(data.message || 'Incorrect username or password.');
    }

  } catch {
    showModalError('Could not reach the server. Please check your connection or try again shortly.');
  } finally {
    modalLoginBtn.textContent = 'Sign In';
    modalLoginBtn.disabled    = false;
  }
}

function showModalError(msg) {
  modalError.textContent   = msg;
  modalError.style.display = 'block';
}

/* Button click */
modalLoginBtn.addEventListener('click', tryLogin);

/* Enter key on password → submit */
adminPassEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLogin();
});

/* Enter key on username → move to password */
adminUserEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') adminPassEl.focus();
});


/* ══════════════════════════════════════════
   EVENTS — HELPERS
   ══════════════════════════════════════════ */
function badgeClass(type) {
  return {
    'Workshop':      'badge-workshop',
    'Support Group': 'badge-support',
    'Outreach':      'badge-outreach',
    'Seminar':       'badge-seminar'
  }[type] || 'badge-support';
}

function formatDate(str) {
  const d = new Date(str);
  return {
    day:   d.getDate().toString().padStart(2, '0'),
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(d).toUpperCase()
  };
}

/**
 * hasEventEnded(dateStr, timeStr)
 *
 * Combines the event date with its END time to determine whether the
 * event has finished. Handles these common time formats:
 *   "10:00 AM – 12:00 PM"   → end time is 12:00 PM
 *   "10:00 AM - 12:00 PM"   → end time is 12:00 PM
 *   "2:00 PM"               → single time used as-is
 *   "14:00"                 → 24-hr format
 *
 * Returns true if the event end time is in the past.
 */
function hasEventEnded(dateStr, timeStr) {
  const eventDate = new Date(dateStr);

  /* Extract the END portion of a range, or the only time given */
  const timePart = timeStr.includes('–') || timeStr.includes('-')
    ? timeStr.split(/[–-]/).pop().trim()   // take everything after the dash
    : timeStr.trim();

  /* Parse 12-hr (e.g. "12:00 PM") or 24-hr (e.g. "14:00") */
  let hours   = 0;
  let minutes = 0;

  const match12 = timePart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  const match24 = timePart.match(/^(\d{1,2}):(\d{2})$/);

  if (match12) {
    hours   = parseInt(match12[1], 10);
    minutes = parseInt(match12[2], 10);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours  = 0;
  } else if (match24) {
    hours   = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else {
    /* Unrecognised format — fall back to date-only comparison */
    return eventDate < new Date();
  }

  /* Build a full Date object for the event end moment */
  const endDateTime = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate(),
    hours,
    minutes,
    0
  );

  return endDateTime < new Date();
}


/* ══════════════════════════════════════════
   EVENTS — BUILD CARD
   ══════════════════════════════════════════ */
function buildCard(event, isPast) {
  const { day, month } = formatDate(event.date);
  const badge = badgeClass(event.type);
  return `
    <div class="event-card ${isPast ? 'past' : ''} fade-up" data-type="${event.type}">
      <div class="event-card-header">
        <div class="event-date-block">
          <span class="ev-day">${day}</span>
          <span class="ev-month">${month}</span>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <span class="event-type-badge ${badge}">${event.type}</span>
          ${isPast ? '<span class="past-label">Completed</span>' : ''}
        </div>
      </div>
      <div class="event-card-body">
        <h3>${event.title}</h3>
        <p>${event.description}</p>
        <div class="event-meta">
          <span class="meta-time">${event.time}</span>
          <span class="meta-location">${event.location}</span>
          ${event.slots ? `<span class="meta-slots">${event.slots} spots available</span>` : ''}
        </div>
        ${isPast
          ? `<span class="btn-primary" style="text-align:center;display:block;opacity:.55;cursor:default;box-shadow:none;">Event Ended</span>`
          : `<a href="index.html#gethelp" class="btn-primary" style="text-align:center;display:block;">Register / Enquire</a>`
        }
      </div>
    </div>`;
}


/* ══════════════════════════════════════════
   EVENTS — RENDER
   ══════════════════════════════════════════ */
let allEvents    = [];
let activeFilter = 'all';

function renderEvents(events) {
  /* Use hasEventEnded for accurate date+time comparison */
  const upcoming = events
    .filter(e => !hasEventEnded(e.date, e.time))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events
    .filter(e => hasEventEnded(e.date, e.time))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  /* Upcoming */
  document.getElementById('upcomingLoading').style.display = 'none';
  const ug = document.getElementById('upcomingGrid');
  ug.style.display = 'grid';
  document.getElementById('upcomingCount').textContent =
    `${upcoming.length} event${upcoming.length !== 1 ? 's' : ''}`;
  ug.innerHTML = upcoming.length
    ? upcoming.map(e => buildCard(e, false)).join('')
    : `<div class="empty-state">
         <span class="empty-icon">📅</span>
         No upcoming events right now —
         <a href="index.html#gethelp" style="color:var(--moss)">get in touch</a> to be notified.
       </div>`;

  /* Past */
  document.getElementById('pastLoading').style.display = 'none';
  const pg = document.getElementById('pastGrid');
  pg.style.display = 'grid';
  document.getElementById('pastCount').textContent =
    `${past.length} event${past.length !== 1 ? 's' : ''}`;
  pg.innerHTML = past.length
    ? past.map(e => buildCard(e, true)).join('')
    : `<div class="empty-state"><span class="empty-icon">🌿</span>No past events yet.</div>`;

  /* Observe new cards for fade-in */
  document.querySelectorAll('.event-card.fade-up').forEach(el =>
    revealObserver.observe(el)
  );
}


/* ══════════════════════════════════════════
   EVENTS — FILTER TABS
   ══════════════════════════════════════════ */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderEvents(
      activeFilter === 'all'
        ? allEvents
        : allEvents.filter(e => e.type === activeFilter)
    );
  });
});


/* ══════════════════════════════════════════
   EVENTS — FETCH FROM API
   ══════════════════════════════════════════ */
async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events`);
    allEvents  = await res.json();
    renderEvents(allEvents);
  } catch {
    document.getElementById('upcomingLoading').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1">
         <span class="empty-icon">⚠️</span>
         Could not load events. Please try again later.
       </div>`;
    document.getElementById('pastLoading').innerHTML = '';
  }
}

/* ── Init ── */
loadEvents();