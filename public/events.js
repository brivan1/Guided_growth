const LOCAL_API_BASE = 'http://localhost:5001';
const REMOTE_HOST = 'guided-growth-api.onrender.com';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? LOCAL_API_BASE
  : `https://${REMOTE_HOST}`;

console.log('DEBUG: window.location.hostname =', window.location.hostname);
console.log('DEBUG: API_BASE =', API_BASE);

window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 20));
 
hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
 
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
   ══════════════════════════════════════════ */
const modal         = document.getElementById('adminModal');
const modalError    = document.getElementById('modalError');
const modalLoginBtn = document.getElementById('modalLoginBtn');
 
/* Open modal — or skip straight to panel if already logged in */
document.getElementById('adminAccessBtn').addEventListener('click', () => {
  if (getToken()) { window.location.href = 'admin.html'; return; }
  modal.classList.add('open');
  document.getElementById('adminUser').focus();
});
 
/* Close modal */
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
 
function closeModal() {
  modal.classList.remove('open');
  modalError.style.display = 'none';
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
}
 
/* Login */
async function tryLogin() {
  const username = document.getElementById('adminUser').value.trim();
  const password = document.getElementById('adminPass').value;
  modalError.style.display = 'none';
 
  if (!username || !password) {
    modalError.textContent   = 'Please enter both username and password.';
    modalError.style.display = 'block';
    return;
  }
 
  modalLoginBtn.textContent = 'Signing in...';
  modalLoginBtn.disabled    = true;
 
  try {
    const res  = await fetch(`${API_BASE}/api/admin/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password })
    });
    const data = await res.json();
 
    if (res.ok && data.token) {
      setToken(data.token);
      window.location.href = 'admin.html';
    } else {
      modalError.textContent   = data.message || 'Incorrect username or password.';
      modalError.style.display = 'block';
    }
  } catch {
    modalError.textContent   = 'Could not reach server. Please try again.';
    modalError.style.display = 'block';
  } finally {
    modalLoginBtn.textContent = 'Sign In';
    modalLoginBtn.disabled    = false;
  }
}
 
modalLoginBtn.addEventListener('click', tryLogin);
document.getElementById('adminPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
document.getElementById('adminUser').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('adminPass').focus(); });
 
 
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
    day:   d.getDate(),
    month: d.toLocaleString('default', { month: 'short' }).toUpperCase()
  };
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
  const now      = new Date();
  const upcoming = events
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = events
    .filter(e => new Date(e.date) < now)
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
 
  /* Re-observe new fade-up cards */
  document.querySelectorAll('.event-card.fade-up').forEach(el => revealObserver.observe(el));
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