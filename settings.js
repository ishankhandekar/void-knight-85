// Settings overlay: gear button (top-right) + remappable keybinds UI.
import {
  keybinds, ACTION_ORDER, ACTION_LABELS,
  addBinding, removeBinding, resetKeybinds,
} from './keybinds.js';
import {
  prefs, setMusicVolume, setSfxVolume, setGraphics, setShowFps, resetPrefs,
} from './prefs.js';

// --- Canonical modal-priority contract (top-most open modal closes first) ---
// Every full-screen modal (settings, pause, customize, auth, editor, browser)
// registers a capture-phase window keydown listener that calls
// stopImmediatePropagation() on Esc. Capture listeners on the SAME target fire
// in REGISTRATION order, so without coordination the FIRST-registered module
// would always win Esc regardless of which modal is visually on top.
//
// To make Esc obey stacking instead of load order, each modal pushes itself
// onto a shared window-level stack when it opens and removes itself when it
// closes. An Esc handler only acts when its modal is the TOP of the stack; if
// not, it returns WITHOUT consuming the event so the true top-most modal's
// listener (which fires later or earlier, but only IT passes the gate) handles
// it. The helper lives on window so each modal can be self-contained and not
// depend on another module's eval order.
function modalStack() {
  return (window.__voidModalStack || (window.__voidModalStack = []));
}
export function pushModal(id) {
  const s = modalStack();
  const i = s.indexOf(id);
  if (i !== -1) s.splice(i, 1);   // re-opening: move to top, never duplicate
  s.push(id);
}
export function popModal(id) {
  const s = modalStack();
  const i = s.indexOf(id);
  if (i !== -1) s.splice(i, 1);
}
export function isTopModal(id) {
  const s = modalStack();
  return s.length > 0 && s[s.length - 1] === id;
}

const MODAL_ID = 'settings';

let open = false;
let capturingAction = null;
let onOpen = () => {};
let onClose = () => {};

// In-game (pause-menu) wiring. Populated by initSettingsInGame().
let isInGame = null;
let onResume = null;
let onRestart = null;
let onQuit = null;

const btn = document.getElementById('settings-btn');
const screen = document.getElementById('settings-screen');
const bindsContainer = document.getElementById('settings-binds');
const resetBtn = document.getElementById('settings-reset');
const musicSlider = document.getElementById('music-slider');
const musicValue = document.getElementById('music-value');
const sfxSlider = document.getElementById('sfx-slider');
const sfxValue = document.getElementById('sfx-value');
const fpsToggle = document.getElementById('fps-toggle');
const gfxButtons = [...document.querySelectorAll('.gfx-btn')];

const KEY_DISPLAY = {
  left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN',
  space: 'SPACE', enter: 'ENTER', shift: 'SHIFT',
  control: 'CTRL', alt: 'ALT', tab: 'TAB',
};

function keyDisplay(k) {
  return KEY_DISPLAY[k] || k.toUpperCase();
}

// Translate a DOM keydown into the key id q5play's keyboard uses.
function eventToKey(e) {
  switch (e.key) {
    case ' ':          return 'space';
    case 'ArrowLeft':  return 'left';
    case 'ArrowRight': return 'right';
    case 'ArrowUp':    return 'up';
    case 'ArrowDown':  return 'down';
    case 'Enter':      return 'enter';
    case 'Tab':        return 'tab';
    case 'Shift':      return 'shift';
    case 'Control':    return 'control';
    case 'Alt':        return 'alt';
  }
  if (e.key && e.key.length === 1) return e.key.toLowerCase();
  return null;
}

function renderBinds() {
  bindsContainer.innerHTML = '';
  for (const action of ACTION_ORDER) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('div');
    label.className = 'settings-label';
    label.textContent = ACTION_LABELS[action];
    row.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'settings-chips';

    for (const key of keybinds[action]) {
      const chip = document.createElement('span');
      chip.className = 'settings-chip';
      chip.textContent = keyDisplay(key);

      const x = document.createElement('span');
      x.className = 'settings-chip-x';
      x.textContent = '×';
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeBinding(action, key);
        renderBinds();
      });
      chip.appendChild(x);
      chips.appendChild(chip);
    }

    const add = document.createElement('span');
    add.className = 'settings-add';
    if (capturingAction === action) {
      add.textContent = 'PRESS A KEY…';
      add.classList.add('capturing');
    } else {
      add.textContent = '+ ADD';
    }
    add.addEventListener('click', (ev) => {
      ev.stopPropagation();
      capturingAction = capturingAction === action ? null : action;
      renderBinds();
    });
    chips.appendChild(add);

    row.appendChild(chips);
    bindsContainer.appendChild(row);
  }
}

