// Knight color customization: body, head, and sword colors. Persisted to localStorage.
// Defaults are the original near-neutral gray (low saturation -> reproduces the original look).

const DEFAULTS = {
  bodyColor: '#c2bfc6',
  headColor: '#c2bfc6',
  swordColor: '#c2bfc6',
};

const STORAGE_KEY = 'voidKnightCustomization';
const HEX = /^#[0-9a-fA-F]{6}$/;

function load() {
  const c = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (HEX.test(saved.bodyColor)) c.bodyColor = saved.bodyColor;
    if (HEX.test(saved.headColor)) c.headColor = saved.headColor;
    if (HEX.test(saved.swordColor)) c.swordColor = saved.swordColor;
  } catch (e) { /* defaults */ }
  return c;
}

export const customization = load();

const _listeners = [];
export function onCustomizationChange(fn) { _listeners.push(fn); }
function notify(key) { for (const fn of _listeners) fn(key, customization); }

export function saveCustomization() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(customization)); }
  catch (e) { console.warn('voidKnight: could not persist customization (storage full or blocked)', e); }
}

export function setBodyColor(hex) { if (HEX.test(hex)) { customization.bodyColor = hex; saveCustomization(); notify('bodyColor'); } }
export function setHeadColor(hex) { if (HEX.test(hex)) { customization.headColor = hex; saveCustomization(); notify('headColor'); } }
export function setSwordColor(hex) { if (HEX.test(hex)) { customization.swordColor = hex; saveCustomization(); notify('swordColor'); } }

export function resetCustomization() {
  Object.assign(customization, DEFAULTS);
  saveCustomization();
  notify('reset');
}
