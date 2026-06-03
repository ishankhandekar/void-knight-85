// Builds a playable q5 world from an authored custom map (CONTRACTS §D).
// Maps are grids of (col,row) integers; world = col*BLOCK, row*BLOCK (levelschema).
// The whole level is shifted by CUSTOM_OFFSET_X so it can coexist in the same q5
// world as the main level (x∈[-720,720]) and the tutorial (x≈2000) without overlap.
// Mirrors level.js's block/hazard/moving-platform factories and return shape, plus
// tutorial.js's typed enemySpawns/world-coord gems, and adds destroy() for rebuilds.
import { registerSfx } from './prefs.js';
import { BLOCK, gridToWorld } from './levelschema.js';

const CUSTOM_OFFSET_X = 4000;   // far right of both the main level and the tutorial

const TEX = {
  platform: 'Sprites/textures/platformtexture.png',
  wall: 'Sprites/textures/walltexture.png',
};

const slimeBlockJumpSfx = new Audio('music/slimeBlockJump.mp3');
registerSfx(slimeBlockJumpSfx, 0.5);

// Only affect the player (the player sprite locks rotation).
function isPlayerTarget(sprite) {
  return sprite && sprite.rotationLock === true;
}

export function buildCustomLevel(map) {
  // Callers (editor playtest / gallery play) validate first, but spawn/door are
  // dereferenced unconditionally below; fail loudly here rather than with a cryptic
  // "Cannot read properties of null" deep in the build if an unvalidated map slips in.
  if (!map || !map.spawn || !map.door) {
    throw new Error('buildCustomLevel: map requires both a spawn and a door cell');
  }

  const platformGroup = new Group();
  const honeyGroup = new Group();
  const jumpPadGroup = new Group();
  const spikeGroup = new Group();

  // --- coord helpers: grid cell -> CENTER of the cell in world space ---
  function cellCenter(col, row) {
    const w = gridToWorld(col, row);          // top-left of the cell
    return { x: w.x + CUSTOM_OFFSET_X + BLOCK / 2, y: w.y + BLOCK / 2 };
  }
  // World X of a column's left edge (for spanning multiple cells).
  // Routes through gridToWorld so the offset math has a single source of truth
  // (the door/spawn/mover/enemy calcs below reuse this instead of re-deriving col*BLOCK).
  function colX(col) { return gridToWorld(col, 0).x + CUSTOM_OFFSET_X; }
  // World X of a column's CENTER (the common case for centered sprites/spawns).
  function colCenterX(col) { return colX(col) + BLOCK / 2; }

  // --- factories (ported from level.js) ---
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

  function spike(x, y, w = 50, h = 16) {
    const s = new spikeGroup.Sprite(x, y, w, h);
    s.physics = STATIC;
    s.color = '#e85d4f';
    s.stroke = '#9f3029';
    s.strokeWeight = 2;
    s.addAni('Sprites/explosionani.png', 6, '32x32');
    s.anis.explosionani.frameDelay = 2;
    s.anis.explosionani.scale.x = w / 16;
    s.anis.explosionani.scale.y = h / 4;
    s.anis.explosionani.loop = false;
    s.anis.explosionani.pause();
    return s;
  }

  function honey(x, y, w = BLOCK, h = 12) {
    const sl = new honeyGroup.Sprite(x, y, w, h);
    sl.physics = STATIC;
    sl.color = '#f6b93b';
    sl.stroke = '#bd7600';
    sl.strokeWeight = 2;
    sl.img = 'Sprites/textures/honeytexture.png';
    sl.img.scale.x = w / 32;
    sl.img.scale.y = h / 10;
    return sl;
  }

  function jumpPad(x, y, w = 60, h = 12) {
    const jp = new jumpPadGroup.Sprite(x, y, w, h);
    jp.physics = STATIC;
    jp.color = '#39e58c';
    jp.stroke = '#17824e';
    jp.strokeWeight = 2;
    jp.addAni('Sprites/slimetextureani.png', 6, '32x32');
    jp.anis.slimetextureani.frameDelay = 2;
    jp.anis.slimetextureani.scale.x = w / 32;
    jp.anis.slimetextureani.scale.y = h / 32;
    jp.anis.slimetextureani.loop = false;
    jp.anis.slimetextureani.pause();
    return jp;
  }

  // --- static blocks ---
  for (const b of map.blocks || []) {
    const c = cellCenter(b.col, b.row);
    block(c.x, c.y, b.texture);
  }

  // --- hazards (cell-sized; centered in their cell, matching level.js sizing) ---
  const hz = map.hazards || {};
  for (const s of hz.spikes || []) {
    const c = cellCenter(s.col, s.row);
    // sit the spike on the cell floor, like level.js (y = cellBottom - h/2)
    spike(c.x, c.y + BLOCK / 2 - 6, 40, 12);
  }
  for (const h of hz.honey || []) {
    const c = cellCenter(h.col, h.row);
    honey(c.x, c.y + BLOCK / 2 - 6, BLOCK, 12);
  }
  for (const j of hz.jumpPads || []) {
    const c = cellCenter(j.col, j.row);
    jumpPad(c.x, c.y + BLOCK / 2 - 6, 60, 12);
  }

  // --- moving platforms: per-platform topY/bottomY (start ± range*BLOCK) + speed ---
  // Each entry: { sprites:[...], topY, bottomY, startY, speed, dir }.
  const movers = [];
  for (const mp of map.movingPlatforms || []) {
    // length/range are schema-validated integers; Math.trunc + clamp keeps the loop
    // bound finite and >=0 even if an unvalidated map ever reaches here (bitwise |0
    // would have silently mangled large or fractional values).
    const len = Math.max(1, Math.trunc(mp.length) || 1);
    const range = Math.max(0, Math.trunc(mp.range) || 0);
    const speed = Math.abs(mp.speed) || 2;
    const startY = gridToWorld(0, mp.row).y + BLOCK / 2; // center Y of the platform row
    const leftX = colCenterX(mp.col);                    // center of the first cell
    const sprites = [];
    for (let i = 0; i < len; i++) {
      const b = block(leftX + i * BLOCK, startY, mp.texture);
      b.physics = 'kinematic';
      b.vel.y = -speed;                                  // start travelling up (matches level.js)
      sprites.push(b);
    }
    movers.push({
      sprites,
      startY,
      topY: startY - range * BLOCK,
      bottomY: startY + range * BLOCK,
      speed,
      dir: -1,
    });
  }

  // --- door: rest its 140px body on the block below the door cell ---
  const dc = map.door;
  const doorX = colCenterX(dc.col);
  const doorY = (dc.row + 1) * BLOCK - 70;              // feet at (row+1)*BLOCK
  const doorSprite = new Sprite(doorX, doorY, 80, 140);
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

  // --- spawn: feet on the top of the block beneath the spawn cell (blockTop - 16) ---
  const sp = map.spawn;
  const spawnX = colCenterX(sp.col);
  const spawnY = (sp.row + 1) * BLOCK - 16;             // blockTop - half player (32px)

  // --- enemy spawns: WORLD coords, typed; sketch maps -> Slug/Mage/Bat ---
  // slug/mage use world-X patrol bounds; bat uses a world-unit radius.
  const enemySpawns = [];
  for (const e of map.enemies || []) {
    const c = cellCenter(e.col, e.row);
    if (e.type === 'bat') {
      enemySpawns.push({
        type: 'bat',
        x: c.x,
        y: c.y,
        patrolRadius: Math.max(0, Math.trunc(e.patrolRadius) || 0) * BLOCK,
      });
    } else {
      enemySpawns.push({
        type: e.type,                                    // 'slug' | 'mage'
        x: c.x,
        y: c.y,
        patrolLeft: colCenterX(e.patrolLeft),
        patrolRight: colCenterX(e.patrolRight),
      });
    }
  }

  // --- gems: WORLD coords; sketch hands to collectibles.buildGems ---
  const gems = (map.gems || []).map((g) => {
    const c = cellCenter(g.col, g.row);
    return { x: c.x, y: c.y };
  });

  // --- hazard housekeeping (ported from level.js) ---
  function updateHazardAnimations() {
    for (const s of spikeGroup) {
      if (s.anis.explosionani.frame >= s.anis.explosionani.lastFrame) {
        s.anis.explosionani.pause();
      }
    }
    for (const jp of jumpPadGroup) {
      if (jp.anis.slimetextureani.frame >= jp.anis.slimetextureani.lastFrame) {
        jp.anis.slimetextureani.frame = 0;
        jp.anis.slimetextureani.pause();
      }
    }
  }

  // --- per-frame moving-platform tick (generalized level.js:217-256) ---
  function updateMovingPlatforms() {
    for (const m of movers) {
      if (m.topY === m.bottomY) continue;                // range 0 -> stationary
      const currentY = m.sprites[0].y;
      if (currentY <= m.topY) {
        m.dir = 1;
        for (const platform of m.sprites) platform.y = m.topY;
      } else if (currentY >= m.bottomY) {
        m.dir = -1;
        for (const platform of m.sprites) platform.y = m.bottomY;
      }
      const v = m.dir * m.speed;
      for (const platform of m.sprites) platform.vel.y = v;
    }
    // Hazard animations are advanced once per frame by sketch.js's
    // activeLevel.updateSpikes() call. Don't tick them here too, or they
    // double-advance in the unfrozen case. (Kept in sync with level.js.)
  }

  function resetSpikes() {
    for (const s of spikeGroup) {
      s.anis.explosionani.frame = 0;
      s.anis.explosionani.pause();
    }
  }

  function resetMovingPlatforms() {
    for (const m of movers) {
      m.dir = -1;
      for (const platform of m.sprites) {
        platform.y = m.startY;
        platform.vel.y = -m.speed;
      }
    }
    resetSpikes();
  }

  function freezeMovingPlatforms() {
    for (const m of movers) {
      for (const platform of m.sprites) platform.vel.y = 0;
    }
  }

  // --- hazard overlap/collision registrations (ONCE, copied from level.js:280-312) ---
  honeyGroup.colliding(allSprites, (honeySprite, sprite) => {
    if (!isPlayerTarget(sprite)) return;
    sprite._onHoney = true;
    sprite.vel.x *= 0.65;
    if (sprite.vel.y < -3.5) sprite.vel.y = -3.5;
  });

  jumpPadGroup.overlaps(allSprites, (pad, sprite) => {
    if (!isPlayerTarget(sprite)) return;
    if (sprite.vel.y >= -2) {
      slimeBlockJumpSfx.currentTime = 0;
      slimeBlockJumpSfx.play();
      sprite.vel.y = -15;
      sprite._jumpPadBounce = true;
      pad.anis.slimetextureani.frame = 0;
      pad.anis.slimetextureani.loop = false;
      pad.anis.slimetextureani.play();
    }
  });

  spikeGroup.overlaps(allSprites, (spk, sprite) => {
    if (!sprite._player || sprite._player.flyMode || sprite._player.isDying) return;
    spk.anis.explosionani.frame = 0;
    spk.anis.explosionani.loop = false;
    spk.anis.explosionani.play();
    sprite._player.dieInstant();
  });

  // --- destroy(): delete every sprite + drop every Group so the world rebuilds clean ---
  // Guards each delete so a single bad/non-sprite entry can't throw mid-teardown and
  // leak the remaining groups into the shared physics world (worlds are rebuilt in place).
  function destroy() {
    if (doorSprite && !doorSprite.deleted && typeof doorSprite.delete === 'function') {
      doorSprite.delete();
    }
    for (const g of [platformGroup, honeyGroup, jumpPadGroup, spikeGroup]) {
      for (const s of [...g]) {                            // snapshot: delete() mutates the live group
        if (s && !s.deleted && typeof s.delete === 'function') s.delete();
      }
      if (typeof g.remove === 'function') g.remove();      // drop the Group from world.groups
    }
    movers.length = 0;
  }

  return {
    platforms: platformGroup,
    door: doorSprite,
    update: updateMovingPlatforms,
    updateSpikes: updateHazardAnimations,
    freeze: freezeMovingPlatforms,
    reset: resetMovingPlatforms,
    spawnX,
    spawnY,
    enemySpawns,
    gems,
    destroy,
  };
}
