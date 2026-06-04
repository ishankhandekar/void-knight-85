// Local-only data layer (no backend, no network). Everything the game used to keep in
// Firebase now lives in this browser's localStorage:
//   - the player's chosen username + onboarding flags + customization colors  (one "profile")
//   - the personal leaderboard (kept in sketch.js under its own key)
//   - saved custom maps (the SAME 'voidKnightMaps' store the map editor writes to)
// There is nothing secret here and nothing leaves the device.

const PROFILE_KEY = 'voidKnightProfile';   // { username, customizeDone, tutorialDone, customization }
const MAPS_KEY    = 'voidKnightMaps';      // { [name]: serializedMapString }  (written by mapeditor.js)

// --- username validation (unchanged rules: 3-20 letters/digits) -------------
export const USERNAME_RE = /^[A-Za-z0-9]{3,20}$/;
export function isValidUsername(name) { return USERNAME_RE.test(name); }

// Titles: 3-40 chars from letters/digits/space and a few punctuation marks.
export const MAP_TITLE_RE = /^[\w \-!?.,']{3,40}$/;
export function isValidMapTitle(t) { return MAP_TITLE_RE.test(t); }

// --- profile (username + flags + colors) -----------------------------------
const EMPTY_PROFILE = { username: null, customizeDone: false, tutorialDone: false, customization: null };

export function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const p = JSON.parse(raw);
    return {
      username: typeof p.username === 'string' ? p.username : null,
      customizeDone: !!p.customizeDone,
      tutorialDone: !!p.tutorialDone,
      customization: p.customization || null,
    };
  } catch { return { ...EMPTY_PROFILE }; }
}

// Merge a partial update into the stored profile. Returns the new profile.
export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch (e) { /* storage full/blocked */ }
  return next;
}

// --- saved maps (shared store with the editor) -----------------------------
function readMaps() {
  try { const raw = localStorage.getItem(MAPS_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function writeMaps(obj) {
  try { localStorage.setItem(MAPS_KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
}

// [{ id, title, data }] — id and title are the saved name; data is the serialized schema string.
export function listMaps() {
  const store = readMaps();
  return Object.keys(store).map((name) => ({ id: name, title: name, data: store[name] }));
}

export function getLocalMap(id) {
  const store = readMaps();
  return Object.prototype.hasOwnProperty.call(store, id) ? { id, title: id, data: store[id] } : null;
}

export function deleteMap(id) {
  const store = readMaps();
  if (!Object.prototype.hasOwnProperty.call(store, id)) return false;
  delete store[id];
  return writeMaps(store);
}