function cancelCapture() {
  if (capturingAction !== null) {
    capturingAction = null;
    renderBinds();
  }
}

export function openSettings() {
  if (open) return;
  open = true;
  pushModal(MODAL_ID);
  screen.style.display = 'flex';
  btn.classList.add('active');
  renderBinds();
  renderDisplayControls();
  if (isInGame) setInGameControls(isInGame());
  onOpen();
}

function closeSettings() {
  if (!open) return;
  open = false;
  popModal(MODAL_ID);
  cancelCapture();
  screen.style.display = 'none';
  btn.classList.remove('active');
  setInGameControls(false);
  onClose();
}

btn.addEventListener('click', () => (open ? closeSettings() : openSettings()));
document.getElementById('settings-close').addEventListener('click', closeSettings);
resetBtn.addEventListener('click', () => {
  resetKeybinds();
  resetPrefs();
  renderBinds();
  renderDisplayControls();
});

function renderDisplayControls() {
  for (const b of gfxButtons) b.classList.toggle('active', b.dataset.gfx === prefs.graphics);
  if (musicSlider) musicSlider.value = Math.round(prefs.musicVolume * 100);
  if (musicValue) musicValue.textContent = Math.round(prefs.musicVolume * 100) + '%';
  if (sfxSlider) sfxSlider.value = Math.round(prefs.sfxVolume * 100);
  if (sfxValue) sfxValue.textContent = Math.round(prefs.sfxVolume * 100) + '%';
  if (fpsToggle) {
    fpsToggle.textContent = prefs.showFps ? 'ON' : 'OFF';
    fpsToggle.classList.toggle('active', prefs.showFps);
  }
}

for (const b of gfxButtons) {
  b.addEventListener('click', () => { setGraphics(b.dataset.gfx); renderDisplayControls(); });
}
if (musicSlider) musicSlider.addEventListener('input', () => {
  setMusicVolume(musicSlider.value / 100);
  if (musicValue) musicValue.textContent = musicSlider.value + '%';
});
if (sfxSlider) sfxSlider.addEventListener('input', () => {
  setSfxVolume(sfxSlider.value / 100);
  if (sfxValue) sfxValue.textContent = sfxSlider.value + '%';
});
if (fpsToggle) fpsToggle.addEventListener('click', () => { setShowFps(!prefs.showFps); renderDisplayControls(); });

renderDisplayControls();

// Capture phase on window so rebind keys (and Esc) never leak into the game.
window.addEventListener('keydown', (e) => {
  if (!open) {
    // Esc opens Settings as the in-game pause menu while a level is active (single Esc owner).
    if (e.key === 'Escape' && isInGame && isInGame()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openSettings();
    }
    return;
  }

  if (capturingAction !== null) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { cancelCapture(); return; }
    const key = eventToKey(e);
    if (key) {
      addBinding(capturingAction, key);
      capturingAction = null;
      renderBinds();
    }
    return;
  }

  if (e.key === 'Escape') {
    // Only the top-most open modal consumes Esc. If another modal stacked on
    // top of Settings, leave the event untouched so its listener handles it.
    if (!isTopModal(MODAL_ID)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeSettings();
  }
}, true);

export function initSettings(cb) {
  if (cb && cb.onOpen) onOpen = cb.onOpen;
  if (cb && cb.onClose) onClose = cb.onClose;
}

// Wire the in-game pause controls (Resume / Restart / Quit to Menu) that the
// host surfaces inside #settings-screen while a level is active. Each button
// closes Settings first, then fires its callback. closeSettings() already runs
// the host's onClose (which resumes the game), so onResume can be a no-op.
export function initSettingsInGame(cb) {
  if (!cb) return;
  if (cb.isInGame) isInGame = cb.isInGame;
  if (cb.onResume) onResume = cb.onResume;
  if (cb.onRestart) onRestart = cb.onRestart;
  if (cb.onQuit) onQuit = cb.onQuit;

  const resumeBtn = document.getElementById('settings-resume');
  const restartBtn = document.getElementById('settings-restart');
  const quitBtn = document.getElementById('settings-quit');

  if (resumeBtn) resumeBtn.addEventListener('click', () => {
    closeSettings();
    if (onResume) onResume();
  });
  if (restartBtn) restartBtn.addEventListener('click', () => {
    closeSettings();
    if (onRestart) onRestart();
  });
  if (quitBtn) quitBtn.addEventListener('click', () => {
    closeSettings();
    if (onQuit) onQuit();
  });
}

// Show/hide the in-game controls block. Flex when active, hidden otherwise.
export function setInGameControls(show) {
  const ingame = document.getElementById('settings-ingame');
  if (!ingame) return;
  ingame.style.display = show ? 'flex' : 'none';
}

export function isSettingsOpen() {
  return open;
}
