// Grid map editor (CONTRACTS §I). Runs IN the game loop while mode==='editor':
// sketch calls updateEditor()/drawEditor() each frame and getMap()/open/close around it.
// Authors a levelschema map on a 40px grid: click to place the selected tool, right-click
// (or the eraser tool) to remove, WASD / drag to pan. Saves to localStorage; play-tests by
// handing the in-memory schema back to sketch via an injected callback.
import { emptyMap, validate, serialize, deserialize, BLOCK } from './levelschema.js';
// customlevel.js is consumed by sketch (onPlaytest -> buildCustomLevel); the editor only
// produces the schema, so we deliberately do NOT import/build sprites here.

const STORAGE_KEY = 'voidKnightMaps';   // { [name]: serializedMapString }
const ACCENT = '#f1c40f';
// Saved-map name cap. Names are localStorage keys AND shown (newline-joined) in the Load
// prompt; keep them short + single-line so the picker stays readable and the store stays sane.
const MAX_NAME_LEN = 40;
// How many saved-map names to list in the Load prompt before truncating (avoids an
// unwieldy/overflowing window.prompt when the store has accumulated many maps).
const LOAD_LIST_MAX = 30;

// Tool ids in palette order. block/wall/...(grid cells) + door/spawn (singletons) + eraser.
const TOOLS = [
  'block', 'wall', 'spike', 'honey', 'jumppad',
  'movingPlatform', 'gem', 'slug', 'mage', 'bat',
  'door', 'spawn', 'eraser',
];

const TOOL_LABELS = {
  block: 'Block', wall: 'Wall', spike: 'Spike', honey: 'Honey', jumppad: 'Jump Pad',
  movingPlatform: 'Mover', gem: 'Gem', slug: 'Slug', mage: 'Mage', bat: 'Bat',
  door: 'Door', spawn: 'Spawn', eraser: 'Eraser',
};

// Marker colors (mirror level.js where one exists; pick distinct hues for enemies/gems).
const COL = {
  block:  { fill: '#1b3148', stroke: '#7fb7dc' },
  wall:   { fill: '#142235', stroke: '#5f93b8' },
  spike:  { fill: '#e85d4f', stroke: '#9f3029' },
  honey:  { fill: '#f6b93b', stroke: '#bd7600' },
  jumppad:{ fill: '#39e58c', stroke: '#17824e' },
  mover:  { fill: '#2e7d8f', stroke: '#9be3ef' },
  gem:    { fill: '#ffd54a', stroke: '#b8860b' },
  slug:   { fill: '#7fd96b', stroke: '#3b7a2c' },
  mage:   { fill: '#b07de8', stroke: '#5e2c9f' },
  bat:    { fill: '#9aa3ad', stroke: '#444c55' },
  door:   { fill: '#f4d35e', stroke: '#b8860b' },
  spawn:  { fill: '#4ad0ff', stroke: '#0b6e9f' },
};

// --- faithful textures (lazy image cache) --------------------------------
// Render the REAL game sprites/textures for placed elements + the ghost instead
// of flat colored rects. Sheets are loaded once (lazily, after the canvas exists),
// and every draw path falls back to the colored marker until the image is ready
// (or forever, if q5's 9-arg image()/tint() turn out to be unsupported here).
const IMG_SRC = {
  platform: 'Sprites/textures/platformtexture.png',
  wall:     'Sprites/textures/walltexture.png',
  honey:    'Sprites/textures/honeytexture.png',
  spike:    'Sprites/explosionani.png',
  jumppad:  'Sprites/slimetextureani.png',
  door:     'Sprites/portaltexture.png',
  slug:     'Sprites/Slugani.png',
  bat:      'Sprites/batani.png',
  mage:     'Sprites/magechargeattackani.png',
};
// Frames per sheet (single-image textures = 1; sprite sheets are laid out
// horizontally, so frame 0 is the leftmost img.width/frames strip).
const IMG_FRAMES = {
  platform: 1, wall: 1, honey: 1,
  spike: 6, jumppad: 6, door: 9,
  slug: 4, bat: 3, mage: 5,
};
// Sheets whose frame 0 is NOT the leftmost horizontal strip. explosionani.png
// (the spike) is a 64x64 2x2 grid; its resting frame is the top-left 32x32
// quadrant (the rest is the explosion). Values are [sx, sy, sw, sh] source px.
const FRAME0_RECT = { spike: [0, 0, 32, 32] };
const imgCache = {};
let imgLoadStarted = false;

function startImageLoads() {
  if (imgLoadStarted || typeof loadImage !== 'function') return;
  imgLoadStarted = true;
  for (const n in IMG_SRC) {
    imgCache[n] = null;
    try { loadImage(IMG_SRC[n], (img) => { imgCache[n] = img; }); }
    catch (e) { imgCache[n] = null; }
  }
}
// Returns the image only once it has decoded (width > 0), else null.
function readyImg(n) {
  const im = imgCache[n];
  return (im && im.width) ? im : null;
}

// --- module state ---------------------------------------------------------
let open = false;
let inited = false;
let map = emptyMap();
let tool = 'block';
let mapName = 'untitled';

let onPlaytest = () => {};
let onClose = () => {};

// movingPlatform + enemy authoring params (applied on placement).
const cfg = {
  length: 3, range: 3, speed: 2, texture: 'platform',  // movingPlatform
  patrolLeft: 0, patrolRight: 0, patrolRadius: 0,       // enemies (cols, relative-resolved at place time)
};

// Play-test option: start moving platforms frozen (toggled from the toolbar,
// also live-toggleable in-game via the M hotkey wired by sketch.js). Passed to
// onPlaytest as opts.freezePlatforms.
let freezePlatforms = false;

// camera pan / drag state (screen-space pixels via global mouseX/mouseY)
let dragging = false;
let dragPX = 0, dragPY = 0;
let camStartX = 0, camStartY = 0;

