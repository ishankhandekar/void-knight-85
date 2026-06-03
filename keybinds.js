// Central keybind config: single source of truth for gameplay input.
// q5play exposes `keyboard` as a global; .pressing(k) = held, .presses(k) = tapped this frame.

const DEFAULT_KEYBINDS = {
  left:    ['left', 'a'],
  right:   ['right', 'd'],
  jump:    ['up', 'w', 'space'],
  attack:  ['p', 'q'],
  smash:   ['down', 's'],
  restart: ['r'],
};

export const ACTION_ORDER = ['left', 'right', 'jump', 'attack', 'smash', 'restart'];

export const ACTION_LABELS = {
  left:    'Move Left',
  right:   'Move Right',
  jump:    'Jump',
  attack:  'Attack',
  smash:   'Smash',
  restart: 'Restart',
};

const STORAGE_KEY = 'voidKnightKeybinds';

function freshDefaults() {
  const out = {};
  for (const action in DEFAULT_KEYBINDS) out[action] = DEFAULT_KEYBINDS[action].slice();
  return out;
}

function load() {
  const binds = freshDefaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const action in binds) {
      if (Array.isArray(saved[action])) {
        // Keep only valid string keys, drop dupes — guards against corrupt storage
        // (non-string entries would make keyboard.pressing(k) misbehave).
        const clean = [];
        for (const k of saved[action]) {
          if (typeof k === 'string' && k && !clean.includes(k)) clean.push(k);
        }
        binds[action] = clean;
      }
    }
  } catch (e) { /* corrupt/unavailable storage -> defaults */ }
  return binds;
}

// Mutated in place so importers keep a live reference.
export const keybinds = load();

export function saveKeybinds() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds)); } catch (e) { /* ignore */ }
}

export function resetKeybinds() {
  const def = freshDefaults();
  for (const action in def) keybinds[action] = def[action];
  saveKeybinds();
}

export function addBinding(action, key) {
  const keys = keybinds[action];
  if (!keys || keys.includes(key)) return false;
  keys.push(key);
  saveKeybinds();
  return true;
}

export function removeBinding(action, key) {
  const keys = keybinds[action];
  if (!keys) return;
  const i = keys.indexOf(key);
  if (i !== -1) keys.splice(i, 1);
  saveKeybinds();
}

export function actionHeld(action) {
  const keys = keybinds[action];
  if (!keys) return false;
  for (const key of keys) if (keyboard.pressing(key)) return true;
  return false;
}

export function actionPressed(action) {
  const keys = keybinds[action];
  if (!keys) return false;
  for (const key of keys) if (keyboard.presses(key)) return true;
  return false;
}
