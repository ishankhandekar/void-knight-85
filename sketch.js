import { Player } from './player.js';
import { Slug } from './slug.js';
import { Mage } from './mage.js';
import { Bat } from './bat.js';
import { buildLevel } from './level.js';
import { actionPressed } from './keybinds.js';
import { initSettings, initSettingsInGame, isSettingsOpen, openSettings } from './settings.js';
import { prefs, registerMusic, applyGraphics } from './prefs.js';
import { customization, onCustomizationChange, setBodyColor, setHeadColor, setSwordColor } from './customization.js';
import { initCustomize, isCustomizeOpen, openCustomize, closeCustomize, setCustomizeContinueMode } from './customizeui.js';
import { onAuthChange, getUserProfile, claimUsername, isValidUsername, setOnboardingFlag, saveCustomizationToAccount, submitScore, fetchTopScores, publishMap, signOutUser } from './leaderboard.js';
import { initAuth, openAuth, closeAuth, isAuthOpen, setAuthForced } from './authui.js';
import { buildTutorialLevel, resetTutorialHints, updateTutorialHints, showTutorialHint, hideTutorialHint } from './tutorial.js';
import { serialize } from './levelschema.js';
import { buildCustomLevel } from './customlevel.js';
import { buildGems, resetGems, clearGems, updateGems, gemsCollected, gemsTotal, computeStars } from './collectibles.js';
import { updateJuice } from './juice.js';
import { initPause, openPause, isPauseOpen } from './pauseui.js';
import { initEditor, openEditor, closeEditor, isEditorOpen, updateEditor, drawEditor } from './mapeditor.js';
import { initBrowser, openBrowser, closeBrowser, isBrowserOpen, setCurrentUser } from './mapbrowser.js';
import { initSwordCursor } from './swordcursor.js';

let bgImage;
let gameStarted = false;
let levelComplete = false;
let debugMode = false;
let stopwatchStartTime = null;
let stopwatchElapsedMs = 0;
let stopwatchRunning = false;
let stopwatchFinished = false;
let runsCompleted = 0;
let playerName = '';
let bgMusic;
let skinApplied = false;
let authUser = null;
let authUsername = null;
let onboardingStep = 'auth';   // 'auth' | 'username' | 'customize' | 'tutorial' | 'done'
let profile = { username: null, customizeDone: false, tutorialDone: false, customization: null };
let mode = 'menu';             // 'menu' | 'tutorial' | 'play' | 'editor'
let tutorialWorld = null;
let tutorialEnemies = [];
// Custom-map play (built from the editor or the public gallery).
let customWorld = null;
let platformsFrozen = false;   // custom playtest: freeze moving platforms? (toggled by the editor + 'M')
let customEnemies = [];
let customMap = null;          // the schema currently loaded into a custom play
let playingCustom = false;
let customReturn = 'menu';     // where R/Quit goes after a custom play: 'editor' | 'browse' | 'menu'
let parMs = 60000;             // par time used for the star rating of the active world

await Canvas();
displayMode(NORMAL, PIXELATED);

// Keep the canvas filling the window. `Canvas()` sizes once at boot; without this, any window
// wider/taller than the boot size leaves a blank strip (e.g. the right side never drawing) until
// the camera happens to scroll content into the smaller canvas. Resize tracks the window live.
function fitCanvasToWindow() {
  if (typeof resizeCanvas === 'function') {
    const w = (typeof windowWidth === 'number' ? windowWidth : window.innerWidth);
    const h = (typeof windowHeight === 'number' ? windowHeight : window.innerHeight);
    if (w > 0 && h > 0) resizeCanvas(w, h);
  }
}
window.addEventListener('resize', fitCanvasToWindow);
fitCanvasToWindow();   // correct any boot-time size race immediately
await loadImage('Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png', (img) => {
  bgImage = img;
});

world.gravity.y = 20;

const level = buildLevel(height);
const player = new Player(level.spawnX, level.spawnY, level.platforms, () => { bgMusic.pause(); });

// Start camera on the player
camera.x = level.spawnX + 10;
camera.y = level.spawnY + 10;

function freezeEnemies(enemies) {
  for (const enemy of enemies) {
    if (enemy.sprite.deleted || enemy.isDying) continue;
    enemy.sprite.vel.x = 0;
    enemy.sprite.vel.y = 0;
    if (enemy.sprite.physics !== 'kinematic') {
      enemy.sprite._wasDynamic = true;
      enemy.sprite.physics = 'kinematic';
    }
    if (enemy instanceof Mage) {
      for (const fb of enemy.fireballs) {
        if (!fb.deleted && !fb._inPool) {
          fb.vel.x = 0;
          fb.vel.y = 0;
        }
      }
    }
  }
}

