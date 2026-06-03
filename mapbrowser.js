// Community map browser: public gallery (#map-browser-screen) + detail view (#map-detail-screen).
// Lists published maps (new/top), opens a map's detail to Play / Like / Dislike / comment.
// All user-supplied text (titles, author names, comments) is escaped before hitting innerHTML.
import {
  fetchMaps, getMap, setReaction, getUserReaction, addComment, fetchComments,
} from './leaderboard.js';
import { deserialize } from './levelschema.js';

// --- injected handlers + acting user ---
let onPlay = () => {};
let onClose = () => {};
// Current signed-in user (set by sketch on auth change). Blank uid => write actions disabled.
let curUid = null;
let curName = '';

let open = false;          // gallery visible
let sort = 'new';          // 'new' | 'top'
let detailMap = null;      // the {id,...} map currently shown in detail (null when closed)
let busy = false;          // guards reaction/comment writes against double-clicks
// Monotonic request tokens. Each async render/open captures the current value at entry and
// bails after every await if a newer request has superseded it. This defeats out-of-order
// resolution when the user rapidly flips the sort or closes/opens different maps: a slow
// earlier fetch can no longer paint over a faster later one.
let gallerySeq = 0;        // bumped on every renderGallery() call
let detailSeq = 0;         // bumped on every openDetail()/closeDetail()

// Screens/elements are added to index.html by Wave 3 and may not exist at import time,
// so resolve them lazily on each use rather than caching at module load.
const el = (id) => document.getElementById(id);
const setText = (id, t) => { const n = el(id); if (n) n.textContent = t; };

// Escape any string before placing it into innerHTML (copied from sketch.js).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A Firestore Timestamp -> short local string; tolerate missing/odd values.
function formatWhen(ts) {
  try {
    const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleDateString();
  } catch (e) { return ''; }
}

function signedIn() { return !!curUid; }

// --- public API ------------------------------------------------------------

export function initBrowser({ onPlay: play, onClose: close } = {}) {
  if (play) onPlay = play;
  if (close) onClose = close;
  buildSortToggle();
  bind('map-browser-back', 'click', () => { closeBrowser(); onClose(); });
  bind('map-detail-back', 'click', closeDetail);
  bind('map-detail-play', 'click', playDetail);
  bind('map-detail-like', 'click', () => react('like'));
  bind('map-detail-dislike', 'click', () => react('dislike'));
  bind('map-comment-post', 'click', postComment);
  const input = el('map-comment-input');
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); }
  });
}

// sketch calls this on auth change so write actions use the right identity.
export function setCurrentUser(uid, name) {
  curUid = uid || null;
  curName = name || '';
  if (detailMap) updateWriteState();   // reflect sign-in changes live
}

export function isBrowserOpen() {
  return open;
}

export function openBrowser() {
  const screen = el('map-browser-screen');
  if (!screen) return;
  open = true;
  closeDetail();            // never show a stale detail under the gallery
  screen.style.display = 'flex';
  reflectSortButtons();
  renderGallery();
}

export function closeBrowser() {
  open = false;
  closeDetail();
  const screen = el('map-browser-screen');
  if (screen) screen.style.display = 'none';
}

// --- helpers ---------------------------------------------------------------

function bind(id, ev, fn) {
  const n = el(id);
  if (n) n.addEventListener(ev, fn);
}

// --- sort toggle -----------------------------------------------------------

function buildSortToggle() {
  const host = el('map-sort');
  if (!host || host.dataset.built) return;   // idempotent: build chips once
  host.dataset.built = '1';
  host.innerHTML = '';
  for (const [val, label] of [['new', 'NEW'], ['top', 'TOP']]) {
    const b = document.createElement('span');
    b.className = 'toggle-btn';
    b.dataset.sort = val;
    b.textContent = label;
    b.addEventListener('click', () => {
      if (sort === val) return;
      sort = val;
      reflectSortButtons();
      renderGallery();
    });
    host.appendChild(b);
  }
  reflectSortButtons();
}

function reflectSortButtons() {
  const host = el('map-sort');
  if (!host) return;
  for (const b of host.querySelectorAll('.toggle-btn')) {
    b.classList.toggle('active', b.dataset.sort === sort);
  }
}

// --- gallery (mirrors sketch.js renderLeaderboard lifecycle) ---------------