// hovered grid cell (set each updateEditor for the ghost)
let hovCol = 0, hovRow = 0, hovValid = false;
// Last SCREEN mouse (q5 globals mouseX/mouseY) + a resnap flag, so arrow/WASD
// panning (which moves camera.x/y, not the cursor) doesn't drift the ghost under
// a stationary pointer. We only re-snap the hovered cell when the real mouse
// moved OR something asked for an explicit resnap (tool pick / editor open).
let lastMSX = null, lastMSY = null, resnapGhost = true;

// --- DOM (lazily built inside #map-editor-screen) -------------------------
let dom = null;   // { screen, palette, config, status, buttons:{...}, toolBtns:Map, cfgFields:{...} }

function elt(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Get an existing element by id, or create one (appended to `parent`) so the module
// works whether or not the Wave-3 markup already supplies the inner ids.
function need(id, tag, parent, cls) {
  let e = document.getElementById(id);
  if (!e) {
    e = elt(tag, cls);
    e.id = id;
    if (parent) parent.appendChild(e);
  } else if (cls && !e.className) {
    e.className = cls;
  }
  return e;
}

// Inject editor-scoped CSS once. The editor screen, unlike the other full-screen
// overlays, must NOT block the canvas (placement happens by clicking the grid behind
// it). So the container is a transparent, click-through HUD with edge-docked panels;
// only the controls capture pointer events. Retro tokens mirror index.html (.menu-btn).
function injectStyle() {
  if (document.getElementById('editor-style')) return;
  // Every docked panel gets an OPAQUE dark backing so the canvas grid drawn behind the
  // HUD never bleeds through the (otherwise translucent) .menu-btn / .editor-tool buttons.
  // Panels are edge-docked with explicit max-heights/scroll so they never overlap each
  // other, the title, or the bottom-left gear (#settings-btn, z-index 300).
  const css = `
#map-editor-screen{background:transparent!important;pointer-events:none!important;
  inset:0;padding:0;display:none;flex-direction:column;font-family:'Press Start 2P',monospace;z-index:235;}
#map-editor-screen>h1{position:absolute;top:8px;left:50%;transform:translateX(-50%);margin:0;
  color:#f1c40f;font-size:13px;text-shadow:0 0 8px rgba(241,196,15,.6);pointer-events:none;
  white-space:nowrap;z-index:2;}
/* Top palette: opaque bar, wraps without overflowing; capped height scrolls on tiny windows. */
#editor-palette{position:absolute;top:30px;left:50%;transform:translateX(-50%);
  display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;gap:4px;
  max-width:min(92vw,720px);max-height:42vh;overflow-y:auto;
  background:#0c1118;border:2px solid rgba(241,196,15,.55);border-radius:6px;
  padding:6px;box-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:auto;z-index:2;}
.editor-tool{font-family:'Press Start 2P',monospace;font-size:8px;color:#f1c40f;
  background:#1d2433;border:2px solid rgba(241,196,15,.45);border-radius:4px;
  padding:6px 7px;cursor:pointer;pointer-events:auto;white-space:nowrap;
  transition:background .1s ease,color .1s ease,box-shadow .1s ease;}
.editor-tool:hover{background:rgba(241,196,15,.85);color:#1a1a1a;border-color:#f1c40f;}
.editor-tool.active{background:#f1c40f;color:#1a1a1a;border-color:#fff3c4;
  box-shadow:0 0 0 1px #1a1a1a,0 0 12px rgba(241,196,15,.95);}
#editor-config{position:absolute;top:108px;left:10px;width:180px;max-height:calc(100vh - 168px);
  overflow-y:auto;background:#0c1118;border:2px solid rgba(241,196,15,.5);border-radius:6px;
  padding:8px;color:#ecf0f1;box-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:auto;}
.editor-cfg-section{margin-bottom:8px;}
.editor-cfg-title{color:#f1c40f;font-size:8px;margin-bottom:6px;}
.editor-cfg-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:4px 0;}
.editor-cfg-label{font-size:7px;color:#bcd;}
.editor-cfg-input{width:54px;font-family:'Press Start 2P',monospace;font-size:8px;
  background:#111;color:#f1c40f;border:1px solid rgba(241,196,15,.5);border-radius:3px;padding:2px;}
.editor-cfg-hint{font-size:6px;color:#9bb;line-height:1.5;margin-top:4px;}
.editor-cfg-toggle{display:flex;gap:3px;}
.editor-tex-btn{font-size:7px;color:#f1c40f;background:#1d2433;
  border:1px solid rgba(241,196,15,.5);border-radius:3px;padding:3px 5px;cursor:pointer;}
.editor-tex-btn.active{background:#f1c40f;color:#1a1a1a;border-color:#fff3c4;}
/* Status bar: opaque, centered; capped width + ellipsis truncation (instead of a hard
   clip) keep it readable and clear of the side button column on wide layouts. */
#editor-status{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
  max-width:min(80vw,640px);background:#0c1118;border:2px solid rgba(241,196,15,.5);border-radius:4px;
  padding:5px 9px;color:#f1c40f;font-size:8px;line-height:1.4;pointer-events:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 10px rgba(0,0,0,.55);}
/* Side button column: opaque panel so the buttons no longer show the grid through them.
   Capped + scrollable so it can't run under the bottom-left gear on short windows. */
#editor-buttons{position:absolute;top:108px;right:10px;display:flex;flex-direction:column;
  gap:6px;max-height:calc(100vh - 134px);overflow-y:auto;
  background:#0c1118;border:2px solid rgba(241,196,15,.5);border-radius:6px;
  padding:8px;box-shadow:0 2px 10px rgba(0,0,0,.55);pointer-events:auto;}
#editor-buttons .menu-btn{width:100%;font-size:8px;padding:8px 10px;}
/* Opaque backing for the editor's menu-btns specifically (base .menu-btn is translucent). */
#map-editor-screen .menu-btn{background:#1d2433;pointer-events:auto;}
#map-editor-screen .menu-btn:hover{background:rgba(241,196,15,.85);}`;
  const s = document.createElement('style');
  s.id = 'editor-style';
  s.textContent = css;
  document.head.appendChild(s);
}

function buildDom() {
  const screen = document.getElementById('map-editor-screen');
  if (!screen) return null;   // Wave 3 not loaded yet; retry on next open.
  injectStyle();

  // Title (only if the shell is empty).
  if (!screen.querySelector('h1') && !document.getElementById('editor-palette')) {
    screen.appendChild(elt('h1', null, 'MAP EDITOR'));
  }

  const palette = need('editor-palette', 'div', screen);
  const config = need('editor-config', 'div', screen);
  const status = need('editor-status', 'div', screen);

  // Tool buttons.
  const toolBtns = new Map();
  if (!palette.dataset.built) {
    palette.dataset.built = '1';
    for (const t of TOOLS) {
      const b = elt('button', 'editor-tool', TOOL_LABELS[t]);
      b.dataset.tool = t;
      b.addEventListener('click', () => selectTool(t));
      palette.appendChild(b);
      toolBtns.set(t, b);
    }
  } else {
    for (const b of palette.querySelectorAll('.editor-tool')) toolBtns.set(b.dataset.tool, b);
  }

  // Config panel (movingPlatform + enemy params). Built once.
  const cfgFields = {};
  if (!config.dataset.built) {
    config.dataset.built = '1';

    const moverSec = elt('div', 'editor-cfg-section');
    moverSec.appendChild(elt('div', 'editor-cfg-title', 'MOVING PLATFORM'));
    cfgFields.length  = numRow(moverSec, 'Length',     'length', 1, 12, 1);
    cfgFields.range   = numRow(moverSec, 'Range (blk)', 'range', 0, 20, 1);
    cfgFields.speed   = numRow(moverSec, 'Speed',      'speed', 0.5, 8, 0.5);
    cfgFields.texture = texRow(moverSec, 'Texture');
    config.appendChild(moverSec);

    const enSec = elt('div', 'editor-cfg-section');
    enSec.appendChild(elt('div', 'editor-cfg-title', 'ENEMY'));
    cfgFields.patrolLeft   = numRow(enSec, 'Patrol L (col)', 'patrolLeft', -40, 40, 1);
    cfgFields.patrolRight  = numRow(enSec, 'Patrol R (col)', 'patrolRight', -40, 40, 1);
    cfgFields.patrolRadius = numRow(enSec, 'Bat radius (col)', 'patrolRadius', 0, 40, 1);
    const hint = elt('div', 'editor-cfg-hint',
      'Slug/Mage use Patrol L/R (set equal = turret). Bat uses radius (0 = hover).');
    enSec.appendChild(hint);
    config.appendChild(enSec);
  } else {
    for (const inp of config.querySelectorAll('input[data-cfg]')) cfgFields[inp.dataset.cfg] = inp;
    const tex = config.querySelector('[data-cfg="texture"]');
    if (tex) cfgFields.texture = tex;
  }

  // Buttons (reuse provided ids; create+append into a row if absent).
  let btnRow = document.getElementById('editor-buttons');
  if (!btnRow && !document.getElementById('editor-save')) {
    btnRow = elt('div', 'editor-buttons');
    btnRow.id = 'editor-buttons';
    screen.appendChild(btnRow);
  }
  const buttons = {
    save:    needBtn('editor-save', 'Save', btnRow),
    load:    needBtn('editor-load', 'Load', btnRow),
    new:     needBtn('editor-new', 'New', btnRow),
    play:    needBtn('editor-play', 'Play-test', btnRow),
    export:  needBtn('editor-export', 'Export', btnRow),
    plats:   needBtn('editor-plats', platsLabel(), btnRow),
    back:    needBtn('editor-back', '← Back', btnRow),
  };
  buttons.save.onclick = doSave;
  buttons.load.onclick = doLoad;
  buttons.new.onclick = doNew;
  buttons.play.onclick = doPlaytest;
  buttons.export.onclick = doExport;
  buttons.plats.textContent = platsLabel();   // sync if button pre-existed
  buttons.plats.onclick = () => {
    freezePlatforms = !freezePlatforms;
    buttons.plats.textContent = platsLabel();
  };
  buttons.back.onclick = () => onClose();

  return { screen, palette, config, status, buttons, toolBtns, cfgFields };
}

function platsLabel() { return freezePlatforms ? 'Platforms: Frozen' : 'Platforms: Moving'; }

function needBtn(id, label, row) {
  let b = document.getElementById(id);
  if (!b) {
    b = elt('button', 'menu-btn', label);
    b.id = id;
    if (row) row.appendChild(b);
  } else if (!b.className) {
    b.className = 'menu-btn';
  }
  return b;
}

// A labelled number input bound to cfg[key]. Returns the input element.
function numRow(parent, label, key, min, max, step) {
  const row = elt('div', 'editor-cfg-row');
  row.appendChild(elt('span', 'editor-cfg-label', label));
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'editor-cfg-input';
  inp.dataset.cfg = key;
  inp.min = min; inp.max = max; inp.step = step;
  inp.value = cfg[key];
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    if (!Number.isNaN(v)) cfg[key] = v;
  });
  row.appendChild(inp);
  parent.appendChild(row);
  return inp;
}

