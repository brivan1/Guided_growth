/* ══════════════════════════════════════════
   GUIDED GROWTH — admin.js
   Script for admin.html
   ══════════════════════════════════════════ */

/* ── API CONFIG ── */
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5001'
  : 'https://guided-growth-api.onrender.com';

/* ── SESSION TOKEN ── */
const SESSION_KEY = 'gg_admin_token';
function getToken()   { return sessionStorage.getItem(SESSION_KEY); }
function clearToken() { sessionStorage.removeItem(SESSION_KEY); }

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

/* ── Auth guard: redirect to events page if not logged in ── */
if (!getToken()) { window.location.href = 'events.html'; }


/* ══════════════════════════════════════════
   LOGOUT
   ══════════════════════════════════════════ */
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  window.location.href = 'events.html';
});


/* ══════════════════════════════════════════
   HELPER — DATE + TIME COMPARISON
   Same logic as events.js so both pages
   agree on whether an event has ended.
   ══════════════════════════════════════════ */
function hasEventEnded(dateStr, timeStr) {
  const eventDate = new Date(dateStr);

  const timePart = timeStr.includes('–') || timeStr.includes('-')
    ? timeStr.split(/[–-]/).pop().trim()
    : timeStr.trim();

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
    return eventDate < new Date();
  }

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
   STATE
   ══════════════════════════════════════════ */
let allEvents    = [];
let activeFilter = 'all';
let editingId    = null;

function fmtDate(str) {
  const d = new Date(str);
  return {
    day:  d.getDate().toString().padStart(2, '0'),
    mon:  new Intl.DateTimeFormat('en', { month: 'short' }).format(d).toUpperCase(),
    full: new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d)
  };
}


/* ══════════════════════════════════════════
   LOAD EVENTS
   ══════════════════════════════════════════ */
async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events`, { headers: authHeaders() });
    if (res.status === 401) { clearToken(); window.location.href = 'events.html'; return; }
    allEvents = await res.json();
    updateStats();
    renderList();
  } catch {
    document.getElementById('eventsList').innerHTML =
      `<div class="no-events"><span>⚠️</span>Could not connect to server.</div>`;
  }
}


/* ══════════════════════════════════════════
   STATS
   ══════════════════════════════════════════ */
function updateStats() {
  document.getElementById('statTotal').textContent    = allEvents.length;
  document.getElementById('statUpcoming').textContent = allEvents.filter(e => !hasEventEnded(e.date, e.time)).length;
  document.getElementById('statPast').textContent     = allEvents.filter(e =>  hasEventEnded(e.date, e.time)).length;
  document.getElementById('statTypes').textContent    = new Set(allEvents.map(e => e.type)).size;
}


/* ══════════════════════════════════════════
   RENDER EVENT LIST
   ══════════════════════════════════════════ */
function renderList() {
  let filtered = [...allEvents];

  if      (activeFilter === 'upcoming') filtered = filtered.filter(e => !hasEventEnded(e.date, e.time));
  else if (activeFilter === 'past')     filtered = filtered.filter(e =>  hasEventEnded(e.date, e.time));
  else if (activeFilter !== 'all')      filtered = filtered.filter(e => e.type === activeFilter);

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const list = document.getElementById('eventsList');

  if (!filtered.length) {
    list.innerHTML = `<div class="no-events"><span>📅</span>No events found.</div>`;
    return;
  }

  list.innerHTML = filtered.map(ev => {
    const ended = hasEventEnded(ev.date, ev.time);
    const { day, mon, full } = fmtDate(ev.date);
    return `
      <div class="admin-event-row ${ended ? 'past-row' : ''}">
        <div class="row-date">
          <span class="rd">${day}</span>
          <span class="rm">${mon}</span>
        </div>
        <div class="row-info">
          <h4>${ev.title}</h4>
          <p>${full} &middot; ${ev.location}</p>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-shrink:0;">
          <span class="row-badge">${ev.type}</span>
          ${ended ? '<span class="row-badge" style="color:#c0392b;border-color:#e8a09a;">Ended</span>' : '<span class="row-badge" style="color:var(--moss);border-color:var(--sage);">Upcoming</span>'}
        </div>
        <div class="row-actions">
          <button class="btn-edit"   onclick="startEdit('${ev._id}')">Edit</button>
          <button class="btn-delete" onclick="deleteEvent('${ev._id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

