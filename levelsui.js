// Built-in levels menu (#levels-screen): lists the hand-made levels that ship with the
// game in the repo's `levels/` folder (levels/manifest.json + levels/<file>.json), loaded
// with a plain fetch of static files — no backend, no login. Picking one plays it through
// the normal custom-level engine path (sketch.js enterCustom). Titles are escaped before
// innerHTML. Mirrors mapbrowser.js, but the source is repo files instead of localStorage.
import { deserialize } from './levelschema.js';

let onPlay = () => {};
let onClose = () => {};
let open = false;

const el = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- public API ------------------------------------------------------------

export function initLevels({ onPlay: play, onClose: close } = {}) {
  if (play) onPlay = play;
  if (close) onClose = close;
  const back = el('levels-back');
  if (back) back.addEventListener('click', () => { closeLevels(); onClose(); });
}

export function isLevelsOpen() { return open; }

export function openLevels() {
  const screen = el('levels-screen');
  if (!screen) return;
  open = true;
  screen.style.display = 'flex';
  renderLevels();
}

export function closeLevels() {
  open = false;
  const screen = el('levels-screen');
  if (screen) screen.style.display = 'none';
}

// --- loading + gallery -----------------------------------------------------

// Fetch the manifest, then each level file. Returns [{ title, map }]; a missing or
// corrupt level is skipped so one bad file never breaks the whole menu.
async function loadLevels() {
  const res = await fetch('levels/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest ' + res.status);
  const manifest = await res.json();
  const entries = Array.isArray(manifest) ? manifest : [];
  const out = [];
  for (const entry of entries) {
    if (!entry || !entry.file) continue;
    try {
      const r = await fetch('levels/' + entry.file, { cache: 'no-store' });
      if (!r.ok) { console.warn(`Levels: skipped "${entry.file}" (HTTP ${r.status})`); continue; }
      const raw = await r.json();
      const map = deserialize(JSON.stringify(raw));   // validates the schema; throws if bad
      out.push({ title: entry.title || raw.title || entry.file, map });
    } catch (e) {
      // Skip one bad level but keep the rest — and tell the author why it didn't show.
      console.warn(`Levels: skipped "${entry.file}" — ${e && e.message ? e.message : 'load/parse error'}`);
    }
  }
  return out;
}

async function renderLevels() {
  const list = el('level-list');
  const empty = el('level-list-empty');
  if (!list) return;
  list.innerHTML = '';
  if (empty) { empty.textContent = 'Loading…'; empty.style.display = 'block'; }

  let levels;
  try {
    levels = await loadLevels();
  } catch (e) {
    console.warn(`Levels: could not load levels/manifest.json — ${e && e.message ? e.message : e}`);
    if (!open) return;
    if (empty) { empty.textContent = 'Could not load levels'; empty.style.display = 'block'; }
    return;
  }
  if (!open) return;   // menu was closed while we were loading

  if (levels.length === 0) {
    if (empty) { empty.textContent = 'No levels yet'; empty.style.display = 'block'; }
    return;
  }
  if (empty) empty.style.display = 'none';

  levels.forEach((lv) => {
    const card = document.createElement('div');
    card.className = 'lb-entry map-card';
    card.innerHTML = `
      <span class="lb-name" style="flex:2;">${escapeHtml(lv.title)}</span>
      <span class="lb-score" style="color:#2ecc71; width:auto; min-width:48px;">Play</span>
    `;
    card.addEventListener('click', () => onPlay(lv.map));
    list.appendChild(card);
  });
}