// Platform-texture toggle (platform | wall) bound to cfg.texture.
function texRow(parent, label) {
  const row = elt('div', 'editor-cfg-row');
  row.appendChild(elt('span', 'editor-cfg-label', label));
  const wrap = elt('span', 'editor-cfg-toggle');
  wrap.dataset.cfg = 'texture';
  for (const t of ['platform', 'wall']) {
    const b = elt('span', 'editor-tex-btn', t.toUpperCase());
    b.dataset.tex = t;
    b.classList.toggle('active', cfg.texture === t);
    b.addEventListener('click', () => {
      cfg.texture = t;
      for (const o of wrap.children) o.classList.toggle('active', o.dataset.tex === t);
    });
    wrap.appendChild(b);
  }
  row.appendChild(wrap);
  parent.appendChild(row);
  return wrap;
}

function ensureDom() {
  if (!dom) dom = buildDom();
  return dom;
}

// --- tool selection / status ---------------------------------------------
function selectTool(t) {
  tool = t;
  if (dom) for (const [id, b] of dom.toolBtns) b.classList.toggle('active', id === t);
  resnapGhost = true;   // re-snap the ghost under the cursor for the new tool
  refreshConfigVisibility();
  setStatus();
}

// Show the relevant config rows for the active tool.
function refreshConfigVisibility() {
  if (!dom) return;
  const isMover = tool === 'movingPlatform';
  const isEnemy = tool === 'slug' || tool === 'mage' || tool === 'bat';
  const isBat = tool === 'bat';
  const f = dom.cfgFields;
  // sections
  const moverSec = f.length && f.length.closest('.editor-cfg-section');
  const enSec = f.patrolLeft && f.patrolLeft.closest('.editor-cfg-section');
  if (moverSec) moverSec.style.display = isMover ? '' : 'none';
  if (enSec) enSec.style.display = isEnemy ? '' : 'none';
  // within enemy: patrol vs radius
  if (isEnemy) {
    rowOf(f.patrolLeft).style.display = isBat ? 'none' : '';
    rowOf(f.patrolRight).style.display = isBat ? 'none' : '';
    rowOf(f.patrolRadius).style.display = isBat ? '' : 'none';
  }
}
function rowOf(inp) { return inp ? inp.closest('.editor-cfg-row') : { style: {} }; }

