// CUSTOMIZE screen controller: body / head / sword color pickers + open/close.
// The live knight preview is rendered by sketch.js (it owns the player).
import {
  customization, setBodyColor, setHeadColor, setSwordColor, resetCustomization,
} from './customization.js';
import { pushModal, popModal, isTopModal } from './settings.js';

const MODAL_ID = 'customize';

let open = false;
let onOpen = () => {};
let onClose = () => {};
let continueMode = false;   // onboarding: relabel Back as "Continue →"

const screen = document.getElementById('customize-screen');
const bodyInput = document.getElementById('body-color');
const bodyVal = document.getElementById('body-color-val');
const headInput = document.getElementById('head-color');
const headVal = document.getElementById('head-color-val');
const swordInput = document.getElementById('sword-color');
const swordVal = document.getElementById('sword-color-val');
const resetBtn = document.getElementById('customize-reset');

function render() {
  bodyInput.value = customization.bodyColor; bodyVal.textContent = customization.bodyColor.toUpperCase();
  headInput.value = customization.headColor; headVal.textContent = customization.headColor.toUpperCase();
  swordInput.value = customization.swordColor; swordVal.textContent = customization.swordColor.toUpperCase();
}

export function openCustomize() {
  if (open) return;
  open = true;
  pushModal(MODAL_ID);
  screen.style.display = 'flex';
  render();
  onOpen();
}

export function closeCustomize() {
  if (!open) return;
  open = false;
  popModal(MODAL_ID);
  screen.style.display = 'none';
  onClose();
}

export function isCustomizeOpen() { return open; }

// During the onboarding customize step, the Back button reads "Continue →".
export function setCustomizeContinueMode(v) {
  continueMode = !!v;
  const back = document.getElementById('customize-back');
  if (back) back.textContent = continueMode ? 'Continue →' : '← Back';
}

export function initCustomize(cb) {
  if (cb && cb.onOpen) onOpen = cb.onOpen;
  if (cb && cb.onClose) onClose = cb.onClose;
}

bodyInput.addEventListener('input', () => { setBodyColor(bodyInput.value); bodyVal.textContent = bodyInput.value.toUpperCase(); });
headInput.addEventListener('input', () => { setHeadColor(headInput.value); headVal.textContent = headInput.value.toUpperCase(); });
swordInput.addEventListener('input', () => { setSwordColor(swordInput.value); swordVal.textContent = swordInput.value.toUpperCase(); });
resetBtn.addEventListener('click', () => { resetCustomization(); render(); });
document.getElementById('customize-back').addEventListener('click', closeCustomize);

// Esc closes (capture phase so it doesn't leak into the game). Only the
// top-most open modal consumes Esc; if another modal is stacked above this
// one, leave the event for its listener.
window.addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'Escape') {
    if (!isTopModal(MODAL_ID)) return;
    e.preventDefault(); e.stopImmediatePropagation(); closeCustomize();
  }
}, true);