/* List filter tabs */
document.querySelectorAll('.list-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.list-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderList();
  });
});


/* ══════════════════════════════════════════
   SAVE / UPDATE EVENT
   ══════════════════════════════════════════ */
document.getElementById('saveBtn').addEventListener('click', async () => {
  const title       = document.getElementById('evTitle').value.trim();
  const type        = document.getElementById('evType').value;
  const date        = document.getElementById('evDate').value;
  const time        = document.getElementById('evTime').value.trim();
  const location    = document.getElementById('evLocation').value.trim();
  const description = document.getElementById('evDescription').value.trim();
  const slots       = document.getElementById('evSlots').value;
  const feedback    = document.getElementById('formFeedback');
  const saveBtn     = document.getElementById('saveBtn');

  if (!title || !type || !date || !time || !location || !description) {
    feedback.textContent = 'Please fill in all required fields.';
    feedback.style.color = '#c0392b';
    return;
  }

  /* ── Time validation ──
     Warn if the admin is adding a NEW event whose end time has already
     passed. Allow it (they may be logging a past event) but show a warning.
     For edits, skip this check since past events are valid to update. */
  const isEdit = !!editingId;

  if (!isEdit && hasEventEnded(date, time)) {
    const confirm = window.confirm(
      `⚠️ The time "${time}" on this date has already passed — this event will appear under "Past Events" immediately.\n\nDo you still want to save it?`
    );
    if (!confirm) return;
  }

  const url    = isEdit ? `${API_BASE}/api/events/${editingId}` : `${API_BASE}/api/events`;
  const method = isEdit ? 'PUT' : 'POST';

  saveBtn.textContent = isEdit ? 'Saving...' : 'Adding...';
  saveBtn.disabled    = true;

  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify({ title, type, date, time, location, description, slots: slots || '' })
    });

    if (res.status === 401) { clearToken(); window.location.href = 'events.html'; return; }

    if (res.ok) {
      feedback.textContent = isEdit ? '✓ Event updated!' : '✓ Event added!';
      feedback.style.color = 'var(--moss)';
      clearForm();
      await loadEvents();
      setTimeout(() => { feedback.textContent = ''; }, 3000);
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Server error');
    }
  } catch (err) {
    feedback.textContent = `Error: ${err.message}`;
    feedback.style.color = '#c0392b';
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = isEdit ? 'Save Changes' : 'Add Event';
  }
});


/* ══════════════════════════════════════════
   EDIT EVENT
   ══════════════════════════════════════════ */
function startEdit(id) {
  const ev = allEvents.find(e => e._id === id);
  if (!ev) return;

  editingId = id;
  document.getElementById('evTitle').value       = ev.title;
  document.getElementById('evType').value        = ev.type;
  document.getElementById('evDate').value        = ev.date.split('T')[0];
  document.getElementById('evTime').value        = ev.time;
  document.getElementById('evLocation').value    = ev.location;
  document.getElementById('evDescription').value = ev.description;
  document.getElementById('evSlots').value       = ev.slots || '';

  document.getElementById('formTitle').textContent    = 'Edit Event';
  document.getElementById('saveBtn').textContent      = 'Save Changes';
  document.getElementById('cancelBtn').style.display  = 'block';
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('cancelBtn').addEventListener('click', clearForm);

function clearForm() {
  editingId = null;
  ['evTitle', 'evTime', 'evLocation', 'evDescription'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('evType').value  = '';
  document.getElementById('evDate').value  = '';
  document.getElementById('evSlots').value = '';

  document.getElementById('formTitle').textContent    = 'Add New Event';
  document.getElementById('saveBtn').textContent      = 'Add Event';
  document.getElementById('saveBtn').disabled         = false;
  document.getElementById('cancelBtn').style.display  = 'none';
  document.getElementById('formFeedback').textContent = '';
}


/* ══════════════════════════════════════════
   DELETE EVENT
   ══════════════════════════════════════════ */
async function deleteEvent(id) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    const res = await fetch(`${API_BASE}/api/events/${id}`, {
      method:  'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) { clearToken(); window.location.href = 'events.html'; return; }
    if (res.ok) await loadEvents();
  } catch {
    alert('Could not delete event. Please try again.');
  }
}


/* ── Init ── */
loadEvents();