function setStatus(extra) {
  if (!dom || !dom.status) return;
  const v = validate(map);
  const counts =
    `blk ${map.blocks.length}  haz ${map.hazards.spikes.length + map.hazards.honey.length + map.hazards.jumpPads.length}` +
    `  mov ${map.movingPlatforms.length}  gem ${map.gems.length}  enm ${map.enemies.length}`;
  const spawnOk = !!map.spawn, doorOk = !!map.door;
  const ready = v.ok ? 'READY' : `${spawnOk ? '' : 'need spawn '}${doorOk ? '' : 'need door'}`.trim() || v.errors[0];
  dom.status.textContent = `[${mapName}]  tool: ${TOOL_LABELS[tool]}   ${counts}   ${extra || ready}`;
}

// --- grid <-> cell helpers ------------------------------------------------
// mouse.x/mouse.y are already world coords; snap to BLOCK and convert to col/row.
// (col,row) addresses the cell's TOP-LEFT corner, matching the schema.
function snapCell() {
  const wx = Math.round(mouse.x / BLOCK) * BLOCK;
  const wy = Math.round(mouse.y / BLOCK) * BLOCK;
  return { col: wx / BLOCK, row: wy / BLOCK };
}

function sameCell(a, c, r) { return a && a.col === c && a.row === r; }
function removeAt(list, c, r) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].col === c && list[i].row === r) list.splice(i, 1);
}
function findAt(list, c, r) { return list.find((o) => o.col === c && o.row === r); }

// --- placement / erase ----------------------------------------------------
function place(c, r) {
  switch (tool) {
    case 'spawn': map.spawn = { col: c, row: r }; break;
    case 'door':  map.door = { col: c, row: r }; break;
    case 'block': eraseCell(c, r, false); map.blocks.push({ col: c, row: r, texture: 'platform' }); break;
    case 'wall':  eraseCell(c, r, false); map.blocks.push({ col: c, row: r, texture: 'wall' }); break;
    case 'spike': eraseCell(c, r, false); map.hazards.spikes.push({ col: c, row: r }); break;
    case 'honey': eraseCell(c, r, false); map.hazards.honey.push({ col: c, row: r }); break;
    case 'jumppad': eraseCell(c, r, false); map.hazards.jumpPads.push({ col: c, row: r }); break;
    case 'gem':   if (!findAt(map.gems, c, r)) map.gems.push({ col: c, row: r }); break;
    case 'movingPlatform':
      removeAt(map.movingPlatforms, c, r);
      map.movingPlatforms.push({
        col: c, row: r,
        length: clampInt(cfg.length, 1, 24),
        texture: cfg.texture === 'wall' ? 'wall' : 'platform',
        range: clampInt(cfg.range, 0, 40),
        speed: Math.max(0.5, cfg.speed) || 2,
      });
      break;
    case 'slug': case 'mage': case 'bat':
      removeAt(map.enemies, c, r);
      map.enemies.push(makeEnemy(tool, c, r));
      break;
    case 'eraser': eraseCell(c, r, true); break;
  }
}

function makeEnemy(type, c, r) {
  if (type === 'bat') {
    return { type, col: c, row: r, patrolLeft: c, patrolRight: c, patrolRadius: clampInt(cfg.patrolRadius, 0, 40) };
  }
  // slug/mage: patrol bounds are absolute COLS. Author values are offsets from the placed col
  // so "L -2 / R 2" reads naturally; equal -> stationary (mage turret).
  const l = c + Math.round(cfg.patrolLeft);
  const r2 = c + Math.round(cfg.patrolRight);
  return {
    type, col: c, row: r,
    patrolLeft: Math.min(l, r2),
    patrolRight: Math.max(l, r2),
    patrolRadius: 0,
  };
}

function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

// Remove whatever occupies a cell. If `singles`, also clear spawn/door on that cell.
function eraseCell(c, r, singles) {
  removeAt(map.blocks, c, r);
  removeAt(map.hazards.spikes, c, r);
  removeAt(map.hazards.honey, c, r);
  removeAt(map.hazards.jumpPads, c, r);
  removeAt(map.movingPlatforms, c, r);
  removeAt(map.gems, c, r);
  removeAt(map.enemies, c, r);
  if (singles) {
    if (sameCell(map.spawn, c, r)) map.spawn = null;
    if (sameCell(map.door, c, r)) map.door = null;
  }
}