function unfreezeEnemies(enemies) {
  for (const enemy of enemies) {
    if (enemy.sprite.deleted || enemy.isDying) continue;
    if (enemy.sprite._wasDynamic) {
      enemy.sprite.vel.x = 0;
      enemy.sprite.vel.y = 0;
      enemy.sprite.physics = 'dynamic';
      delete enemy.sprite._wasDynamic;
    }
    if (enemy instanceof Mage) {
      enemy.charging = false;
      for (let i = enemy.fireballs.length - 1; i >= 0; i--) {
        const fb = enemy.fireballs[i];
        if (!fb.deleted && !fb._inPool) {
          enemy._returnFireball(fb);
          enemy.fireballs.splice(i, 1);
        }
      }
    }
  }
}
// Enemies
const enemies = [
  new Slug(
    level.movingPlatformSlug.x,
    level.movingPlatformSlug.y,
    level.movingPlatformSlug.left,
    level.movingPlatformSlug.right,
    level.platforms
  ),
  new Slug(
    level.secondMovingPlatformSlug.x,
    level.secondMovingPlatformSlug.y,
    level.secondMovingPlatformSlug.left,
    level.secondMovingPlatformSlug.right,
    level.platforms
  ),
  new Mage(240, 468, 240, 240, level.platforms),
  new Mage(680, 308, 680, 680, level.platforms),
  new Mage(240, 108, 240, 240, level.platforms),
  new Mage(680, -92, 680, 680, level.platforms),
  new Bat(120, -260, 40, level.platforms),
  new Bat(520, -220, 0, level.platforms),
];

// The active world the game loop reads — swapped between the main level and the tutorial.
let activeLevel = level;
let activeEnemies = enemies;

// A few collectibles scattered above main-level platforms (reachable while climbing).
const MAIN_GEMS = [
  { x: 320, y: 540 }, { x: 480, y: 220 }, { x: 600, y: 300 }, { x: 360, y: 20 }, { x: 600, y: -100 },
];

// Enemy-player overlap detection (registered per enemy array; harmless in the tutorial).
function setupEnemyOverlaps(enemyArr) {
  for (const enemy of enemyArr) {
    enemy.sprite.overlaps(player.sprite, (enemySprite, playerSprite) => {
      if (player.isDying || player.flyMode || mode === 'tutorial' || enemySprite.deleted || enemySprite._dying) return;
      player.dieInstant();
      freezeEnemies(enemyArr);
    });
  }
}
setupEnemyOverlaps(enemies);

const PARALLAX_X = 0.05;
const PARALLAX_Y = 0.03;
const stopwatchElement = document.getElementById('stopwatch');
const fpsCounter = document.getElementById('fps-counter');
const customizePreview = document.getElementById('customize-preview');
const startScreen = document.getElementById('start-screen');
const startBestScoreEl = document.getElementById('start-best-score');
const startBestTimeEl = document.getElementById('start-best-time');
const startTimeEl = document.getElementById('start-time');
const levelCompleteScreen = document.getElementById('level-complete-screen');
const levelCompleteScore = document.getElementById('level-complete-score');
const levelCompleteTime = document.getElementById('level-complete-time');
const levelCompleteRecords = document.getElementById('level-complete-records');
const nameScreen = document.getElementById('name-screen');
const nameInput = document.getElementById('name-input');
const nameScreenPrompt = document.getElementById('name-screen-prompt');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardEntries = document.getElementById('leaderboard-entries');
const leaderboardEmpty = document.getElementById('leaderboard-empty');
const leaderboardBack = document.getElementById('leaderboard-back');
const LEADERBOARD_KEY = 'voidKnightLeaderboard';
const BEST_SCORE_KEY = 'retroRewindBestScore';
const BEST_TIME_KEY = 'retroRewindBestTime';

bgMusic = new Audio('music/Three Red Hearts - Box Jump.ogg');
bgMusic.loop = true;
registerMusic(bgMusic);

function showNameScreen() {
  hideStartScreen();
  hideInfoScreen();
  hideLeaderboard();
  nameScreen.style.display = 'flex';
  nameInput.value = '';
  nameInput.focus();
}

function hideNameScreen() {
  nameScreen.style.display = 'none';
}

function startGame() {
  if (computeStep() !== 'done') { refreshOnboarding(); return; }   // forced: no skipping the gate
  playerName = authUsername;
  mode = 'play';
  playingCustom = false;
  platformsFrozen = false;   // the main level's moving platforms always move (guard against a leaked custom-playtest freeze)
  activeLevel = level;
  activeEnemies = enemies;
  player.spawnX = level.spawnX;
  player.spawnY = level.spawnY;
  buildGems(MAIN_GEMS);
  parMs = 60000;
  gameStarted = true;
  hideStartScreen();
  hideNameScreen();
  hideInfoScreen();
  hideLeaderboard();
  resetActiveWorld();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}

// The name screen now creates the player's username (saved to their account in Firestore).
async function confirmUsername() {
  const name = nameInput.value.trim();
  if (!isValidUsername(name)) {
    nameScreenPrompt.textContent = '> 3-20 LETTERS & NUMBERS ONLY <';
    nameInput.focus();
    return;
  }
  if (!authUser) { refreshOnboarding(); return; }
  nameScreenPrompt.textContent = '> CHECKING... <';
  try {
    await claimUsername(authUser.uid, name);
    authUsername = name;
    profile.username = name;
    updateStartAuthUI();
    advanceOnboarding();   // -> customize
  } catch (e) {
    if (e && e.code === 'taken') nameScreenPrompt.textContent = '> NAME TAKEN — TRY ANOTHER <';
    else if (e && e.code === 'invalid') nameScreenPrompt.textContent = '> 3-20 LETTERS & NUMBERS ONLY <';
    else nameScreenPrompt.textContent = '> SAVE FAILED — RETRY <';
  }
}

