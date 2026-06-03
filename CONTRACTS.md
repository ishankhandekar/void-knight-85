# Void Knight — Feature-Pass Contracts (authoritative seams)

Every module is built to THIS spec so parallel work composes. **Rules for all agents:**
- Edit/create ONLY the file(s) you are assigned. Never touch another agent's file.
- ES modules, no build step. q5play globals are available unqualified: `Sprite`, `Group`,
  `camera`, `mouse`, `world`, `allSprites`, `width`, `height`, `STATIC`, `DYNAMIC`, `keyboard`.
- Audio/volume: read `prefs.sfxVolume` **live at play time** (`import { prefs } from './prefs.js'`).
- Any user-supplied text rendered into `.innerHTML` MUST be escaped (see `escapeHtml` below).
- Coordinate system: world units, origin at center, +y down, `BLOCK = 40`. Sprite (x,y) is the CENTER.
- Match the existing retro style (font `'Press Start 2P'`, accent `#f1c40f`, classes `.menu-btn`,
  `.menu-link`, `.auth-input`, `.lb-entry`). Keep code in the surrounding terse style.

---

## A. audio.js  (NEW — Wave 1)
Web Audio synth SFX. No asset files. Lazily create one `AudioContext` on first `playSfx` (resumed
on first call; browsers allow it after the user's sign-in/keypress gestures).
```js
export const SOUNDS = ['swordSwing','splat','landStone','landWall','landHoney','coin','star','uiClick'];
export function playSfx(name, opts = {});  // opts: { volume?:0..1 multiplier, rate?:playbackRate }
// Each sound is a short synth (oscillators/noise + gain envelope). Final gain =
//   base[name] * (opts.volume ?? 1) * prefs.sfxVolume   (clamp 0..1). Return nothing.
// splat: punchy noise burst + low thump (~180ms). swordSwing: quick filtered-noise "whoosh" (~140ms).
// landStone: short thud; landWall: slightly higher/harder; landHoney: soft muffled squelch.
// coin: bright blip; star: rising arpeggio; uiClick: tiny tick. Never throw if audio unavailable.
```

## B. juice.js  (NEW — Wave 1)
Screen shake + hit-stop. Caller invokes `hitStop` only during active gameplay.
```js
export function shake(intensity = 6, ms = 180);   // accumulate a shake (px amplitude, duration)
export function hitStop(ms = 60);                  // brief freeze: capture world.timeScale, set 0, restore captured value after ms
export function updateJuice(camera);               // CALL ONCE PER FRAME from the loop AFTER camera is positioned:
                                                   //   decays+applies the shake offset to camera.x/camera.y,
                                                   //   and restores timeScale when a hit-stop elapses.
// Use performance.now() for timing. Shake offset must be removed next frame (store/undo last offset) so it
// doesn't accumulate. hitStop must restore the timeScale value present when it STARTED (cooperates with pause).
```

## C. levelschema.js  (NEW — Wave 1, pure, no q5 deps)
```js
export const SCHEMA_VERSION = 1;
export const BLOCK = 40;
export function emptyMap();            // a blank map: {version, spawn:null, door:null, blocks:[], hazards:{spikes:[],honey:[],jumpPads:[]}, movingPlatforms:[], gems:[], enemies:[]}
export function validate(map);         // -> { ok:boolean, errors:string[] }  (needs exactly one spawn & one door; ints; speed/length>0)
export function serialize(map);        // -> JSON string (compact)
export function deserialize(str);      // -> map object; throw Error on malformed
export function gridToWorld(col,row);  // -> { x: col*40, y: row*40 }
```
**Schema shape (grid coords `col,row` are integers; world = col*40, row*40):**
```js
{
  version: 1,
  spawn: { col, row },                          // player start (rests on a block below it)
  door:  { col, row },                          // exit portal
  blocks: [ { col, row, texture: 'platform' | 'wall' } ],
  hazards: { spikes:[{col,row}], honey:[{col,row}], jumpPads:[{col,row}] },
  movingPlatforms: [ { col, row, length, texture, range, speed } ], // range = #blocks of vertical travel each way; speed px/frame
  gems: [ { col, row } ],
  enemies: [ { type:'slug'|'mage'|'bat', col, row, patrolLeft, patrolRight, patrolRadius } ]
  // slug/mage use patrolLeft/Right (in COLS); set equal -> stationary (mage turret). bat uses patrolRadius (COLS); 0 -> hover.
}
```

## D. customlevel.js  (NEW — Wave 2; imports levelschema)
```js
export function buildCustomLevel(map);  // returns the WORLD CONTRACT object (below). Builds all sprites in q5 world.
```
**WORLD CONTRACT** (matches level.js return + tutorial's enemySpawns + new keys):
```js
{
  platforms,          // Group (player/enemy groundGroup; also for door/HUD)
  door,               // Sprite (AABB door check)
  update(),           // per-frame (moving platforms); no-op if none
  updateSpikes(),     // per-frame hazard-anim housekeeping
  freeze(),           // zero moving-platform velocities
  reset(),            // restore moving platforms + hazards to start
  spawnX, spawnY,     // player spawn (rest ON the floor: y = blockTop - 16 for the 32px player)
  enemySpawns: [ { type, x, y, patrolLeft, patrolRight, patrolRadius } ],  // WORLD coords; sketch maps -> Slug/Mage/Bat
  gems: [ { x, y } ], // WORLD coords; sketch hands to collectibles.buildGems
  destroy()           // delete every sprite/group this world created (called before rebuilding a custom world)
}
```
Build at a far offset (e.g. base col-offset so it never overlaps main level x∈[-720,720] or tutorial x≈2000;
use `CUSTOM_OFFSET_X = 4000`). Register honey/jumpPad/spike `group.overlaps/colliding(allSprites, …)` ONCE
inside the builder (copy level.js:280-312). Moving platforms: generalize level.js:217-256 to per-platform
`topY/bottomY` (derived from start ± range*40) and `speed`.

## E. collectibles.js  (NEW — Wave 2; imports audio)
```js
export function buildGems(worldGems);  // worldGems: [{x,y}] -> create gem sprites (a module group). Idempotent-replace.
export function resetGems();           // re-show all gems (level reset)
export function clearGems();           // delete all gem sprites
export function updateGems(player);    // per-frame: overlap player -> collect (hide) + playSfx('coin') + bump count
export function gemsCollected();        // -> number
export function gemsTotal();            // -> number
export function computeStars(timeMs, parMs, gemsGot, gemsTot); // -> 1|2|3
```
Gem sprite: small spinning/pulsing colored square (~16px), `collider:'none'`, gold. Manual AABB overlap vs player.

## F. pauseui.js  (NEW — Wave 1; module pattern = settings.js)
```js
export function initPause({ onResume, onRestart, onQuit });  // sketch injects handlers
export function openPause();   // show #pause-screen
export function closePause();  // hide
export function isPauseOpen(); // -> boolean
// Buttons (Resume/Restart/Quit) call the injected handlers then closePause() as appropriate.
// Esc/`P` handling: the MODULE listens (capture-phase keydown) and toggles via the handlers ONLY while a
// gameplay session is active — but to avoid coupling, just expose open/close/isOpen and let sketch decide
// when to call openPause() (sketch owns the 'is in active play' check). Include an Esc-capture that calls onResume.
```

## G. Firestore map helpers  (leaderboard.js — Wave 1; add to existing file, reuse its `db`)
Add these imports to the firestore import line: `addDoc, updateDoc, deleteDoc, increment, where, getCountFromServer`.
```js
export const MAP_TITLE_RE = /^[\w \-!?.,']{3,40}$/;
export function isValidMapTitle(t);                       // MAP_TITLE_RE.test(t)
export async function publishMap(uid, authorName, title, dataString);  // -> mapId. createdAt:serverTimestamp(), likeCount/dislikeCount/commentCount:0
export async function fetchMaps(sort = 'new', n = 30);    // 'new'->orderBy('createdAt','desc'); 'top'->orderBy('likeCount','desc'). returns [{id, ...data}]
export async function getMap(id);                          // -> {id, ...}|null
export async function setReaction(mapId, uid, kind);       // kind 'like'|'dislike'|'none'. Maintains /likes/{uid} & /dislikes/{uid} (one each) + best-effort counter increments on the map doc.
export async function getUserReaction(mapId, uid);         // -> 'like'|'dislike'|null
export async function addComment(mapId, uid, authorName, text);   // create comment doc; best-effort commentCount++
export async function fetchComments(mapId, n = 50);        // orderBy('createdAt','desc') -> [{id, authorUid, authorName, text, createdAt}]
```
Single-field `orderBy` only (no composite index). Always return `{id, ...d.data()}` for maps/comments.

## H. firestore.rules  (Wave 1 — add map collections, mirror existing style)
```
match /maps/{mapId} {
  allow read: if true;
  allow create: if request.auth != null
    && request.resource.data.ownerUid == request.auth.uid
    && request.resource.data.title is string && request.resource.data.title.size() >= 3 && request.resource.data.title.size() <= 40
    && request.resource.data.data is string && request.resource.data.data.size() <= 200000;
  allow update, delete: if request.auth != null && resource.data.ownerUid == request.auth.uid;  // owner edits/deletes
  // NOTE: reaction/comment counters are denormalized; to allow the acting (non-owner) user to bump them,
  // EITHER keep counts read from subcollections (no map-doc write) OR add a narrowly-scoped update rule that
  // only permits ±1 deltas to like/dislike/commentCount. Pick the subcollection-truth approach to stay safe
  // (Wave-1 #6 agent: implement counts via the subcollections; treat map-doc counters as optional/best-effort
  //  and DO NOT open the map doc to arbitrary writes).
  match /likes/{uid}    { allow read: if true; allow create, delete: if request.auth != null && request.auth.uid == uid; allow update: if false; }
  match /dislikes/{uid} { allow read: if true; allow create, delete: if request.auth != null && request.auth.uid == uid; allow update: if false; }
  match /comments/{cid} {
    allow read: if true;
    allow create: if request.auth != null && request.resource.data.authorUid == request.auth.uid
      && request.resource.data.text is string && request.resource.data.text.size() >= 1 && request.resource.data.text.size() <= 500;
    allow update: if false;
    allow delete: if request.auth != null && resource.data.authorUid == request.auth.uid;
  }
}
```
**Counter integrity:** subcollection docs are the source of truth. If you keep denormalized counters on the map
doc, do NOT allow arbitrary map-doc writes — compute counts from subcollections in `getMap`/detail view
(use `getCountFromServer` on the likes/dislikes subcollections), and treat any stored counter as best-effort.

## I. mapeditor.js  (NEW — Wave 2; imports levelschema, customlevel)
Self-contained editor. Runs IN the game loop while `mode==='editor'` (sketch calls these).
```js
export function initEditor({ onPlaytest, onClose, onPublish });  // sketch injects: onPlaytest(map), onClose(), onPublish(map,title)
export function openEditor(map = null);   // show #map-editor-screen palette; load map or emptyMap(); reset camera
export function closeEditor();
export function isEditorOpen();
export function updateEditor();            // per-frame while editing: handle mouse place/erase (mouse.x/y world-space, snap to 40), camera pan (WASD or drag)
export function drawEditor();              // per-frame: draw a grid overlay + ghost of the selected tool + placed-element markers
export function getMap();                  // -> current in-memory schema (for playtest/publish/save)
```
Palette tools: block, wall, spike, honey, jumppad, movingPlatform, gem, slug, mage, bat, door, spawn, eraser.
Config panel for movingPlatform (length, range, speed, texture) and enemies (patrol/turret/radius). Buttons:
Save (localStorage `voidKnightMaps`), Load, New, Play-test (validate→onPlaytest), Publish (validate→prompt title→onPublish), Back (onClose). Validation must require exactly one spawn + one door before Play/Publish.

## J. mapbrowser.js  (NEW — Wave 2; imports the Firestore map helpers)
```js
export function initBrowser({ onPlay, onClose });  // sketch injects: onPlay(map /*schema object*/), onClose()
export function openBrowser();    // show #map-browser-screen, render gallery (renderLeaderboard lifecycle: loading/empty/error/rows)
export function closeBrowser();
export function isBrowserOpen();
```
Gallery cards (title/author/♥count) → click opens detail (#map-detail-screen): Play (deserialize map.data → onPlay),
Like/Dislike (setReaction; reflect getUserReaction), comments list (fetchComments) + post box (addComment).
`escapeHtml` ALL titles/author names/comment text. Sort toggle new/top. Detail can be a sub-view within the same module.

## K. player.js edits  (Wave 2 — owns player.js; NO new exports)
- Sword swing: replace `this.sfx.attack.play()` (≈L440-441) with `playSfx('swordSwing')` (import audio). Keep the rest.
- Landing: add `this._wasGrounded=false` (constructor). In the ground loop (≈L286-332) capture the landing `plat`.
  After computing `isGrounded`, if `!this._wasGrounded && this.isGrounded` AND the pre-land downward speed was
  significant (track `this._fallVy` = vel.y measured just before zeroing on landing, threshold ~4) AND
  `!this.sprite._jumpPadBounce`: choose surface — `this.sprite._onHoney` → `landHoney`; else inspect the landed
  block's texture (`plat.img`/path includes 'walltexture') → `landWall` else `landStone`; `playSfx(...)`; and on a
  HARD land (speed > ~9) call `juice.shake(3,120)`. Set `this._wasGrounded = this.isGrounded` at loop end.
- Do not change movement/jump logic.

## L. enemy.js + slug.js edits  (Wave 2 — owns both)
- slug.js `_startDeath`/`_stepDeath`: explosive splat — `count` ≈ 18 (size variety), higher `speed`, stronger
  gravity; spawn a brief white **flash** sprite (scales up then fades, ~6 frames); keep/intensify the squish.
  Play `playSfx('splat')` (import audio) and `juice.hitStop(60)` + `juice.shake(5,160)` at death start.
- enemy.js: add an optional `_flash()` helper usable by overrides (white expanding sprite). Do NOT change the
  generic mage/bat deaths except to make particles support `size` jitter if helpful. The shared `killSfx`
  (downSlash) stays for mage/bat; slug overrides to the louder synth splat.
- Import audio/juice at top of slug.js (and enemy.js if used there).

## M. New DOM element IDs (Wave 3 adds these to index.html; modules reference them)
- Pause: `#pause-screen` (+ buttons `#pause-resume`, `#pause-restart`, `#pause-quit`).
- Editor: `#map-editor-screen` (palette container `#editor-palette`, config `#editor-config`, status `#editor-status`,
  buttons `#editor-save`,`#editor-load`,`#editor-new`,`#editor-play`,`#editor-publish`,`#editor-back`).
- Browser: `#map-browser-screen` (`#map-list`, `#map-list-empty`, `#map-sort`, `#map-browser-back`).
- Detail: `#map-detail-screen` (`#map-detail-title`,`#map-detail-author`,`#map-detail-play`,`#map-detail-like`,
  `#map-detail-dislike`,`#map-detail-likes`,`#map-comments`,`#map-comment-input`,`#map-comment-post`,`#map-detail-back`).
- Completion stars: `#level-complete-stars` (added to the existing `#level-complete-screen`).
- Menu buttons (in `#start-info-hint`): `data-menu-action="editor"` and `data-menu-action="browse"`.

## N. sketch.js integration points (Wave 3 — the orchestrator wires; listed so modules know what sketch calls)
- New `mode` values: `'editor'` (run updateEditor/drawEditor, no player physics) and custom play uses `'play'`.
- `enterCustom(map)`: clone of `enterTutorial` — `buildCustomLevel`, map `enemySpawns`→enemies, `collectibles.buildGems(world.gems)`,
  set spawn, `resetActiveWorld()`. Door → completion screen with `computeStars`. Track `customReturn` ('editor'|'browse').
- Loop: when `mode==='play'` call `collectibles.updateGems(player)`; every frame call `juice.updateJuice(camera)` after camera is set.
- Menu actions `editor`→`openEditor()`, `browse`→`openBrowser()`. `initEditor/initBrowser/initPause` wired with handlers.
- `paused` OR includes `isPauseOpen() || isEditorOpen() || isBrowserOpen()`.
