// In-game PAUSE overlay controller: Resume / Restart / Quit (module pattern = settings.js).
// #pause-screen and its buttons are added to index.html later, so grab handles lazily
// (tolerate missing at module load; re-grab in openPause).
import { pushModal, popModal, isTopModal } from './settings.js';

const MODAL_ID = 'pause';

let open = false;
let onResume = () => {};
let onRestart = () => {};
let onQuit = () => {};

let screen = null;
let resumeBtn = null;
let restartBtn = null;
let quitBtn = null;
let wired = false;

// (Re)grab DOM handles and attach button listeners once they exist.
function grab() {
  if (!screen) screen = document.getElementById('pause-screen');
  if (!resumeBtn) resumeBtn = document.getElementById('pause-resume');
  if (!restartBtn) restartBtn = document.getElementById('pause-restart');
  if (!quitBtn) quitBtn = document.getElementById('pause-quit');
  if (!wired && resumeBtn && restartBtn && quitBtn) {
    resumeBtn.addEventListener('click', () => { closePause(); onResume(); });
    restartBtn.addEventListener('click', () => { closePause(); onRestart(); });
    quitBtn.addEventListener('click', () => { closePause(); onQuit(); });
    wired = true;
  }
}

export function openPause() {
  if (open) return;
  grab();
  open = true;
  pushModal(MODAL_ID);
  if (screen) screen.style.display = 'flex';
}

export function closePause() {
  if (!open) return;
  open = false;
  popModal(MODAL_ID);
  if (screen) screen.style.display = 'none';
}

export function isPauseOpen() { return open; }

export function initPause(cb) {
  if (cb && cb.onResume) onResume = cb.onResume;
  if (cb && cb.onRestart) onRestart = cb.onRestart;
  if (cb && cb.onQuit) onQuit = cb.onQuit;
  grab();
}

// Capture phase so Esc never leaks into the game; while open, Esc resumes.
// Only act when Pause is the top-most open modal; otherwise leave the event
// for whichever modal is stacked above it (settings/auth/customize).
window.addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'Escape') {
    if (!isTopModal(MODAL_ID)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closePause();
    onResume();
  }
}, true);