function updateStartAuthUI() {
  // Compact chip: show the username (signed in) or "Sign In" (signed out). The
  // sign-out action lives in a dropdown that the chip toggles (wired below).
  const nameEl = document.getElementById('account-name');
  const caret = document.querySelector('#account-chip .account-caret');
  const chip = document.getElementById('account-chip');
  const menu = document.getElementById('account-menu');
  if (nameEl) nameEl.textContent = authUser ? (authUsername || 'Account') : 'Sign In';
  if (caret) caret.style.display = authUser ? '' : 'none';
  if (chip) {
    chip.setAttribute('aria-haspopup', authUser ? 'true' : 'false');
    chip.setAttribute('aria-expanded', 'false');
    chip.title = authUser ? (authUsername || 'Account') : 'Sign in';
  }
  if (menu) menu.hidden = true;   // collapse the dropdown on any auth-state change
}

// ENTER on the start screen: sign-in is optional. If signed in without a username yet, pick one
// (so scores can post); otherwise just start playing (as a guest if not signed in).
function handleStartEnter() {
  if (computeStep() !== 'done') { refreshOnboarding(); return; }
  hideInfoScreen();
  hideLeaderboard();
  startGame();
}

function confirmName() {
  nameScreenPrompt.textContent = '> PRESS ENTER TO CONFIRM <';
}

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmUsername();
  } else if (e.key === 'Escape') {
    e.preventDefault();   // forced onboarding: the username step can't be skipped
  } else {
    confirmName();
  }
});

showStartScreen();
applyGraphics();

function formatStopwatch(milliseconds) {
  const totalCentiseconds = Math.floor(milliseconds / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function stopwatchStartPressed() {
  return keyboard.pressing('w') ||
    keyboard.pressing('a') ||
    keyboard.pressing('s') ||
    keyboard.pressing('d') ||
    keyboard.pressing('up') ||
    keyboard.pressing('down') ||
    keyboard.pressing('left') ||
    keyboard.pressing('right');
}

function startStopwatch() {
  stopwatchStartTime = performance.now();
  stopwatchRunning = true;
}

function stopStopwatch() {
  if (!stopwatchRunning) return;

  stopwatchElapsedMs = performance.now() - stopwatchStartTime;
  stopwatchRunning = false;
  stopwatchFinished = true;
  stopwatchElement.textContent = formatStopwatch(stopwatchElapsedMs);
}

const KILL_BONUS = { mage: 50, bat: 25, slug: 10 };

function scoreForTime(milliseconds) {
  const seconds = milliseconds / 1000;

  if (seconds < 40)       return 1000;
  else if (seconds < 50)  return 700;
  else if (seconds < 60)  return 500;
  else if (seconds < 90)  return 400;
  else if (seconds < 120) return 200;
  else                     return 100;
}

function getBestScore() {
  return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
}

function getBestTime() {
  const storedTime = Number(localStorage.getItem(BEST_TIME_KEY));
  return Number.isFinite(storedTime) && storedTime > 0 ? storedTime : null;
}

function updatePersonalRecords(score, time) {
  const bestScore = getBestScore();
  const bestTime = getBestTime();

  try {
    if (score > bestScore) localStorage.setItem(BEST_SCORE_KEY, String(score));
    if (bestTime === null || time < bestTime) localStorage.setItem(BEST_TIME_KEY, String(time));
  } catch (e) { /* storage full/blocked — records just won't persist this run */ }
}

function formatBestTime(time) {
  return time === null ? '--:--.--' : formatStopwatch(time);
}

function showStartScreen() {
  startScreen.style.display = 'flex';
  startBestScoreEl.innerHTML = `Best Score: <span>${getBestScore()}</span>`;
  startBestTimeEl.innerHTML = `Best Time: <span>${formatBestTime(getBestTime())}</span>`;
  startTimeEl.textContent = runsCompleted > 0
    ? `Last Time: ${formatStopwatch(stopwatchElapsedMs)}`
    : 'Last Time: --:--.--';
}

function hideStartScreen() {
  startScreen.style.display = 'none';
}

function getLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addLeaderboardEntry(name, score, time) {
  const entries = getLeaderboard();
  entries.push({ name, score, time });
  entries.sort((a, b) => b.score - a.score || a.time - b.time);
  if (entries.length > 100) entries.length = 100;
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries)); } catch (e) { /* storage full/blocked */ }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderLeaderboard() {
  leaderboardEntries.innerHTML = '';
  leaderboardEmpty.textContent = 'Loading…';
  leaderboardEmpty.style.display = 'block';
  let rows = [];
  try {
    rows = await fetchTopScores(20);
  } catch (e) {
    leaderboardEmpty.textContent = 'Failed to load leaderboard';
    return;
  }
  if (rows.length === 0) {
    leaderboardEmpty.textContent = 'No runs yet';
    return;
  }
  leaderboardEmpty.style.display = 'none';
  rows.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'lb-entry' + (i < 3 ? ' lb-top' : '');
    div.innerHTML = `
      <span class="lb-rank">${i + 1}.</span>
      <span class="lb-name">${escapeHtml(e.username || '???')}</span>
      <span class="lb-score">${e.score}</span>
      <span class="lb-time">${formatStopwatch(e.timeMs || 0)}</span>
    `;
    leaderboardEntries.appendChild(div);
  });
}

function showLeaderboard() {
  hideInfoScreen();
  leaderboardScreen.style.display = 'flex';
  renderLeaderboard();
}

function hideLeaderboard() {
  leaderboardScreen.style.display = 'none';
}

function toggleLeaderboard() {
  if (leaderboardScreen.style.display === 'flex') {
    hideLeaderboard();
  } else {
    showLeaderboard();
  }
}