async function renderGallery() {
  const list = el('map-list');
  const empty = el('map-list-empty');
  if (!list) return;
  const seq = ++gallerySeq;   // claim this render; a later flip will bump past us
  list.innerHTML = '';
  if (empty) { empty.textContent = 'Loading…'; empty.style.display = 'block'; }
  let rows = [];
  try {
    rows = await fetchMaps(sort, 30);
  } catch (e) {
    // Only show the error if we're still the active request (don't clobber a newer load).
    if (seq === gallerySeq && open && empty) empty.textContent = 'Failed to load maps';
    return;
  }
  // Bail if a newer render started, the gallery closed, or the list node was swapped out.
  if (seq !== gallerySeq || !open || el('map-list') !== list) return;
  if (rows.length === 0) {
    if (empty) empty.textContent = 'No maps yet';
    return;
  }
  if (empty) empty.style.display = 'none';
  rows.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'lb-entry map-card';
    // Title gets the lion's share of the row; author is secondary; the heart count
    // is gold (not the green .lb-score) to read as a "like" tally, not a score.
    card.innerHTML = `
      <span class="lb-name" style="flex:2;">${escapeHtml(m.title || 'Untitled')}</span>
      <span class="lb-author">${escapeHtml(m.authorName || '???')}</span>
      <span class="lb-score" style="color:#f1c40f; width:auto; min-width:48px; padding-left:8px;">&#9829;&nbsp;${m.likeCount || 0}</span>
    `;
    card.addEventListener('click', () => openDetail(m.id));
    list.appendChild(card);
  });
}

// --- detail view -----------------------------------------------------------

async function openDetail(id) {
  const screen = el('map-detail-screen');
  if (!screen) return;
  const seq = ++detailSeq;   // claim this open; a later open/close bumps past us
  detailMap = null;
  busy = false;
  screen.style.display = 'flex';
  // Keep a long (up to 40-char) title from overflowing the fixed overlay: wrap it
  // and bound it to the same content column as the lists. Base styles (gold glow,
  // centering, font) stay owned by index.html — we only add wrapping/width guards.
  const titleNode = el('map-detail-title');
  if (titleNode) {
    titleNode.style.maxWidth = '520px';
    titleNode.style.wordBreak = 'break-word';
    titleNode.style.lineHeight = '1.4';
  }
  // Loading state.
  setText('map-detail-title', 'Loading…');
  setText('map-detail-author', '');
  setText('map-detail-likes', '');
  setReactionPressed(null);
  setWriteDisabled(true);
  const clist = el('map-comments');
  if (clist) clist.innerHTML = '';
  const cinput = el('map-comment-input');
  if (cinput) cinput.value = '';

  let map;
  try {
    map = await getMap(id);   // includes authoritative like/dislike counts from subcollections
  } catch (e) {
    if (el('map-detail-screen') && el('map-detail-screen').style.display !== 'none') {
      setText('map-detail-title', 'Failed to load map');
    }
    return;
  }
  // Bail if a newer openDetail()/closeDetail() superseded this one while we awaited.
  if (seq !== detailSeq) return;
  if (!map) { setText('map-detail-title', 'Map not found'); return; }

  detailMap = map;
  setText('map-detail-title', map.title || 'Untitled');
  setText('map-detail-author', 'by ' + (map.authorName || '???'));
  renderCounts(map);
  updateWriteState();

  // Current user's existing reaction (independent await; tolerate failure).
  if (signedIn()) {
    try {
      const r = await getUserReaction(map.id, curUid);
      if (seq === detailSeq) setReactionPressed(r);
    } catch (e) { /* leave neutral */ }
  }

  renderComments(map.id);
}

function closeDetail() {
  detailSeq++;   // invalidate any in-flight openDetail() awaits
  detailMap = null;
  const screen = el('map-detail-screen');
  if (screen) screen.style.display = 'none';
}

// Reflect like/dislike counts from a map object onto the detail header.
function renderCounts(map) {
  const likes = map.likeCount || 0;
  const dislikes = map.dislikeCount || 0;
  // The buttons already read "Like" / "Dislike", so the count span is just a
  // parenthesized tally — no redundant ♥/✕ glyph crammed in beside the label.
  setText('map-detail-likes', '(' + likes + ')');
  // Optional dislikes readout if the markup provides it.
  setText('map-detail-dislikes', '(' + dislikes + ')');
}

// Visually mark which reaction (if any) the user has chosen.
function setReactionPressed(kind) {
  const like = el('map-detail-like');
  const dislike = el('map-detail-dislike');
  if (like) like.classList.toggle('active', kind === 'like');
  if (dislike) dislike.classList.toggle('active', kind === 'dislike');
}