// --- per-frame update -----------------------------------------------------
export function updateEditor() {
  if (!open) return;
  ensureDom();

  // Don't steal input while typing into a config field / prompt.
  const typing = document.activeElement &&
    (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

  // Camera pan: WASD (keyboard) — never follows the player.
  if (!typing && typeof keyboard !== 'undefined') {
    const PAN = 9;
    if (keyboard.pressing('a') || keyboard.pressing('left')) camera.x -= PAN;
    if (keyboard.pressing('d') || keyboard.pressing('right')) camera.x += PAN;
    if (keyboard.pressing('w') || keyboard.pressing('up')) camera.y -= PAN;
    if (keyboard.pressing('s') || keyboard.pressing('down')) camera.y += PAN;
  }

  // Hovered cell for the ghost. Recompute ONLY when the real (screen) mouse moved
  // or a resnap was requested — otherwise WASD/arrow panning would slide the ghost
  // under a stationary cursor (snapCell() reads world mouse.x/mouse.y, which shift
  // with the camera even when the pointer hasn't physically moved).
  const msx = mouseSX(), msy = mouseSY();
  const mouseMoved = (msx !== lastMSX || msy !== lastMSY);
  if (mouseMoved || resnapGhost) {
    const cell = snapCell();
    hovCol = cell.col; hovRow = cell.row;
    resnapGhost = false;
  }
  lastMSX = msx; lastMSY = msy;
  const overCanvas = mouseInCanvas();
  hovValid = overCanvas && !typing;

  // Middle-button OR space+left -> drag-pan. Plain right-drag is reserved for erase.
  const panBtn = mousePressing('center') || (mousePressing('left') && (keyboard && keyboard.pressing('space')));
  if (!dragging && panBtn && overCanvas) {
    dragging = true;
    dragPX = mouseSX(); dragPY = mouseSY();
    camStartX = camera.x; camStartY = camera.y;
  } else if (dragging && panBtn) {
    camera.x = camStartX - (mouseSX() - dragPX);
    camera.y = camStartY - (mouseSY() - dragPY);
  } else {
    dragging = false;
  }

  if (typing || !overCanvas || dragging) { setStatus(); return; }

  // Left-click: place (continuous paint for grid tools; singletons just set).
  if (mousePressing('left') && !(keyboard && keyboard.pressing('space'))) {
    place(hovCol, hovRow);
  }
  // Right-click or eraser tool: remove.
  else if (mousePressing('right')) {
    eraseCell(hovCol, hovRow, true);
  }

  setStatus();
}

// --- per-frame draw -------------------------------------------------------
// IMPORTANT: q5play only applies the camera transform around allSprites.draw()
// (in its post-draw step, AFTER sketch's draw() returns). Inside sketch's draw()
// the origin is top-left with no camera transform, so we reproduce the camera's
// translate ourselves to draw markers/grid in WORLD space (aligned with sprites).
export function drawEditor() {
  if (!open) return;
  startImageLoads();

  push();
  applyCameraTransform();
  rectMode(CENTER);
  textAlign(CENTER, CENTER);

  drawGrid();
  drawMarkers();
  drawGhost();

  pop();
}

// Mirror q5play _Camera.on() for the c2d renderer: translate(-cam + halfDim).
function applyCameraTransform() {
  const z = (typeof camera.zoom === 'number' && camera.zoom) ? camera.zoom : 1;
  if (z !== 1) scale(z);
  // Prefer the engine's computed translate; fall back to deriving it.
  const pos = camera.__pos;
  if (pos && typeof pos.x === 'number') {
    translate(pos.x, pos.y);
  } else {
    translate(-camera.x + (typeof width === 'number' ? width / 2 : 0),
              -camera.y + (typeof height === 'number' ? height / 2 : 0));
  }
}

function drawGrid() {
  const left = camera.x - width / 2, right = camera.x + width / 2;
  const top = camera.y - height / 2, bottom = camera.y + height / 2;
  const c0 = Math.floor(left / BLOCK), c1 = Math.ceil(right / BLOCK);
  const r0 = Math.floor(top / BLOCK), r1 = Math.ceil(bottom / BLOCK);

  noFill();
  stroke(127, 183, 220, 28);   // faint cyan
  strokeWeight(1);
  for (let c = c0; c <= c1; c++) line(c * BLOCK, top, c * BLOCK, bottom);
  for (let r = r0; r <= r1; r++) line(left, r * BLOCK, right, r * BLOCK);

  // Emphasize the origin axes a touch.
  stroke(241, 196, 15, 40);
  strokeWeight(1.5);
  line(0, top, 0, bottom);
  line(left, 0, right, 0);
}

// Draw a filled cell at (col,row) using its TOP-LEFT->center offset (BLOCK/2).
function cellRect(c, r, w, h) {
  const x = c * BLOCK + BLOCK / 2;
  const y = r * BLOCK + BLOCK / 2;
  rect(x, y, w == null ? BLOCK : w, h == null ? BLOCK : h);
}

function paint(col, alpha = 255) {
  fill(...hex(col.fill, alpha));
  stroke(...hex(col.stroke, alpha));
  strokeWeight(2);
}

// Map a tool/marker type to its image-cache sheet name. Returns null for types
// that have no sprite of their own (they draw glyphs/colored spans instead).
function sheetName(type) {
  if (type === 'block') return 'platform';
  if (type === 'wall') return 'wall';
  if (IMG_SRC[type]) return type;   // honey/spike/jumppad/door/slug/mage/bat
  return null;                      // gem/spawn/movingPlatform/eraser
}

// Draw the REAL texture/sprite (frame 0) for `type` at its on-map geometry, in
// world space (drawEditor already applied the camera). BLOCK=40, mirroring the
// game's sizing in level.js / customlevel.js. Returns true if it drew the
// sprite, false if the caller should fall back to the colored marker (no sheet
// for this type, image not yet loaded, or 9-arg image() unsupported here).
function drawElementSprite(type, col, row, alpha = 255) {
  const name = sheetName(type);
  if (!name) return false;
  const img = readyImg(name);
  if (!img) return false;

  // On-map geometry (center x,y + w,h), matching the in-game sprites.
  const cx = col * BLOCK + BLOCK / 2;
  const cy = row * BLOCK + BLOCK / 2;
  const floorY = row * BLOCK + BLOCK - 6;   // honey/spike floor center (h12)
  let dx = cx, dy = cy, w = BLOCK, h = BLOCK;
  switch (type) {
    case 'block': case 'wall':            w = BLOCK; h = BLOCK; break;
    case 'honey':                         w = BLOCK; h = 12; dy = floorY; break;
    case 'spike':                         w = 32;    h = 26; dy = (row + 1) * BLOCK - h / 2; break;
    case 'jumppad':                       w = 60;    h = 12; dy = floorY; break;
    case 'door':                          w = 80;    h = 140; dy = (row + 1) * BLOCK - 70; break;
    case 'slug':                          w = 30;    h = 30; break;
    case 'mage':                          w = 30;    h = 30; break;
    case 'bat':                           w = 40;    h = 14; break;
    default:                              w = BLOCK; h = BLOCK; break;
  }

  // Frame-0 source rect. Most sheets are horizontal strips (frame 0 = left
  // strip); grid sheets (see FRAME0_RECT) override with an explicit quadrant.
  const frames = IMG_FRAMES[name] || 1;
  const grid0 = FRAME0_RECT[type];
  const sx = grid0 ? grid0[0] : 0;
  const sy = grid0 ? grid0[1] : 0;
  const sw = grid0 ? grid0[2] : img.width / frames;
  const sh = grid0 ? grid0[3] : img.height;

  const fadeable = alpha < 255 && typeof tint === 'function';
  push();
  if (typeof imageMode === 'function') imageMode(CENTER);
  if (fadeable) tint(255, alpha);
  try {
    if (frames > 1 || grid0) {
      // 9-arg sub-image (frame 0). Unproven in this q5 build -> guarded.
      image(img, dx, dy, w, h, sx, sy, sw, sh);
    } else {
      image(img, dx, dy, w, h);
    }
  } catch (e) {
    if (typeof noTint === 'function') noTint();
    pop();
    return false;   // 9-arg/image unsupported -> caller falls back this frame
  }
  if (fadeable && typeof noTint === 'function') noTint();
  pop();
  return true;
}

// A small low-res gold coin (concentric ellipses), consistent with the in-game
// Mario coin. Used for gem markers + the gem ghost. Drawn at cell center.
function coinGlyph(col, row, alpha = 255) {
  const x = col * BLOCK + BLOCK / 2;
  const y = row * BLOCK + BLOCK / 2;
  push();
  noStroke();
  fill(...hex('#b8860b', alpha)); ellipse ? ellipse(x, y, 18, 18) : rect(x, y, 18, 18);          // rim
  fill(...hex('#f1c40f', alpha)); ellipse ? ellipse(x, y, 14, 14) : rect(x, y, 14, 14);          // body
  fill(...hex('#ffe066', alpha)); ellipse ? ellipse(x - 2, y - 2, 9, 9) : rect(x - 2, y - 2, 9, 9); // shine (up-left)
  pop();
}

function drawMarkers() {
  // blocks / walls -> real texture, else colored cell.
  for (const b of map.blocks) {
    const t = b.texture === 'wall' ? 'wall' : 'block';
    if (!drawElementSprite(t, b.col, b.row)) { paint(t === 'wall' ? COL.wall : COL.block); cellRect(b.col, b.row); }
  }
  // hazards -> real sprite (frame 0), else colored shape.
  for (const s of map.hazards.spikes) {
    if (!drawElementSprite('spike', s.col, s.row)) { paint(COL.spike); spikeMark(s.col, s.row); }
  }
  for (const h of map.hazards.honey) {
    if (!drawElementSprite('honey', h.col, h.row)) { paint(COL.honey); cellRect(h.col, h.row, BLOCK, BLOCK * 0.4); }
  }
  for (const j of map.hazards.jumpPads) {
    if (!drawElementSprite('jumppad', j.col, j.row)) { paint(COL.jumppad); cellRect(j.col, j.row, BLOCK, BLOCK * 0.4); }
  }
  // moving platforms keep the colored multi-cell span + range hint (no sprite).
  for (const p of map.movingPlatforms) {
    paint(COL.mover);
    const len = Math.max(1, p.length | 0);
    const x = p.col * BLOCK + (len * BLOCK) / 2;
    const y = p.row * BLOCK + BLOCK / 2;
    rect(x, y, len * BLOCK, BLOCK);
    // travel range hint
    if (p.range > 0) {
      stroke(...hex(COL.mover.stroke, 120));
      strokeWeight(1);
      line(x, y - p.range * BLOCK, x, y + p.range * BLOCK);
    }
  }
  // gems -> low-res gold coin glyph.
  for (const g of map.gems) coinGlyph(g.col, g.row);
  // enemies -> real sprite + patrol/radius hint; type initial only on fallback.
  for (const e of map.enemies) {
    const drew = drawElementSprite(e.type, e.col, e.row);
    paint(COL[e.type] || COL.slug);
    enemyMark(e, drew);
  }
  // singletons
  if (map.door) {
    if (!drawElementSprite('door', map.door.col, map.door.row)) { paint(COL.door); doorMark(map.door.col, map.door.row); }
  }
  if (map.spawn) { paint(COL.spawn); spawnMark(map.spawn.col, map.spawn.row); }
}

function spikeMark(c, r) {
  const x = c * BLOCK + BLOCK / 2, y = r * BLOCK + BLOCK;
  const k = BLOCK / 2;
  beginShape();
  vertex(x - k, y); vertex(x - k / 2, y - k); vertex(x, y);
  vertex(x + k / 2, y - k); vertex(x + k, y);
  endShape(CLOSE);
}

function diamond(c, r, s) {
  const x = c * BLOCK + BLOCK / 2, y = r * BLOCK + BLOCK / 2;
  push(); translate(x, y); rotate(QUARTER_PI || Math.PI / 4); rect(0, 0, s, s); pop();
}

// When `spriteDrew` is true the real sprite is already painted, so we only
// overlay the patrol/radius HINT (no colored body, no type initial).
function enemyMark(e, spriteDrew = false) {
  const x = e.col * BLOCK + BLOCK / 2, y = e.row * BLOCK + BLOCK / 2;
  if (e.type === 'bat') {
    if (!spriteDrew) { ellipse ? ellipse(x, y, BLOCK * 0.7, BLOCK * 0.5) : rect(x, y, BLOCK * 0.7, BLOCK * 0.5); }
    if (e.patrolRadius > 0) {
      noFill(); stroke(...hex(COL.bat.stroke, 90));
      ellipse ? ellipse(x, y, e.patrolRadius * BLOCK * 2, e.patrolRadius * BLOCK * 2)
              : rect(x, y, e.patrolRadius * BLOCK * 2, e.patrolRadius * BLOCK * 2);
      paint(COL.bat);
    }
  } else {
    if (!spriteDrew) rect(x, y, BLOCK * 0.8, BLOCK * 0.8);
    // patrol span
    if (e.patrolRight > e.patrolLeft) {
      const lx = e.patrolLeft * BLOCK + BLOCK / 2, rx = e.patrolRight * BLOCK + BLOCK / 2;
      stroke(...hex((COL[e.type] || COL.slug).stroke, 120)); strokeWeight(2);
      line(lx, y + BLOCK * 0.5, rx, y + BLOCK * 0.5);
    }
  }
  // type initial only when the sprite fell back (otherwise it'd cover the art).
  if (!spriteDrew) {
    noStroke(); fill(0, 0, 0, 200); textSize(10);
    text(e.type[0].toUpperCase(), x, y);
  }
}

function doorMark(c, r) {
  const x = c * BLOCK + BLOCK / 2, y = r * BLOCK + BLOCK / 2;
  rect(x, y, BLOCK * 0.8, BLOCK * 1.4);
  noStroke(); fill(0, 0, 0, 200); textSize(9); text('DOOR', x, y);
}

function spawnMark(c, r) {
  const x = c * BLOCK + BLOCK / 2, y = r * BLOCK + BLOCK / 2;
  // hollow ring + P
  noFill(); stroke(...hex(COL.spawn.stroke)); strokeWeight(3);
  ellipse ? ellipse(x, y, BLOCK * 0.9, BLOCK * 0.9) : rect(x, y, BLOCK * 0.9, BLOCK * 0.9);
  noStroke(); fill(...hex(COL.spawn.fill)); textSize(12); text('P', x, y);
}

function drawGhost() {
  if (!hovValid) return;
  const c = hovCol, r = hovRow;
  push();
  if (tool === 'eraser') {
    noFill(); stroke(232, 93, 79, 200); strokeWeight(2);
    cellRect(c, r);
    line(c * BLOCK + 6, r * BLOCK + 6, c * BLOCK + BLOCK - 6, r * BLOCK + BLOCK - 6);
    line(c * BLOCK + BLOCK - 6, r * BLOCK + 6, c * BLOCK + 6, r * BLOCK + BLOCK - 6);
  } else {
    const col = ghostColor(tool);
    // Faint full-cell target so the hovered cell stays legible even for the thin-bar
    // (honey/jumppad) and small-glyph (gem/door/spawn) tools whose shapes don't fill it.
    if (tool !== 'movingPlatform') {
      noFill(); stroke(...hex(col.stroke, 90)); strokeWeight(1);
      cellRect(c, r);
    }
    // Glyph-owning tools first (they don't go through drawElementSprite).
    if (tool === 'gem') {
      coinGlyph(c, r, 130);
    } else if (tool === 'spawn') {
      const x = c * BLOCK + BLOCK / 2, y = r * BLOCK + BLOCK / 2;
      noFill(); stroke(...hex(COL.spawn.stroke, 160)); strokeWeight(3);
      ellipse ? ellipse(x, y, BLOCK * 0.9, BLOCK * 0.9) : rect(x, y, BLOCK * 0.9, BLOCK * 0.9);
    } else if (tool === 'movingPlatform') {
      const len = Math.max(1, cfg.length | 0);
      const x = c * BLOCK + (len * BLOCK) / 2, y = r * BLOCK + BLOCK / 2;
      fill(...hex(col.fill, 110)); stroke(...hex(col.stroke, 200)); strokeWeight(2);
      rect(x, y, len * BLOCK, BLOCK);
    } else if (!drawElementSprite(tool, c, r, 130)) {
      // Sprite tool but image not ready / unsupported -> translucent colored shape.
      fill(...hex(col.fill, 110));
      stroke(...hex(col.stroke, 200));
      strokeWeight(2);
      if (tool === 'honey' || tool === 'jumppad') {
        cellRect(c, r, BLOCK, BLOCK * 0.4);
      } else {
        cellRect(c, r);
      }
    }
  }
  pop();
}

function ghostColor(t) {
  if (t === 'block') return COL.block;
  if (t === 'wall') return COL.wall;
  if (t === 'movingPlatform') return COL.mover;
  if (t === 'jumppad') return COL.jumppad;
  return COL[t] || COL.block;
}

// --- mouse / canvas helpers ----------------------------------------------
// q5play `mouse.presses/pressing/released` take an optional button name.
function mousePressing(btn) {
  try { return typeof mouse !== 'undefined' && mouse.pressing && mouse.pressing(btn); }
  catch (e) { return false; }
}
// Screen-space mouse (canvas pixels) for drag deltas — global mouseX/mouseY are untransformed.
function mouseSX() { return (typeof mouseX === 'number') ? mouseX : 0; }
function mouseSY() { return (typeof mouseY === 'number') ? mouseY : 0; }

function mouseInCanvas() {
  if (typeof mouse !== 'undefined' && typeof mouse.isOnCanvas === 'boolean') return mouse.isOnCanvas;
  const x = mouseSX(), y = mouseSY();
  return x >= 0 && y >= 0 && x <= (typeof width === 'number' ? width : 0) && y <= (typeof height === 'number' ? height : 0);
}

// '#rrggbb' (+alpha 0..255) -> [r,g,b,a] for q5 fill/stroke.
function hex(h, a = 255) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

// --- localStorage (multiple named maps) -----------------------------------
function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function writeStore(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); return true; }
  catch (e) { return false; }
}