function buildKillBreakdown(kills) {
  let killLines = [];
  let killTotal = 0;
  for (const [type, bonus] of Object.entries(KILL_BONUS)) {
    const count = kills[type] || 0;
    if (count > 0) {
      killLines.push(`${type} x${count} = ${count * bonus}`);
      killTotal += count * bonus;
    }
  }
  return { killLines, killTotal };
}

const levelCompleteHeading = document.querySelector('#level-complete-screen h1');

function showLevelCompleteScreen() {
  bgMusic.pause();
  runsCompleted++;
  const timeScore = scoreForTime(stopwatchElapsedMs);
  const { killLines, killTotal } = buildKillBreakdown(player.kills);

  const totalScore = timeScore + killTotal;
  updatePersonalRecords(totalScore, stopwatchElapsedMs);
  if (authUser && authUsername) submitScore(authUser.uid, authUsername, totalScore, stopwatchElapsedMs).catch(() => {});

  levelCompleteHeading.textContent = 'Level Complete!';
  levelCompleteHeading.style.color = '#f1c40f';
  levelCompleteRecords.style.display = '';
  const lcRestart = document.getElementById('level-complete-restart');
  if (lcRestart) lcRestart.style.display = '';
  levelCompleteScore.textContent = `Score: ${totalScore}`;
  levelCompleteTime.textContent = `Time: ${formatStopwatch(stopwatchElapsedMs)} (${timeScore} pts)`;

  const stars = computeStars(stopwatchElapsedMs, parMs, gemsCollected(), gemsTotal());
  const starsEl = document.getElementById('level-complete-stars');
  if (starsEl) starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

  const breakdownEl = document.getElementById('level-complete-breakdown');
  const gemTxt = gemsTotal() > 0 ? ` · Gems: ${gemsCollected()}/${gemsTotal()}` : '';
  breakdownEl.textContent = (killLines.length > 0 ? `Kills: ${killLines.join(' | ')}` : 'Kills: none') + gemTxt;
  breakdownEl.style.display = 'block';

  levelCompleteRecords.textContent = `Best Score: ${getBestScore()} | Best Time: ${formatBestTime(getBestTime())}`;
  levelCompleteScreen.style.display = 'flex';
}

function showDNFScreen() {
  bgMusic.pause();
  runsCompleted++;
  const { killLines, killTotal } = buildKillBreakdown(player.kills);
  if (authUser && authUsername) submitScore(authUser.uid, authUsername, killTotal, stopwatchElapsedMs).catch(() => {});

  levelCompleteHeading.textContent = 'Game Over';
  levelCompleteHeading.style.color = '#e74c3c';
  const dnfStars = document.getElementById('level-complete-stars');
  if (dnfStars) dnfStars.textContent = '';
  levelCompleteRecords.style.display = '';
  const dnfRestart = document.getElementById('level-complete-restart');
  if (dnfRestart) dnfRestart.style.display = '';
  levelCompleteScore.textContent = `Score: ${killTotal}`;
  levelCompleteTime.textContent = 'Time: DNF';

  const breakdownEl = document.getElementById('level-complete-breakdown');
  breakdownEl.textContent = killLines.length > 0 ? `Kills: ${killLines.join(' | ')}` : 'Kills: none';
  breakdownEl.style.display = 'block';

  levelCompleteRecords.textContent = `Best Score: ${getBestScore()} | Best Time: ${formatBestTime(getBestTime())}`;
  levelCompleteScreen.style.display = 'flex';
}

function hideLevelCompleteScreen() {
  levelCompleteScreen.style.display = 'none';
}

const infoScreen = document.getElementById('info-screen');

function toggleInfoScreen() {
  hideLeaderboard();
  infoScreen.style.display = infoScreen.style.display === 'flex' ? 'none' : 'flex';
}

function hideInfoScreen() {
  infoScreen.style.display = 'none';
}

function resetStopwatch() {
  stopwatchStartTime = null;
  stopwatchElapsedMs = 0;
  stopwatchRunning = false;
  stopwatchFinished = false;
  stopwatchElement.textContent = formatStopwatch(stopwatchElapsedMs);
}

function resetActiveWorld() {
  player.reset();
  // Rebind the player's ground detection to the active world — without this the
  // tutorial player checks for ground against the main level's far-away platforms,
  // so it never registers as grounded (can't jump, floaty air movement).
  player.groundGroup = activeLevel.platforms;

  // Entering gameplay is always unpaused, no matter how the onboarding modals balanced.
  _pauseDepth = 0;
  _pauseStartedAt = null;
  if (typeof world !== 'undefined') world.timeScale = 1;

  camera.x = activeLevel.spawnX + 10;
  camera.y = activeLevel.spawnY + 10;

  for (const enemy of activeEnemies) {
    enemy.reset();
  }
  setupEnemyOverlaps(activeEnemies);

  activeLevel.reset();
  resetGems();          // re-show all collectibles for the active world

  resetStopwatch();
}

function playerTouchesDoor() {
  if (!activeLevel || !activeLevel.door) return false;
  const playerLeft = player.sprite.x - player.sprite.w / 2;
  const playerRight = player.sprite.x + player.sprite.w / 2;
  const playerTop = player.sprite.y - player.sprite.h / 2;
  const playerBottom = player.sprite.y + player.sprite.h / 2;
  const doorLeft = activeLevel.door.x - activeLevel.door.w / 2;
  const doorRight = activeLevel.door.x + activeLevel.door.w / 2;
  const doorTop = activeLevel.door.y - activeLevel.door.h / 2;
  const doorBottom = activeLevel.door.y + activeLevel.door.h / 2;

  return playerRight >= doorLeft &&
    playerLeft <= doorRight &&
    playerBottom >= doorTop &&
    playerTop <= doorBottom;
}

