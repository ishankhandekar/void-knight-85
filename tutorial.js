// Dedicated first-run tutorial: a small, enclosed practice level plus the guided
// on-screen prompts. The level is built far to the right of the main level so the
// two never collide spatially (both exist in the world at once). It mirrors the
// buildLevel() interface in level.js so sketch.js can run it through the same loop.
import { actionHeld, actionPressed } from './keybinds.js';

const BLOCK = 40;
const TEX = {
  platform: 'Sprites/textures/platformtexture.png',
  wall: 'Sprites/textures/walltexture.png',
};

export function buildTutorialLevel() {
  const platformGroup = new Group();

  function block(x, y, texture = 'platform') {
    const b = new platformGroup.Sprite(x, y, BLOCK, BLOCK);
    b.physics = STATIC;
    b.color = '#1b3148';
    b.stroke = '#7fb7dc';
    b.strokeWeight = 2;
    b.bounciness = 0;
    const p = TEX[texture] ?? texture;
    if (p) { b.img = p; b.img.scale.x = BLOCK / 32; b.img.scale.y = BLOCK / 32; }
    return b;
  }

  function line(x, y, n, dir, texture = 'platform') {
    for (let i = 0; i < n; i++) {
      let bx = x, by = y, tex = texture;
      if (dir === 'right') bx = x + i * BLOCK;
      else if (dir === 'left') bx = x - i * BLOCK;
      else if (dir === 'up') { by = y - i * BLOCK; tex = 'wall'; }
      else if (dir === 'down') { by = y + i * BLOCK; tex = 'wall'; }
      block(bx, by, tex);
    }
  }

  const BX = 2000;       // far right of the main level (which ends near x=840)
  const FLOOR = 640;     // floor block centers; floor top is FLOOR - BLOCK/2 = 620

  line(BX, FLOOR, 22, 'right');                 // floor
  line(BX, FLOOR, 7, 'up');                     // left wall
  line(BX + 21 * BLOCK, FLOOR, 7, 'up');        // right wall
  line(BX, FLOOR - 6 * BLOCK, 22, 'right', 'wall'); // ceiling

  // A 2-block step mid-path so the player has to jump over/onto it.
  block(BX + 8 * BLOCK, FLOOR - BLOCK);
  block(BX + 8 * BLOCK, FLOOR - 2 * BLOCK);

  // Exit portal near the right end, resting on the floor.
  const doorSprite = new Sprite(BX + 19 * BLOCK, FLOOR - 70, 80, 140);
  doorSprite.physics = STATIC;
  doorSprite.color = '#f4d35e';
  doorSprite.stroke = '#b8860b';
  doorSprite.strokeWeight = 3;
  doorSprite.bounciness = 0;
  doorSprite.addAni('Sprites/portaltexture.png', 9, '32x32');
  doorSprite.anis.portaltexture.frameDelay = 12;
  doorSprite.anis.portaltexture.scale.x = 32 / 16;
  doorSprite.anis.portaltexture.scale.y = 56 / 28;
  doorSprite.changeAni('portaltexture');
  doorSprite.ani.play();

  const spawnX = BX + 2 * BLOCK;          // near the left, on the floor
  const spawnY = FLOOR - BLOCK / 2 - 16;  // rest the 32px-tall player exactly on the floor top

  // One practice slug between the step and the portal.
  const enemySpawns = [
    { x: BX + 13 * BLOCK, y: FLOOR - BLOCK, left: BX + 11 * BLOCK, right: BX + 15 * BLOCK },
  ];

  return {
    platforms: platformGroup,
    door: doorSprite,
    update: () => {},
    updateSpikes: () => {},
    freeze: () => {},
    reset: () => {},
    spawnX,
    spawnY,
    enemySpawns,
  };
}

// --- Guided prompts (#tutorial-hint overlay) -------------------------------
const HINTS = [
  'Move:  A / D   or   ← / →',
  'Jump:  W   or   Space',
  'Attack:  Q   — defeat the slug!',
  'Smash:  jump, then  S  above an enemy.   ▸ Reach the portal!',
];

let stage = 0;
let hintEl = null;
function el() { return hintEl || (hintEl = document.getElementById('tutorial-hint')); }
function render() { const e = el(); if (e) e.textContent = HINTS[Math.min(stage, HINTS.length - 1)]; }

export function resetTutorialHints() { stage = 0; render(); }
export function showTutorialHint() { const e = el(); if (e) e.style.display = 'block'; render(); }
export function hideTutorialHint() { const e = el(); if (e) e.style.display = 'none'; }

// Advance the prompt as the player demonstrates each ability. The portal is the
// actual completion (handled in sketch.js); this is purely the teaching overlay.
export function updateTutorialHints(player) {
  if (stage === 0) {
    if (actionHeld('left') || actionHeld('right')) { stage = 1; render(); }
  } else if (stage === 1) {
    if (player.sprite.vel.y < -4) { stage = 2; render(); }   // advance only on a real jump
  } else if (stage === 2) {
    if ((player.kills.slug || 0) > 0) { stage = 3; render(); }
  }
}