// Collapse whitespace/control chars to single spaces and cap length, so a saved name
// is a sane single-line localStorage key that can't corrupt the newline-joined Load picker.
function sanitizeName(s) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

// Export the current level as a downloadable .json (the schema + a `title` field) so it can be
// dropped into the repo's levels/ folder and listed in the built-in Levels menu. Validation is
// enforced first, same bar as play-test, so you can't export a half-finished level.
function doExport() {
  const v = validate(map);
  if (!v.ok) { setStatus('cannot export: ' + (v.errors[0] || 'level invalid')); return; }
  const title = (window.prompt('Export level — title shown in the Levels menu:', mapName) || '').trim();
  if (!title) { setStatus('export cancelled'); return; }
  const slug = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'level';
  try {
    const data = JSON.stringify({ ...getMap(), title });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slug + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`exported ${slug}.json — drop it in levels/ and add it to manifest.json`);
  } catch (e) {
    setStatus('export failed');
  }
}

function doSave() {
  const name = sanitizeName(window.prompt('Save map as:', mapName) || '');
  if (!name) { setStatus('save cancelled'); return; }
  const store = readStore();
  store[name] = serialize(map);
  if (writeStore(store)) { mapName = name; setStatus('saved'); }
  else setStatus('save failed (storage full?)');
}