function drawKnightPreview() {
  if (!customizePreview) return;
  const ctx = customizePreview.getContext('2d');
  const W = customizePreview.width, H = customizePreview.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  const ani = player.sprite.anis.MaskedMCIdle;
  if (!ani || !ani.spriteSheet || !ani.spriteSheet.canvas) return;
  const fr = ani[0];
  if (!fr) return;
  const s = Math.max(2, Math.floor(Math.min(W, H) / fr.w) - 1);
  const dw = fr.w * s, dh = fr.h * s;
  const dx = Math.round((W - dw) / 2), dy = Math.round((H - dh) / 2);
  ctx.drawImage(ani.spriteSheet.canvas, fr.x, fr.y, fr.w, fr.h, dx, dy, dw, dh);
}

q5.update = function () {
  const paused = isSettingsOpen() || isCustomizeOpen() || isAuthOpen() || isPauseOpen() || isEditorOpen() || isBrowserOpen();

  // In the editor, suppress the live game sprites so only the grid/preview shows.
  if (typeof allSprites !== 'undefined') allSprites.autoDraw = (mode !== 'editor');

  // Apply the saved knight colors once the sprite sheets have finished loading.
  if (!skinApplied) skinApplied = player.applySkin();
  if (isCustomizeOpen()) drawKnightPreview();

  // Debug toggle
  if (!paused && keyboard.presses('~')) {
    debugMode = !debugMode;
    allSprites.debug = debugMode;
  }

  // Open settings from anywhere with the keyboard (gear click still works too).
  if (!paused && keyboard.presses('o')) openSettings();

  // Esc opens the in-game Settings/pause menu — handled inside settings.js so Esc has a single
  // owner (no q5-loop race). During a custom playtest, 'M' toggles moving-platform motion live.
  if (playingCustom && mode === 'play' && !levelComplete && !paused && keyboard.presses('m')) {
    platformsFrozen = !platformsFrozen;
    if (platformsFrozen && activeLevel && activeLevel.freeze) activeLevel.freeze();
  }

  if (!paused && !gameStarted && nameScreen.style.display !== 'flex') {
    if (keyboard.presses('enter')) handleStartEnter();
    if (keyboard.presses('i')) toggleInfoScreen();
    if (keyboard.presses('l')) toggleLeaderboard();
    // Customize / re-auth shortcuts only once onboarding is finished.
    if (computeStep() === 'done') {
      if (keyboard.presses('c')) openCustomize();
      if (keyboard.presses('s')) { hideInfoScreen(); hideLeaderboard(); openAuth(); }
    }
  }

  if (!paused && gameStarted && mode === 'play' && !levelComplete && !stopwatchRunning && !stopwatchFinished && stopwatchStartPressed()) {
    startStopwatch();
  }

  if (!paused && stopwatchRunning && !levelComplete) {
    stopwatchElapsedMs = performance.now() - stopwatchStartTime;
  }

  stopwatchElement.textContent = formatStopwatch(stopwatchElapsedMs);

  background('#000000');

  if (prefs.graphics !== 'low' && bgImage && bgImage.width > 0 && bgImage.height > 0) {
    const scale = Math.max(height / bgImage.height, width / bgImage.width) * 1.2;
    const scaledW = bgImage.width * scale;
    const scaledH = bgImage.height * scale;

    const bgBaseX = -camera.x * PARALLAX_X;
    const bgBaseY = -camera.y * PARALLAX_Y;

    const viewLeft  = camera.x - width / 2;
    const viewRight = camera.x + width / 2;
    const viewTop   = camera.y - height / 2;
    const viewBottom = camera.y + height / 2;

    const startCol = Math.floor((viewLeft - bgBaseX) / scaledW);
    const endCol   = Math.ceil((viewRight - bgBaseX) / scaledW);
    const startRow = Math.floor((viewTop - bgBaseY) / scaledH);
    const endRow   = Math.ceil((viewBottom - bgBaseY) / scaledH);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        image(bgImage, bgBaseX + c * scaledW, bgBaseY + r * scaledH, scaledW, scaledH);
      }
    }
  }

  // Map editor runs its own update/draw (no player physics) while open.
  if (mode === 'editor') {
    updateEditor();
    drawEditor();
  }

  if (!paused && gameStarted && !levelComplete) {
    player.update(activeEnemies);
    if (player._respawnReady) {
      player._respawnReady = false;
      if (mode === 'tutorial') {
        enterTutorial();              // forgiving: restart the tutorial on death
      } else if (playingCustom) {
        levelComplete = true;
        showCustomComplete(false);
      } else {
        levelComplete = true;
        showDNFScreen();
      }
    } else if (!player.isDying) {
      if (!platformsFrozen) activeLevel.update();
      else if (activeLevel.freeze) activeLevel.freeze();   // hold moving platforms during a frozen playtest
      if (player._enemiesFrozen) {
        unfreezeEnemies(activeEnemies);
        player._enemiesFrozen = false;
      }
      for (const enemy of activeEnemies) {
        if (enemy.sprite.deleted) continue;
        if (enemy.isDying) { enemy.updateDeath(); continue; }
        if (enemy instanceof Mage || enemy instanceof Bat) enemy.update(player);
        else enemy.update();
      }
      if (mode === 'tutorial') updateTutorialHints(player);
      if (mode === 'play') updateGems(player);
    } else if (!player._enemiesFrozen) {
      freezeEnemies(activeEnemies);
      activeLevel.freeze();
      player._enemiesFrozen = true;
    }

    activeLevel.updateSpikes();

    // Door check
    if (!player.flyMode && playerTouchesDoor()) {
      if (mode === 'tutorial') {
        finishTutorial();
      } else if (playingCustom) {
        stopStopwatch();
        levelComplete = true;
        showCustomComplete(true);
      } else {
        stopStopwatch();
        levelComplete = true;
        showLevelCompleteScreen();
      }
    }
  }

  // Reset
  if (!paused && gameStarted && actionPressed('restart')) {
    if (mode === 'tutorial') {
      enterTutorial();
    } else if (playingCustom) {
      if (levelComplete) exitCustom();   // back to editor / gallery / menu
      else resetActiveWorld();           // re-play the custom map from the start
    } else if (levelComplete) {
      levelComplete = false;
      gameStarted = false;
      mode = 'menu';
      hideLevelCompleteScreen();
      showStartScreen();
      resetActiveWorld();
    } else if (stopwatchRunning || stopwatchFinished) {
      levelComplete = true;
      showDNFScreen();
    } else {
      resetActiveWorld();
    }
  }

  // Apply screen-shake / hit-stop once the camera is positioned for this frame.
  updateJuice(camera);

  // Hide the cursor and reveal on-screen controls only during active play.
  document.body.classList.toggle('playing', gameStarted && !paused && !levelComplete);

  // HUD
  document.getElementById('hud-fly').style.display   = player.flyMode ? 'block' : 'none';
  document.getElementById('hud-debug').style.display = debugMode      ? 'block' : 'none';

  if (fpsCounter) {
    if (prefs.showFps) {
      fpsCounter.style.display = 'block';
      const fr = (typeof frameRate === 'function') ? frameRate() : 0;
      fpsCounter.textContent = Math.round(fr) + ' FPS';
    } else {
      fpsCounter.style.display = 'none';
    }
  }
};

