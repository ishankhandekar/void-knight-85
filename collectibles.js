// Gem collectibles + scoring. Gold ~16px coins (low-res pixel-art Mario-style discs)
// that pulse + "spin" via a horizontal squash; collected on manual AABB overlap with the
// player (gems are collider:'none', no physics interaction).
// Scoring: computeStars() rewards grabbing every gem and finishing under par.

import { playSfx } from './audio.js';

const GEM_SIZE = 16;        // coin diameter (world units) — matches the 16px pixel-art source
const PULSE = 0.05;         // very subtle vertical pulse amplitude (±) so coins feel alive
const PULSE_SPEED = 0.06;   // radians/frame for the pulse
const SPIN_SPEED = 0.08;    // radians/frame for the Mario coin spin (horizontal squash)

// Gold palette (kept from the original gem look).
const COIN_RIM = '#b8860b';     // dark-gold outer rim
const COIN_BODY = '#f1c40f';    // gold body
const COIN_SHINE = '#ffe066';   // light shine highlight

let gemGroup = null;        // q5play Group holding every gem sprite
let gems = [];              // module-level gem list (the sprites)
let collected = 0;          // how many grabbed this run
let phase = 0;              // shared animation clock (advanced each updateGems)
let coinImg = null;         // shared low-res coin image, generated ONCE on first build

// Build the chunky low-res coin image one time and cache it. Drawn at the native pixel
// size (GEM_SIZE) on a createGraphics buffer with smoothing off, then handed to sprites.
// q5play's .img setter accepts an image-like object (level.js assigns paths the same way);
// this returns whatever the sprite renderer is happiest with. If a raw createGraphics object
// ever fails to render, the documented fallbacks are gfx.canvas or createImage pixel-copy.
function buildCoinImage() {
  if (coinImg) return coinImg;
  const N = GEM_SIZE;                       // 16px source — intentionally low-res
  const g = createGraphics(N, N);           // offscreen q5 graphics buffer
  if (typeof g.noSmooth === 'function') g.noSmooth();   // keep edges chunky (no interpolation)
  if (typeof g.pixelDensity === 'function') g.pixelDensity(1);
  g.clear();
  g.noStroke();
  g.ellipseMode(CENTER);
  const c = N / 2;                          // center (8,8)

  // Concentric filled circles → rim, body, shine. Diameters chosen so each ring reads
  // as ~2px at this size (chunky, not smooth).
  g.fill(COIN_RIM);
  g.circle(c, c, N);                        // full dark-gold rim (16px)
  g.fill(COIN_BODY);
  g.circle(c, c, N - 4);                    // gold body inset ~2px all around (12px)
  g.fill(COIN_SHINE);
  g.circle(c - 2, c - 2, N - 10);           // small shine, offset up-left (~6px)

  // 1px inner vertical highlight down the middle for that minted-coin pop.
  g.fill(COIN_SHINE);
  g.rect(c - 0.5, c - N / 4, 1, N / 2);

  // Cache the most render-robust handle. A createGraphics object is image-like and q5play's
  // .img setter wraps it; if the engine wants a plain image, gfx.canvas is the backing
  // <canvas>. We hand over the graphics object itself (primary), which q5play accepts.
  coinImg = g;
  return coinImg;
}

// Build (or rebuild) the gem field. Replaces any prior gems first so calling twice
// for a new level never stacks. worldGems: [{x,y}] in WORLD coords (sprite CENTER).
export function buildGems(worldGems) {
  clearGems();
  if (!gemGroup) gemGroup = new Group();
  gems = [];
  collected = 0;
  phase = 0;

  const img = buildCoinImage();   // generate the low-res coin once, reuse for every sprite

  const list = worldGems || [];
  for (const g of list) {
    const s = new gemGroup.Sprite(g.x, g.y, GEM_SIZE, GEM_SIZE);
    s.collider = 'none';          // purely decorative body; we do AABB by hand
    s.physics = STATIC;           // never let the engine drift it
    s.color = COIN_BODY;          // fallback fill if the image somehow doesn't draw
    s.stroke = COIN_RIM;
    s.strokeWeight = 0;           // no outline — the coin art carries its own rim
    s.rotation = 0;              // upright disc (no diamond)
    s.img = img;                  // q5play wraps this image-like graphics object
    s._baseX = g.x;
    s._baseY = g.y;
    s._half = GEM_SIZE / 2;       // half-extent used for collection AABB
    s._off = Math.random() * Math.PI * 2;   // per-gem phase so they don't spin in unison
    s._collected = false;
    gems.push(s);
  }
  return gems;
}

// Re-show every gem (called on level reset).
export function resetGems() {
  collected = 0;
  for (const s of gems) {
    if (!s || s.deleted) continue;
    s._collected = false;
    s.visible = true;
    s.scale.x = 1;          // clear any mid-spin squash so reset coins don't pop in flattened
    s.scale.y = 1;
    s.rotation = 0;         // upright coin rest orientation (no diamond)
  }
}

// Delete every gem sprite and forget them.
export function clearGems() {
  for (const s of gems) {
    if (s && !s.deleted) s.delete();
  }
  gems = [];
  collected = 0;
}

// Per-frame: animate the gems and collect any the player overlaps.
export function updateGems(player) {
  phase += 1;

  // Animate regardless of player, so coins look alive even when paused-far.
  // Mario-style spin: squash the WIDTH so the coin reads as a disc seen edge-on, while the
  // height does only a very subtle pulse. rotation stays 0 (no 2D diamond spin).
  for (const s of gems) {
    if (!s || s.deleted || s._collected) continue;
    const p = phase * SPIN_SPEED + s._off;           // spin phase for the width squash
    const q = phase * PULSE_SPEED + s._off;          // slower phase for the gentle pulse
    s.scale.x = Math.max(0.15, Math.abs(Math.cos(p)));  // flat at edges, full when face-on
    s.scale.y = 1 + Math.sin(q) * PULSE;             // barely-there breathing
  }

  const ps = player && player.sprite;
  if (!ps) return;

  // Player AABB (center ± half), using the player's TRUE size (ignore visual pulse on gems).
  const pHalfW = ps.w / 2;
  const pHalfH = ps.h / 2;
  const pL = ps.x - pHalfW, pR = ps.x + pHalfW;
  const pT = ps.y - pHalfH, pB = ps.y + pHalfH;

  for (const s of gems) {
    if (!s || s.deleted || s._collected) continue;
    const gL = s._baseX - s._half, gR = s._baseX + s._half;
    const gT = s._baseY - s._half, gB = s._baseY + s._half;
    if (pR >= gL && pL <= gR && pB >= gT && pT <= gB) {
      s._collected = true;
      s.visible = false;
      collected += 1;
      playSfx('coin');
    }
  }
}

export function gemsCollected() { return collected; }
export function gemsTotal() { return gems.length; }

// 1..3 stars. Base 1; +1 for collecting every gem (auto-true when a level has none);
// +1 for finishing under par. So all-gems + under-par => 3.
export function computeStars(timeMs, parMs, gemsGot, gemsTot) {
  let stars = 1;
  if (gemsTot <= 0 || gemsGot >= gemsTot) stars += 1;
  if (typeof parMs === 'number' && parMs > 0 && timeMs <= parMs) stars += 1;
  return Math.max(1, Math.min(3, stars));
}