function doLoad() {
  const store = readStore();
  const names = Object.keys(store);
  if (!names.length) { setStatus('no saved maps'); return; }
  // Cap the listed names so the prompt can't balloon/overflow once many maps pile up.
  const shown = names.slice(0, LOAD_LIST_MAX);
  const more = names.length > LOAD_LIST_MAX ? `\n…(+${names.length - shown.length} more — type a name)` : '';
  const pick = (window.prompt(`Load which map?\n${shown.join('\n')}${more}`, names[0]) || '').trim();
  if (!pick) { setStatus('load cancelled'); return; }
  if (!store[pick]) { setStatus(`no map "${pick}"`); return; }
  let loaded;
  try {
    loaded = deserialize(store[pick]);     // validates + may throw
  } catch (e) {
    // Best-effort: load even a not-yet-complete map (missing spawn/door) by parsing raw.
    try { loaded = JSON.parse(store[pick]); }
    catch (e2) { setStatus('load failed: corrupt'); return; }
    if (!loaded || typeof loaded !== 'object') { setStatus('load failed: corrupt'); return; }
  }
  // normalize() backfills any missing containers so a partial/older map is editable, and
  // is idempotent — safe (and correct) for both the validated and the raw-parsed paths.
  normalize(loaded);
  map = loaded;
  mapName = pick;
  resetCamera();
  setStatus('loaded');
}