// Re-apply the knight's colors whenever customization changes (live from the Customize screen).
onCustomizationChange(() => player.applySkin());

// Pause the simulation and the stopwatch while a menu overlay (settings or customize) is open.
let _pauseStartedAt = null;
let _pauseDepth = 0;
function pauseGame() {
  _pauseDepth++;
  if (_pauseDepth === 1) {
    if (typeof world !== 'undefined') world.timeScale = 0;
    _pauseStartedAt = performance.now();
  }
}
function resumeGame() {
  _pauseDepth = Math.max(0, _pauseDepth - 1);
  if (_pauseDepth === 0) {
    if (typeof world !== 'undefined') world.timeScale = 1;
    if (_pauseStartedAt != null && stopwatchStartTime != null) {
      stopwatchStartTime += performance.now() - _pauseStartedAt;
    }
    _pauseStartedAt = null;
  }
}
initSettings({ onOpen: pauseGame, onClose: resumeGame });
initSettingsInGame({
  isInGame:  () => gameStarted && mode === 'play' && !levelComplete,
  onResume:  () => {},                          // closeSettings already resumed via onClose
  onRestart: () => { resetActiveWorld(); },
  onQuit:    () => { quitToMenu(); },
});
initCustomize({ onOpen: pauseGame, onClose: () => { resumeGame(); onCustomizeClosed(); } });
initAuth({ onOpen: pauseGame, onClose: resumeGame });
initPause({
  onResume:  () => { resumeGame(); },
  onRestart: () => { resumeGame(); resetActiveWorld(); },
  onQuit:    () => { resumeGame(); quitToMenu(); },
});
initEditor({
  onPlaytest: (map, opts) => { customReturn = 'editor'; enterCustom(map, opts); },
  onClose:    () => { closeEditor(); mode = 'menu'; showStartScreen(); },
  onPublish:  (map, title) => {
    if (authUser && authUsername) publishMap(authUser.uid, authUsername, title, serialize(map)).catch(() => {});
  },
});
initBrowser({
  onPlay:  (mapObj) => { customReturn = 'browse'; enterCustom(mapObj); },
  onClose: () => { showStartScreen(); },
});
initSwordCursor();   // custom sword cursor (follows mouse, swings on click, hidden during active play)

// --- Forced first-run onboarding: login -> username -> customize -> tutorial -> level 1 ---

// The current gate is DERIVED from the account each time, so steps only show while unmet
// and returning players (even on a new device) skip whatever they've already finished.
function computeStep() {
  if (!authUser) return 'auth';
  if (!authUsername) return 'username';
  if (!profile.customizeDone) return 'customize';
  if (!profile.tutorialDone) return 'tutorial';
  return 'done';
}

function showOnboardingStep(step) {
  onboardingStep = step;
  // Only the auth step shows (and forces) the auth modal; keep overlays consistent.
  if (step !== 'auth' && isAuthOpen()) closeAuth();
  setAuthForced(step === 'auth');

  if (step === 'auth') {
    hideNameScreen();
    if (isCustomizeOpen()) closeCustomize();
    if (!isAuthOpen()) openAuth();
  } else if (step === 'username') {
    showNameScreen();
    nameScreenPrompt.textContent = '> CHOOSE A USERNAME <';
  } else if (step === 'customize') {
    hideNameScreen();
    setCustomizeContinueMode(true);
    if (!isCustomizeOpen()) openCustomize();
  } else if (step === 'tutorial') {
    if (isCustomizeOpen()) closeCustomize();
    setCustomizeContinueMode(false);
    enterTutorial();
  } else { // done
    setCustomizeContinueMode(false);
    hideNameScreen();
    showStartScreen();
  }
}

