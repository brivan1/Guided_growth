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
   STATE
   ══════════════════════════════════════════ */
let allEvents    = [];
let activeFilter = 'all';
let editingId    = null;
 
function fmtDate(str) {
  const d = new Date(str);
  return {
    day:  d.getDate(),
    mon:  d.toLocaleString('default', { month: 'short' }).toUpperCase(),
    full: d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
  const now = new Date();
  document.getElementById('statTotal').textContent    = allEvents.length;
  document.getElementById('statUpcoming').textContent = allEvents.filter(e => new Date(e.date) >= now).length;
  document.getElementById('statPast').textContent     = allEvents.filter(e => new Date(e.date) <  now).length;
  document.getElementById('statTypes').textContent    = new Set(allEvents.map(e => e.type)).size;
}
 
 
/* ══════════════════════════════════════════
   RENDER EVENT LIST
   ══════════════════════════════════════════ */
function renderList() {
  const now = new Date();
  let filtered = [...allEvents];
 
  if      (activeFilter === 'upcoming') filtered = filtered.filter(e => new Date(e.date) >= now);
  else if (activeFilter === 'past')     filtered = filtered.filter(e => new Date(e.date) <  now);
  else if (activeFilter !== 'all')      filtered = filtered.filter(e => e.type === activeFilter);
 
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
 
  const list = document.getElementById('eventsList');
 
  if (!filtered.length) {
    list.innerHTML = `<div class="no-events"><span>📅</span>No events found.</div>`;
    return;
  }
 
  list.innerHTML = filtered.map(ev => {
    const isPast = new Date(ev.date) < now;
    const { day, mon, full } = fmtDate(ev.date);
    return `
      <div class="admin-event-row ${isPast ? 'past-row' : ''}">
        <div class="row-date">
          <span class="rd">${day}</span>
          <span class="rm">${mon}</span>
        </div>
        <div class="row-info">
          <h4>${ev.title}</h4>
          <p>${full} &middot; ${ev.location}</p>
        </div>
        <span class="row-badge">${ev.type}</span>
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
 
  const isEdit = !!editingId;
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