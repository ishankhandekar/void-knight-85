// Sign-in screen: Google + email/password. Calls leaderboard.js auth fns; sketch.js reacts to
// the resulting auth-state change (fetch username, etc.). Just drives the #auth-screen UI here.
import { signInWithGoogle, signInEmail, signUpEmail } from './leaderboard.js';
import { pushModal, popModal, isTopModal } from './settings.js';

const MODAL_ID = 'auth';

let open = false;
let onOpen = () => {};
let onClose = () => {};
let forced = false;   // forced onboarding: can't be dismissed until a user exists

const screen = document.getElementById('auth-screen');
const googleBtn = document.getElementById('auth-google');
const emailInput = document.getElementById('auth-email');
const passInput = document.getElementById('auth-pass');
const signinBtn = document.getElementById('auth-signin');
const signupBtn = document.getElementById('auth-signup');
const errorEl = document.getElementById('auth-error');

function friendly(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/email-already-in-use': 'That email is already registered — try Sign In.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong password.',
    'auth/user-not-found': 'No account for that email — try Sign Up.',
    'auth/popup-closed-by-user': 'Sign-in cancelled.',
    'auth/popup-blocked': 'Popup blocked — allow popups and retry.',
    'auth/network-request-failed': 'Network error. Try again.',
  };
  return map[code] || (e && e.message) || 'Sign-in failed.';
}

function setError(msg) { if (errorEl) errorEl.textContent = msg || ''; }

async function run(fn) {
  setError('');
  try { await fn(); closeAuth(); }
  catch (e) { setError(friendly(e)); }
}

export function openAuth() {
  if (open) return;
  open = true;
  pushModal(MODAL_ID);
  if (screen) screen.style.display = 'flex';
  setError('');
  onOpen();
  setTimeout(() => { if (emailInput) emailInput.focus(); }, 0);
}

export function closeAuth() {
  if (!open) return;
  open = false;
  popModal(MODAL_ID);
  if (screen) screen.style.display = 'none';
  onClose();
}

export function isAuthOpen() { return open; }

// During forced first-run onboarding, hide the Back button and block Escape-close.
export function setAuthForced(v) {
  forced = !!v;
  const back = document.getElementById('auth-back');
  if (back) back.style.display = forced ? 'none' : '';
}

export function initAuth(cb) {
  if (cb && cb.onOpen) onOpen = cb.onOpen;
  if (cb && cb.onClose) onClose = cb.onClose;
}

// Read field values safely — the handlers fire long after load, but guard in case markup changed.
const emailVal = () => (emailInput ? emailInput.value.trim() : '');
const passVal = () => (passInput ? passInput.value : '');

if (googleBtn) googleBtn.addEventListener('click', () => run(() => signInWithGoogle()));
if (signinBtn) signinBtn.addEventListener('click', () => run(() => signInEmail(emailVal(), passVal())));
if (signupBtn) signupBtn.addEventListener('click', () => run(() => signUpEmail(emailVal(), passVal())));
const backBtn = document.getElementById('auth-back');
if (backBtn) backBtn.addEventListener('click', closeAuth);

// Keep keys out of the game while open; Enter in a field submits a sign-in.
window.addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'Escape') {
    // Only the top-most open modal handles Esc; yield otherwise.
    if (!isTopModal(MODAL_ID)) return;
    // Always consume Esc while Auth is on top so it never leaks to a modal
    // below or the game. During forced onboarding it must NOT close.
    e.preventDefault(); e.stopImmediatePropagation();
    if (!forced) closeAuth();
  } else if (e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('auth-input')) {
    e.preventDefault(); e.stopImmediatePropagation();
    run(() => signInEmail(emailInput.value.trim(), passInput.value));
  }
}, true);