// Enable/disable the write controls and reflect why when signed out.
function updateWriteState() {
  const disabled = !signedIn() || !detailMap;
  setWriteDisabled(disabled);
  const post = el('map-comment-post');
  if (post) post.textContent = signedIn() ? 'Post' : 'Sign in';
  // Mirror the signed-out reason in the textarea placeholder so a disabled,
  // empty composer explains itself instead of just looking broken.
  const input = el('map-comment-input');
  if (input) input.placeholder = signedIn() ? 'Add a comment…' : 'Sign in to comment';
}

function setWriteDisabled(disabled) {
  for (const id of ['map-detail-like', 'map-detail-dislike', 'map-comment-post', 'map-comment-input']) {
    const n = el(id);
    if (!n) continue;
    n.disabled = disabled;
    n.classList.toggle('disabled', disabled);
  }
}

// --- detail actions --------------------------------------------------------

function playDetail() {
  if (!detailMap) return;
  let map;
  try {
    map = deserialize(detailMap.data);   // string -> validated schema object
  } catch (e) {
    setText('map-detail-title', 'This map is corrupted and cannot be played');
    return;
  }
  onPlay(map);
}

async function react(kind) {
  if (!signedIn() || !detailMap || busy) return;
  const map = detailMap;
  // Toggle off if re-clicking the active reaction.
  const likeActive = el('map-detail-like') && el('map-detail-like').classList.contains('active');
  const dislikeActive = el('map-detail-dislike') && el('map-detail-dislike').classList.contains('active');
  const already = kind === 'like' ? likeActive : dislikeActive;
  const next = already ? 'none' : kind;

  busy = true;
  setWriteDisabled(true);
  // Optimistic reaction highlight.
  setReactionPressed(next === 'none' ? null : next);
  try {
    await setReaction(map.id, curUid, next);
    // Re-read authoritative counts (and reaction) from the server.
    const fresh = await getMap(map.id);
    if (detailMap && detailMap.id === map.id && fresh) {
      detailMap = fresh;
      renderCounts(fresh);
      const r = await getUserReaction(map.id, curUid);
      setReactionPressed(r);
    }
  } catch (e) {
    // Restore from whatever the server currently reports.
    try {
      const r = await getUserReaction(map.id, curUid);
      if (detailMap && detailMap.id === map.id) setReactionPressed(r);
    } catch (e2) { /* leave as-is */ }
  } finally {
    busy = false;
    if (detailMap && detailMap.id === map.id) updateWriteState();
  }
}

async function postComment() {
  if (!signedIn() || !detailMap || busy) return;
  const input = el('map-comment-input');
  const text = input ? input.value.trim() : '';
  if (!text || text.length > 500) return;
  const map = detailMap;
  busy = true;
  setWriteDisabled(true);
  try {
    await addComment(map.id, curUid, curName || '???', text);
    if (input) input.value = '';
    if (detailMap && detailMap.id === map.id) await renderComments(map.id);
  } catch (e) {
    // Keep the typed text so the user can retry.
  } finally {
    busy = false;
    if (detailMap && detailMap.id === map.id) updateWriteState();
  }
}

async function renderComments(mapId) {
  const host = el('map-comments');
  if (!host) return;
  host.innerHTML = '<div class="map-comment-empty">Loading…</div>';
  let rows = [];
  try {
    rows = await fetchComments(mapId, 50);
  } catch (e) {
    host.innerHTML = '<div class="map-comment-empty">Failed to load comments</div>';
    return;
  }
  if (!detailMap || detailMap.id !== mapId) return;   // navigated away
  if (rows.length === 0) {
    host.innerHTML = '<div class="map-comment-empty">No comments yet</div>';
    return;
  }
  host.innerHTML = '';
  rows.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'map-comment';
    const when = formatWhen(c.createdAt);
    // Omit the timestamp span entirely when there's no date, so the flex-column
    // gap doesn't leave a blank line above the comment text.
    const whenHtml = when ? `<span class="map-comment-when">${escapeHtml(when)}</span>` : '';
    div.innerHTML = `
      <span class="map-comment-author">${escapeHtml(c.authorName || '???')}</span>
      ${whenHtml}
      <span class="map-comment-text">${escapeHtml(c.text || '')}</span>
    `;
    host.appendChild(div);
  });
}
