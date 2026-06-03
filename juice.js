// Game-feel juice: screen shake + hit-stop. No deps. Call updateJuice once per frame
// from the loop AFTER the camera is positioned. Shake is undo-then-reapply (never accumulates).

// --- Screen shake ---
let _shakeAmp = 0;          // current peak amplitude (px)
let _shakeEnd = 0;          // performance.now() timestamp when this shake ends
let _shakeStart = 0;        // when the current shake began (for decay)
let _appliedX = 0;          // offset applied to camera last frame (to undo this frame)
let _appliedY = 0;

// --- Hit-stop ---
let _stopActive = false;
let _stopEnd = 0;           // performance.now() timestamp when the freeze ends
let _stopPrevScale = 1;     // world.timeScale captured when the freeze STARTED

// Accumulate a shake (px amplitude, duration). Stronger/longer of the two wins so
// overlapping hits don't cut each other short.
export function shake(intensity = 6, ms = 180) {
  const now = performance.now();
  const remaining = Math.max(0, _shakeEnd - now);
  _shakeAmp = Math.max(_shakeAmp, intensity);
  if (ms > remaining) { _shakeEnd = now + ms; _shakeStart = now; }
}

// Brief freeze: capture world.timeScale, set 0, restore the captured value after ms.
// Cooperates with the modal pause (which sets timeScale=0 then back to 1).
export function hitStop(ms = 60) {
  const now = performance.now();
  if (!_stopActive) {
    _stopPrevScale = (typeof world !== 'undefined') ? world.timeScale : 1;
    _stopActive = true;
  }
  _stopEnd = Math.max(_stopEnd, now + ms);
  if (typeof world !== 'undefined') world.timeScale = 0;
}

// Per-frame: undo last frame's shake offset, apply a fresh decaying random one, and
// release a finished hit-stop. cam is the q5play camera (passed by the loop).
export function updateJuice(cam) {
  if (!cam) return;
  const now = performance.now();

  // Undo last frame's offset first so shake never accumulates onto the camera target.
  cam.x -= _appliedX;
  cam.y -= _appliedY;
  _appliedX = 0;
  _appliedY = 0;

  if (now < _shakeEnd) {
    const span = _shakeEnd - _shakeStart;
    const decay = span > 0 ? Math.max(0, (_shakeEnd - now) / span) : 0;
    const amp = _shakeAmp * decay;
    _appliedX = (Math.random() * 2 - 1) * amp;
    _appliedY = (Math.random() * 2 - 1) * amp;
    cam.x += _appliedX;
    cam.y += _appliedY;
  } else {
    _shakeAmp = 0;
  }

  if (_stopActive && now >= _stopEnd) {
    if (typeof world !== 'undefined') world.timeScale = _stopPrevScale;
    _stopActive = false;
  }
}
