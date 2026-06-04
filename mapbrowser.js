// Local map gallery (#map-browser-screen): lists the maps THIS browser has saved (via the
// editor's Save button) so the player can play or delete them. No backend, no network —
// the maps live in localStorage under 'voidKnightMaps'. Titles are escaped before innerHTML.
import { listMaps, getLocalMap, deleteMap } from './localstore.js';
import { deserialize } from './levelschema.js';

let onPlay = () => {};
let onClose = () => {};
let open = false;

const el = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- public API ------------------------------------------------------------

export function initBrowser({ onPlay: play, onClose: close } = {}) {
  if (play) onPlay = play;
  if (close) onClose = close;
  const back = el('map-browser-back');
  if (back) back.addEventListener('click', () => { closeBrowser(); onClose(); });
}

export function isBrowserOpen() { return open; }

export function openBrowser() {
  const screen = el('map-browser-screen');
  if (!screen) return;
  open = true;
  screen.style.display = 'flex';
  renderGallery();
}

export function closeBrowser() {
  open = false;
  const screen = el('map-browser-screen');
  if (screen) screen.style.display = 'none';
}

// --- gallery ---------------------------------------------------------------

function renderGallery() {
  const list = el('map-list');
  const empty = el('map-list-empty');
  if (!list) return;
  list.innerHTML = '';
  const maps = listMaps();
  if (maps.length === 0) {
    if (empty) { empty.textContent = 'No saved maps yet'; empty.style.display = 'block'; }
    return;
  }
  if (empty) empty.style.display = 'none';
  maps.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'lb-entry map-card';
    card.innerHTML = `
      <span class="lb-name" style="flex:2;">${escapeHtml(m.title || 'Untitled')}</span>
      <span class="lb-score" style="color:#2ecc71; width:auto; min-width:48px;">Play</span>
      <button class="menu-btn map-del" title="Delete map" style="width:auto; padding:4px 8px; margin:0;">&#10005;</button>
    `;
    // Click the card (anywhere but the delete button) to play the map.
    card.addEventListener('click', () => playMap(m.id));
    const del = card.querySelector('.map-del');
    if (del) del.addEventListener('click', (e) => {
      e.stopPropagation();                  // don't trigger play
      if (!window.confirm(`Delete map "${m.title}"? This can't be undone.`)) return;
      deleteMap(m.id);
      renderGallery();
    });
    list.appendChild(card);
  });
}

function playMap(id) {
  const rec = getLocalMap(id);
  if (!rec) { renderGallery(); return; }
  let map;
  try {
    map = deserialize(rec.data);   // string -> validated schema object (throws if corrupt)
  } catch (e) {
    window.alert('This map is corrupted and cannot be played.');
    return;
  }
  onPlay(map);
}