// Re-evaluate the gate. No-op while actually in the tutorial or a real run.
function refreshOnboarding() {
  if (mode === 'tutorial' || mode === 'play') return;
  showOnboardingStep(computeStep());
}
function advanceOnboarding() { showOnboardingStep(computeStep()); }

function applyAccountColors(c) {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  if (!c) return;
  if (HEX.test(c.bodyColor)) setBodyColor(c.bodyColor);
  if (HEX.test(c.headColor)) setHeadColor(c.headColor);
  if (HEX.test(c.swordColor)) setSwordColor(c.swordColor);
}

// Finishing the Customize step: persist colors + flag to the account, then advance.
function onCustomizeClosed() {
  if (!gameStarted && authUser && authUsername && !profile.customizeDone && onboardingStep === 'customize') {
    profile.customizeDone = true;
    const colors = { bodyColor: customization.bodyColor, headColor: customization.headColor, swordColor: customization.swordColor };
    saveCustomizationToAccount(authUser.uid, colors).catch(() => {});
    setOnboardingFlag(authUser.uid, 'customizeDone', true).catch(() => {});
    advanceOnboarding();   // -> tutorial
  }
}

function enterTutorial() {
  if (!tutorialWorld) {
    tutorialWorld = buildTutorialLevel(height);
    tutorialEnemies = tutorialWorld.enemySpawns.map(
      (s) => new Slug(s.x, s.y, s.left, s.right, tutorialWorld.platforms)
    );
  }
  mode = 'tutorial';
  gameStarted = true;
  levelComplete = false;
  activeLevel = tutorialWorld;
  activeEnemies = tutorialEnemies;
  player.spawnX = tutorialWorld.spawnX;
  player.spawnY = tutorialWorld.spawnY;
  hideStartScreen();
  hideNameScreen();
  hideInfoScreen();
  hideLeaderboard();
  resetActiveWorld();
  resetTutorialHints();
  showTutorialHint();
  bgMusic.currentTime = 0;
  bgMusic.play().catch(() => {});
}

function finishTutorial() {
  hideTutorialHint();
  bgMusic.pause();
  mode = 'menu';
  gameStarted = false;
  levelComplete = false;
  profile.tutorialDone = true;
  if (authUser) setOnboardingFlag(authUser.uid, 'tutorialDone', true).catch(() => {});
  advanceOnboarding();   // -> done -> start screen
}

// --- Map editor + custom-map play + gallery ---------------------------------

function openEditorMode() {
  if (computeStep() !== 'done') { refreshOnboarding(); return; }
  mode = 'editor';
  gameStarted = false;
  levelComplete = false;
  bgMusic.pause();
  clearGems();          // no stray gems from a prior run while editing
  hideStartScreen(); hideInfoScreen(); hideLeaderboard(); hideLevelCompleteScreen();
  openEditor();
}

function teardownCustom() {
  platformsFrozen = false;      // never let a frozen playtest leak into the shared main level
  if (customWorld && customWorld.destroy) { try { customWorld.destroy(); } catch (e) {} }
  for (const e of customEnemies) { if (e.sprite && !e.sprite.deleted) e.sprite.delete(); }
  customWorld = null;
  customEnemies = [];
  clearGems();
  activeLevel = level;          // restore the main-world refs so the menu/main level are coherent
  activeEnemies = enemies;
  player.groundGroup = level.platforms;
}

// Build a user-made world and start playing it (clone of enterTutorial for custom maps).
function enterCustom(map, opts = {}) {
  teardownCustom();             // drop any prior custom world first (worlds share one physics world)
  customWorld = buildCustomLevel(map);
  customEnemies = (customWorld.enemySpawns || []).map((s) => {
    if (s.type === 'mage') return new Mage(s.x, s.y, s.patrolLeft, s.patrolRight, customWorld.platforms);
    if (s.type === 'bat')  return new Bat(s.x, s.y, s.patrolRadius, customWorld.platforms);
    return new Slug(s.x, s.y, s.patrolLeft, s.patrolRight, customWorld.platforms);
  });
  customMap = map;
  playingCustom = true;
  platformsFrozen = !!opts.freezePlatforms;   // editor test-play may request platforms start frozen
  mode = 'play';
  gameStarted = true;
  levelComplete = false;
  activeLevel = customWorld;
  activeEnemies = customEnemies;
  player.spawnX = customWorld.spawnX;
  player.spawnY = customWorld.spawnY;
  buildGems(customWorld.gems || []);
  parMs = 60000;
  if (isEditorOpen()) closeEditor();
  if (isBrowserOpen()) closeBrowser();
  hideStartScreen(); hideNameScreen(); hideInfoScreen(); hideLeaderboard(); hideLevelCompleteScreen();
  resetActiveWorld();
  bgMusic.currentTime = 0; bgMusic.play().catch(() => {});
}

