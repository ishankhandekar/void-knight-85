// User preferences: graphics quality, audio volumes, FPS overlay. Persisted to localStorage.

const DEFAULTS = {
  graphics: 'high',   // 'low' | 'medium' | 'high'
  musicVolume: 0.3,
  sfxVolume: 1.0,
  showFps: false,
};

const STORAGE_KEY = 'voidKnightPrefs';
const GRAPHICS_MODES = ['low', 'medium', 'high'];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function load() {
  const p = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (GRAPHICS_MODES.includes(saved.graphics)) p.graphics = saved.graphics;
    if (typeof saved.musicVolume === 'number') p.musicVolume = clamp01(saved.musicVolume);
    if (typeof saved.sfxVolume === 'number') p.sfxVolume = clamp01(saved.sfxVolume);
    if (typeof saved.showFps === 'boolean') p.showFps = saved.showFps;
  } catch (e) { /* defaults */ }
  return p;
}

export const prefs = load();

export function savePrefs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); }
  catch (e) { console.warn('voidKnight: could not persist prefs (storage full or blocked)', e); }
}

// --- Audio registry: keeps every Audio element in sync with the volume sliders ---
const _sfx = [];   // { audio, base }
const _music = [];

export function registerSfx(audio, base) {
  _sfx.push({ audio, base });
  audio.volume = clamp01(base * prefs.sfxVolume);
  return audio;
}

export function registerMusic(audio) {
  _music.push(audio);
  audio.volume = clamp01(prefs.musicVolume);
  return audio;
}

function applySfx() {
  for (const { audio, base } of _sfx) audio.volume = clamp01(base * prefs.sfxVolume);
}

function applyMusic() {
  for (const audio of _music) audio.volume = clamp01(prefs.musicVolume);
}

// --- Graphics: toggle the CSS overlays; the background tiling is gated in sketch.js ---
export function applyGraphics() {
  const scan = document.getElementById('scanlines');
  const crt = document.getElementById('crt-frame');
  const g = prefs.graphics;
  if (scan) scan.style.display = (g === 'high') ? 'block' : 'none';
  if (crt) crt.style.display = (g === 'high' || g === 'medium') ? 'block' : 'none';
}

export function setGraphics(mode) {
  if (!GRAPHICS_MODES.includes(mode)) return;
  prefs.graphics = mode;
  applyGraphics();
  savePrefs();
}

export function setMusicVolume(v) {
  prefs.musicVolume = clamp01(v);
  applyMusic();
  savePrefs();
}

export function setSfxVolume(v) {
  prefs.sfxVolume = clamp01(v);
  applySfx();
  savePrefs();
}

export function setShowFps(b) {
  prefs.showFps = !!b;
  savePrefs();
}

export function resetPrefs() {
  Object.assign(prefs, DEFAULTS);
  applyMusic();
  applySfx();
  applyGraphics();
  savePrefs();
}