function doNew() {
  if (!window.confirm('Discard current map and start new?')) return;
  map = emptyMap();
  mapName = 'untitled';
  resetCamera();
  setStatus('new map');
}

// Validate-gate then hand the in-memory schema to sketch for a play-test run.
function doPlaytest() {
  const v = validate(map);
  if (!v.ok) { setStatus('cannot play: ' + v.errors[0]); return; }
  onPlaytest(getMap(), { freezePlatforms });
}

// Backfill any missing schema fields so an older/partial saved map is editable.
function normalize(m) {
  if (!m || typeof m !== 'object') return;
  if (typeof m.version !== 'number') m.version = 1;
  if (!('spawn' in m)) m.spawn = null;
  if (!('door' in m)) m.door = null;
  if (!Array.isArray(m.blocks)) m.blocks = [];
  if (!m.hazards || typeof m.hazards !== 'object') m.hazards = {};
  for (const k of ['spikes', 'honey', 'jumpPads']) if (!Array.isArray(m.hazards[k])) m.hazards[k] = [];
  if (!Array.isArray(m.movingPlatforms)) m.movingPlatforms = [];
  if (!Array.isArray(m.gems)) m.gems = [];
  if (!Array.isArray(m.enemies)) m.enemies = [];
}

function resetCamera() {
  // Center on spawn if present, else origin.
  if (map.spawn) { camera.x = map.spawn.col * BLOCK + BLOCK / 2; camera.y = map.spawn.row * BLOCK + BLOCK / 2; }
  else { camera.x = 0; camera.y = 0; }
  if (typeof camera.zoom === 'number') camera.zoom = 1;
}

// --- public API -----------------------------------------------------------
export function initEditor(cb = {}) {
  if (cb.onPlaytest) onPlaytest = cb.onPlaytest;
  if (cb.onClose) onClose = cb.onClose;
  ensureDom();
  inited = true;
  // Suppress the browser context menu over the canvas so right-click can erase.
  const cv = document.querySelector('canvas');
  if (cv && !cv.dataset.edCtx) {
    cv.dataset.edCtx = '1';
    cv.addEventListener('contextmenu', (e) => { if (open) e.preventDefault(); });
  }
}

export function openEditor(m = null) {
  if (open) return;
  open = true;
  ensureDom();
  if (m && typeof m === 'object') { map = m; normalize(map); }
  else map = emptyMap();
  if (dom && dom.screen) dom.screen.style.display = 'flex';
  lastMSX = lastMSY = null;      // force a fresh ghost snap on first frame
  resnapGhost = true;
  selectTool(tool);              // sync palette highlight + config visibility
  resetCamera();
  setStatus();
}

export function closeEditor() {
  if (!open) return;
  open = false;
  dragging = false;
  if (dom && dom.screen) dom.screen.style.display = 'none';
}

export function isEditorOpen() { return open; }

// The live in-memory schema. Callers (playtest/publish) get a deep copy so a
// continued edit session can't mutate a map already handed off.
export function getMap() {
  return JSON.parse(JSON.stringify(map));
}