// Win/lose screen for a custom map (reuses #level-complete-screen + the stars element).
function showCustomComplete(won) {
  bgMusic.pause();
  levelCompleteHeading.textContent = won ? 'Map Complete!' : 'You Died';
  levelCompleteHeading.style.color = won ? '#f1c40f' : '#e74c3c';
  const starsEl = document.getElementById('level-complete-stars');
  if (won) {
    const stars = computeStars(stopwatchElapsedMs, parMs, gemsCollected(), gemsTotal());
    if (starsEl) starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    levelCompleteScore.textContent = `Gems: ${gemsCollected()} / ${gemsTotal()}`;
    levelCompleteTime.textContent = `Time: ${formatStopwatch(stopwatchElapsedMs)}`;
  } else {
    if (starsEl) starsEl.textContent = '';
    levelCompleteScore.textContent = `Gems: ${gemsCollected()} / ${gemsTotal()}`;
    levelCompleteTime.textContent = 'Time: DNF';
  }
  const breakdownEl = document.getElementById('level-complete-breakdown');
  breakdownEl.textContent = customReturn === 'editor' ? 'Press R to return to the editor'
    : customReturn === 'browse' ? 'Press R to return to the gallery' : 'Press R for the menu';
  breakdownEl.style.display = 'block';
  levelCompleteRecords.textContent = '';
  levelCompleteRecords.style.display = 'none';
  const customRestart = document.getElementById('level-complete-restart');
  if (customRestart) customRestart.style.display = 'none';   // breakdown line already gives the R hint
  levelCompleteScreen.style.display = 'flex';
}

// After a custom run ends and the player presses R: tear down and go back where they came from.
function exitCustom() {
  levelComplete = false;
  gameStarted = false;
  playingCustom = false;
  hideLevelCompleteScreen();
  const back = customReturn;
  const mapToEdit = customMap;
  teardownCustom();
  if (back === 'editor') {
    mode = 'editor';
    bgMusic.pause();
    hideStartScreen(); hideInfoScreen(); hideLeaderboard();
    openEditor(mapToEdit);            // editor is closed during play, so this reopens it with the map
  } else if (back === 'browse') {
    mode = 'menu';
    showStartScreen();
    openBrowser();
  } else {
    mode = 'menu';
    showStartScreen();
  }
}

function quitToMenu() {
  levelComplete = false;
  gameStarted = false;
  bgMusic.pause();
  hideLevelCompleteScreen();
  if (playingCustom) { playingCustom = false; teardownCustom(); }
  mode = 'menu';
  showStartScreen();
}

// Track Firebase auth state and (re)drive the onboarding gate on every change.
onAuthChange(async (user) => {
  authUser = user;
  authUsername = null;
  if (user) {
    try {
      const p = await getUserProfile(user.uid);
      p._uid = user.uid;
      profile = p;
    } catch (e) {
      // Transient profile-fetch failure (e.g. a token-refresh auth event during a network blip):
      // keep the last-known profile for THIS user instead of wiping it and bouncing an already-
      // onboarded player back to the username screen. Only reset if we have no profile for this uid.
      if (!profile || profile._uid !== user.uid) {
        profile = { username: null, customizeDone: false, tutorialDone: false, customization: null };
      }
    }
    authUsername = profile.username;
    applyAccountColors(profile.customization);
  } else {
    profile = { username: null, customizeDone: false, tutorialDone: false, customization: null };
  }
  updateStartAuthUI();
  setCurrentUser(user ? user.uid : null, authUsername);   // gallery write actions (like/comment)
  refreshOnboarding();
});



// Menu shortcut buttons (start screen). Each mirrors its keyboard key.
const MENU_ACTIONS = {
  start:       () => { if (!gameStarted) handleStartEnter(); },
  settings:    () => openSettings(),
  info:        () => { if (!gameStarted) toggleInfoScreen(); },
  leaderboard: () => { if (!gameStarted) toggleLeaderboard(); },
  customize:   () => { if (!gameStarted && computeStep() === 'done') openCustomize(); },
  signin:      () => { if (!gameStarted && computeStep() === 'done') { hideInfoScreen(); hideLeaderboard(); openAuth(); } },
  signout:     () => { if (!gameStarted) signOutUser().catch(() => {}); },
  editor:      () => { if (!gameStarted && computeStep() === 'done') openEditorMode(); },
  browse:      () => { if (!gameStarted && computeStep() === 'done') { hideInfoScreen(); hideLeaderboard(); openBrowser(); } },
};
for (const el of document.querySelectorAll('[data-menu-action]')) {
  el.addEventListener('click', () => {
    const fn = MENU_ACTIONS[el.dataset.menuAction];
    if (fn) fn();
  });
}

// Account chip: a compact username button that toggles a sign-out dropdown when
// signed in, and opens sign-in directly when signed out.
(() => {
  const chip = document.getElementById('account-chip');
  const menu = document.getElementById('account-menu');
  const wrap = document.getElementById('start-account');
  if (!chip || !menu) return;
  const close = () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); };
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!authUser) { MENU_ACTIONS.signin(); return; }   // signed out -> open sign-in
    const show = menu.hidden;
    menu.hidden = !show;
    chip.setAttribute('aria-expanded', String(show));
  });
  menu.addEventListener('click', close);                 // picking an action closes the menu
  document.addEventListener('click', (e) => {            // click-away closes the menu
    if (!menu.hidden && wrap && !wrap.contains(e.target)) close();
  });
})();

// Back buttons for the screens managed here.
document.getElementById('info-back').addEventListener('click', hideInfoScreen);
document.getElementById('leaderboard-back').addEventListener('click', hideLeaderboard);
