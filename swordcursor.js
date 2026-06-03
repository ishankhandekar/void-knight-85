// Custom crosshair cursor. Replaces the OS pointer on menus/UI with a clean, small
// crosshair (four arms + a center dot) centered on the pointer, with a subtle click pulse.
// Hidden during active gameplay (driven by the existing body.playing class).
//
// Visibility: `body.playing .vk-cursor { display:none }` hides it during play.
// Form fields keep the native I-beam so the username/email/password/comment fields stay usable.
// Sole export: initSwordCursor(). Idempotent. (Filename kept for import compatibility.)

const STYLE_ID = 'vk-cursor-style';
const ROOT_CLASS = 'vk-cursor';          // wrapper that follows (and centers on) the mouse
const CLICK_CLASS = 'click';

// Crosshair geometry (CSS px). Small + clean.
const ARM = 6;        // length of each arm
const GAP = 4;        // gap from center to the start of each arm
const THICK = 2;      // arm thickness
const DOT = 2;        // center dot size
const COLOR = '#f4f4f5';
const SIZE = 2 * (GAP + ARM) + THICK;    // bounding box side; center is the hotspot

const STYLE_TEXT = `
/* Hide the OS cursor everywhere; the crosshair stands in for it. */
html, body, * { cursor: none !important; }
/* ...but keep the real caret/I-beam on text controls so typing stays usable. */
input, textarea, select, [contenteditable] { cursor: auto !important; }

.${ROOT_CLASS} {
  position: fixed; left: 0; top: 0; width: ${SIZE}px; height: ${SIZE}px;
  transform: translate(-50%, -50%);     /* center the crosshair on the pointer */
  pointer-events: none; z-index: 99999; display: none;
}
.${ROOT_CLASS}.ready { display: block; }
body.playing .${ROOT_CLASS} { display: none !important; }

.${ROOT_CLASS} i {
  position: absolute; background: ${COLOR};
  box-shadow: 0 0 0 1px rgba(0,0,0,.55);   /* thin dark outline so it reads on any background */
}
/* vertical arms */
.${ROOT_CLASS} .up, .${ROOT_CLASS} .down {
  left: 50%; margin-left: -${THICK / 2}px; width: ${THICK}px; height: ${ARM}px;
}
.${ROOT_CLASS} .up   { top: 0; }
.${ROOT_CLASS} .down { bottom: 0; }
/* horizontal arms */
.${ROOT_CLASS} .left, .${ROOT_CLASS} .right {
  top: 50%; margin-top: -${THICK / 2}px; height: ${THICK}px; width: ${ARM}px;
}
.${ROOT_CLASS} .left  { left: 0; }
.${ROOT_CLASS} .right { right: 0; }
/* center dot */
.${ROOT_CLASS} .dot {
  left: 50%; top: 50%; width: ${DOT}px; height: ${DOT}px;
  margin-left: -${DOT / 2}px; margin-top: -${DOT / 2}px;
}

/* subtle click feedback */
.${ROOT_CLASS}.${CLICK_CLASS} { animation: vk-ch-pulse 170ms ease-out; }
@keyframes vk-ch-pulse {
  0%   { transform: translate(-50%, -50%) scale(1); }
  40%  { transform: translate(-50%, -50%) scale(0.8); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
`;

let initialized = false;
let rootEl = null;

function injectStyle() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = STYLE_TEXT;
  document.head.appendChild(s);
}

function ensureEls() {
  if (typeof document === 'undefined' || !document.body) return false;
  rootEl = document.querySelector('.' + ROOT_CLASS);
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.className = ROOT_CLASS;
    for (const cls of ['up', 'down', 'left', 'right', 'dot']) {
      const seg = document.createElement('i');
      seg.className = cls;
      rootEl.appendChild(seg);
    }
    document.body.appendChild(rootEl);
  }
  return true;
}

function onMouseMove(e) {
  if (!rootEl) return;
  rootEl.style.left = e.clientX + 'px';
  rootEl.style.top = e.clientY + 'px';
  if (!rootEl.classList.contains('ready')) rootEl.classList.add('ready');
}

function onMouseDown() {
  if (!rootEl) return;
  rootEl.classList.remove(CLICK_CLASS);
  void rootEl.offsetWidth;          // reflow so the pulse restarts on rapid clicks
  rootEl.classList.add(CLICK_CLASS);
}

function onAnimEnd(e) {
  if (e.animationName === 'vk-ch-pulse' && rootEl) rootEl.classList.remove(CLICK_CLASS);
}

function onLeave() { if (rootEl) rootEl.classList.remove('ready'); }
function onEnter() { if (rootEl) rootEl.classList.add('ready'); }

export function initSwordCursor() {
  if (typeof document === 'undefined') return;
  if (initialized) { if (!rootEl || !document.body.contains(rootEl)) ensureEls(); return; }
  injectStyle();
  if (!ensureEls()) return;     // body not ready yet; caller may retry
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mousedown', onMouseDown, { passive: true });
  document.addEventListener('animationend', onAnimEnd);
  document.addEventListener('mouseleave', onLeave);
  document.addEventListener('mouseenter', onEnter);
  initialized = true;
}
