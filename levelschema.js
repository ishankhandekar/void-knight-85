// Custom-map schema + helpers. PURE: no q5/q5play globals, no DOM, no localStorage.
// A map is authored on a grid of (col,row) integers; world units are col*BLOCK, row*BLOCK.
// (col,row) addresses the TOP-LEFT of a cell here; sprite centering is the builder's job
// (customlevel.js), not the schema's.

export const SCHEMA_VERSION = 1;
export const BLOCK = 40;            // world units per grid cell (must match level.js / contract)

// Allowed enumerations -----------------------------------------------------
const BLOCK_TEXTURES = ['platform', 'wall'];
const ENEMY_TYPES = ['slug', 'mage', 'bat'];
// slug/mage patrol horizontally via patrolLeft/patrolRight (in COLS); equal -> stationary
// (a mage becomes a turret). bat hovers within patrolRadius (in COLS); 0 -> stays put.

// A blank, valid-shaped (but not yet valid) map. spawn/door are null until placed.
export function emptyMap() {
  return {
    version: SCHEMA_VERSION,
    spawn: null,                                  // { col, row } player start
    door: null,                                   // { col, row } exit portal
    blocks: [],                                   // [ { col, row, texture } ]
    hazards: { spikes: [], honey: [], jumpPads: [] }, // each: [ { col, row } ]
    movingPlatforms: [],                          // [ { col, row, length, texture, range, speed } ]
    gems: [],                                     // [ { col, row } ]
    enemies: [],                                  // [ { type, col, row, patrolLeft, patrolRight, patrolRadius } ]
  };
}

// --- validation helpers ---------------------------------------------------
function isInt(v) { return typeof v === 'number' && Number.isInteger(v); }

// True only for a plain {col,row} with integer coords.
function isCell(c) { return !!c && typeof c === 'object' && isInt(c.col) && isInt(c.row); }

// Push a "<where>: <msg>" error.
function err(errors, where, msg) { errors.push(`${where}: ${msg}`); }

// Validate a list of plain {col,row} cells (spikes/honey/jumpPads/gems).
function checkCells(list, errors, label) {
  if (!Array.isArray(list)) { err(errors, label, 'must be an array'); return; }
  list.forEach((c, i) => {
    if (!isCell(c)) err(errors, `${label}[${i}]`, 'needs integer col,row');
  });
}

// Structural + semantic validation. Returns { ok, errors:string[] }.
// Requires exactly one spawn and one door, integer coordinates everywhere,
// and positive length/speed on moving platforms.
export function validate(map) {
  const errors = [];

  if (!map || typeof map !== 'object') {
    return { ok: false, errors: ['map: not an object'] };
  }
  if (map.version !== SCHEMA_VERSION) {
    err(errors, 'version', `expected ${SCHEMA_VERSION}`);
  }

  // exactly one spawn + one door
  if (!isCell(map.spawn)) err(errors, 'spawn', 'required, needs integer col,row');
  if (!isCell(map.door)) err(errors, 'door', 'required, needs integer col,row');

  // blocks
  if (!Array.isArray(map.blocks)) {
    err(errors, 'blocks', 'must be an array');
  } else {
    map.blocks.forEach((b, i) => {
      if (!isCell(b)) { err(errors, `blocks[${i}]`, 'needs integer col,row'); return; }
      if (!BLOCK_TEXTURES.includes(b.texture)) {
        err(errors, `blocks[${i}].texture`, `must be one of ${BLOCK_TEXTURES.join('|')}`);
      }
    });
  }

  // hazards
  const hz = map.hazards;
  if (!hz || typeof hz !== 'object') {
    err(errors, 'hazards', 'must be an object with spikes/honey/jumpPads');
  } else {
    checkCells(hz.spikes, errors, 'hazards.spikes');
    checkCells(hz.honey, errors, 'hazards.honey');
    checkCells(hz.jumpPads, errors, 'hazards.jumpPads');
  }

  // moving platforms
  if (!Array.isArray(map.movingPlatforms)) {
    err(errors, 'movingPlatforms', 'must be an array');
  } else {
    map.movingPlatforms.forEach((p, i) => {
      const w = `movingPlatforms[${i}]`;
      if (!isCell(p)) { err(errors, w, 'needs integer col,row'); return; }
      if (!BLOCK_TEXTURES.includes(p.texture)) {
        err(errors, `${w}.texture`, `must be one of ${BLOCK_TEXTURES.join('|')}`);
      }
      if (!isInt(p.length) || p.length <= 0) err(errors, `${w}.length`, 'must be a positive integer');
      if (!isInt(p.range) || p.range < 0) err(errors, `${w}.range`, 'must be a non-negative integer');
      if (typeof p.speed !== 'number' || !(p.speed > 0)) err(errors, `${w}.speed`, 'must be > 0');
    });
  }

  // gems
  checkCells(map.gems, errors, 'gems');

  // enemies
  if (!Array.isArray(map.enemies)) {
    err(errors, 'enemies', 'must be an array');
  } else {
    map.enemies.forEach((e, i) => {
      const w = `enemies[${i}]`;
      if (!isCell(e)) { err(errors, w, 'needs integer col,row'); return; }
      if (!ENEMY_TYPES.includes(e.type)) {
        err(errors, `${w}.type`, `must be one of ${ENEMY_TYPES.join('|')}`);
        return;
      }
      if (e.type === 'bat') {
        if (!isInt(e.patrolRadius) || e.patrolRadius < 0) {
          err(errors, `${w}.patrolRadius`, 'must be a non-negative integer (cols)');
        }
      } else { // slug | mage -> horizontal patrol bounds in cols
        if (!isInt(e.patrolLeft)) err(errors, `${w}.patrolLeft`, 'must be an integer (col)');
        if (!isInt(e.patrolRight)) err(errors, `${w}.patrolRight`, 'must be an integer (col)');
        if (isInt(e.patrolLeft) && isInt(e.patrolRight) && e.patrolRight < e.patrolLeft) {
          err(errors, w, 'patrolRight must be >= patrolLeft');
        }
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

// Compact JSON. (No pretty-printing: maps are stored/transmitted; size matters.)
export function serialize(map) {
  return JSON.stringify(map);
}

// Parse a serialized map. Throws Error on malformed JSON OR a schema that fails validate().
export function deserialize(str) {
  let map;
  try {
    map = JSON.parse(str);
  } catch (e) {
    throw new Error(`malformed map: bad JSON (${e.message})`);
  }
  const { ok, errors } = validate(map);
  if (!ok) throw new Error(`malformed map: ${errors.join('; ')}`);
  return map;
}

// Grid cell -> world coordinates of its TOP-LEFT corner.
// Sprites center their (x,y), so builders offset by BLOCK/2 themselves.
export function gridToWorld(col, row) {
  return { x: col * BLOCK, y: row * BLOCK };
}
