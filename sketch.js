import { Player } from './player.js';
import { Slug } from './slug.js';
import { Mage } from './mage.js';
import { Bat } from './bat.js';
import { buildLevel } from './level.js';

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

await Canvas();
displayMode(NORMAL, PIXELATED);
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
    if (enemy.sprite.deleted) continue;
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
    if (enemy.sprite.deleted) continue;
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

// Enemy-player overlap detection
function setupEnemyOverlaps() {
  for (const enemy of enemies) {
    enemy.sprite.overlaps(player.sprite, (enemySprite, playerSprite) => {
      if (player.isDying || player.flyMode || enemySprite.deleted) return;
      player.die();
      freezeEnemies(enemies);
    });
  }
}
setupEnemyOverlaps();

const PARALLAX_X = 0.05;
const PARALLAX_Y = 0.03;
const stopwatchElement = document.getElementById('stopwatch');
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
bgMusic.volume = 0.3;

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
  const name = nameInput.value.trim();
  if (!name) {
    nameScreenPrompt.textContent = '> NAME CANNOT BE EMPTY <';
    nameInput.focus();
    return;
  }
  playerName = name;
  gameStarted = true;
  hideNameScreen();
  resetLevel();
  bgMusic.currentTime = 0;
  bgMusic.play();
}

function confirmName() {
  nameScreenPrompt.textContent = '> PRESS ENTER TO CONFIRM <';
}

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    startGame();
  } else if (e.key === 'Escape') {
    hideNameScreen();
    showStartScreen();
  } else {
    confirmName();
  }
});

showStartScreen();

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

  if (score > bestScore) {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  }

  if (bestTime === null || time < bestTime) {
    localStorage.setItem(BEST_TIME_KEY, String(time));
  }
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
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
}

function renderLeaderboard() {
  const entries = getLeaderboard();
  leaderboardEntries.innerHTML = '';
  if (entries.length === 0) {
    leaderboardEmpty.style.display = 'block';
    return;
  }
  leaderboardEmpty.style.display = 'none';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const div = document.createElement('div');
    div.className = 'lb-entry' + (i < 3 ? ' lb-top' : '');
    div.innerHTML = `
      <span class="lb-rank">${i + 1}.</span>
      <span class="lb-name">${e.name || '???'}</span>
      <span class="lb-score">${e.score}</span>
      <span class="lb-time">${formatStopwatch(e.time)}</span>
    `;
    leaderboardEntries.appendChild(div);
  }
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
  addLeaderboardEntry(playerName, totalScore, stopwatchElapsedMs);

  levelCompleteHeading.textContent = 'Level Complete!';
  levelCompleteHeading.style.color = '#f1c40f';
  levelCompleteScore.textContent = `Score: ${totalScore}`;
  levelCompleteTime.textContent = `Time: ${formatStopwatch(stopwatchElapsedMs)} (${timeScore} pts)`;

  const breakdownEl = document.getElementById('level-complete-breakdown');
  breakdownEl.textContent = killLines.length > 0 ? `Kills: ${killLines.join(' | ')}` : 'Kills: none';
  breakdownEl.style.display = 'block';

  levelCompleteRecords.textContent = `Best Score: ${getBestScore()} | Best Time: ${formatBestTime(getBestTime())}`;
  levelCompleteScreen.style.display = 'flex';
}

function showDNFScreen() {
  bgMusic.pause();
  runsCompleted++;
  const { killLines, killTotal } = buildKillBreakdown(player.kills);
  addLeaderboardEntry(playerName, killTotal, stopwatchElapsedMs);

  levelCompleteHeading.textContent = 'Game Over';
  levelCompleteHeading.style.color = '#e74c3c';
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

function resetLevel() {
  player.reset();

  camera.x = level.spawnX + 10;
  camera.y = level.spawnY + 10;

  for (const enemy of enemies) {
    enemy.reset();
  }
  setupEnemyOverlaps();

  level.reset();

  resetStopwatch();
}

function playerTouchesDoor() {
  const playerLeft = player.sprite.x - player.sprite.w / 2;
  const playerRight = player.sprite.x + player.sprite.w / 2;
  const playerTop = player.sprite.y - player.sprite.h / 2;
  const playerBottom = player.sprite.y + player.sprite.h / 2;
  const doorLeft = level.door.x - level.door.w / 2;
  const doorRight = level.door.x + level.door.w / 2;
  const doorTop = level.door.y - level.door.h / 2;
  const doorBottom = level.door.y + level.door.h / 2;

  return playerRight >= doorLeft &&
    playerLeft <= doorRight &&
    playerBottom >= doorTop &&
    playerTop <= doorBottom;
}

q5.update = function () {
  // Debug toggle
  if (keyboard.presses('~')) {
    debugMode = !debugMode;
    allSprites.debug = debugMode;
  }

  if (!gameStarted) {
    if (nameScreen.style.display === 'flex') {
      if (keyboard.presses('escape')) {
        hideNameScreen();
        showStartScreen();
      }
    } else {
      if (keyboard.presses('enter')) {
        hideInfoScreen();
        hideLeaderboard();
        showNameScreen();
      }
    }
  }

  if (!gameStarted && !(nameScreen.style.display === 'flex')) {
    if (keyboard.presses('i')) toggleInfoScreen();
    if (keyboard.presses('l')) toggleLeaderboard();
  }

  if (gameStarted && !levelComplete && !stopwatchRunning && !stopwatchFinished && stopwatchStartPressed()) {
    startStopwatch();
  }

  if (stopwatchRunning && !levelComplete) {
    stopwatchElapsedMs = performance.now() - stopwatchStartTime;
  }

  stopwatchElement.textContent = formatStopwatch(stopwatchElapsedMs);

  background('#000000');

  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
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

  if (gameStarted && !levelComplete) {
    player.update(enemies);
    if (player._respawnReady) {
      player._respawnReady = false;
      levelComplete = true;
      showDNFScreen();
    } else if (!player.isDying) {
      level.update();
      if (player._enemiesFrozen) {
        unfreezeEnemies(enemies);
        player._enemiesFrozen = false;
      }
      for (const enemy of enemies) {
        if (enemy instanceof Mage || enemy instanceof Bat) enemy.update(player);
        else enemy.update();
      }
    } else if (!player._enemiesFrozen) {
      freezeEnemies(enemies);
      level.freeze();
      player._enemiesFrozen = true;
    }

    level.updateSpikes();

    // Door check
    if (!player.flyMode && playerTouchesDoor()) {
      stopStopwatch();
      levelComplete = true;
      showLevelCompleteScreen();
    }
  }

  // Reset
  if (gameStarted && keyboard.presses('r')) {
    if (levelComplete) {
      levelComplete = false;
      gameStarted = false;
      hideLevelCompleteScreen();
      showStartScreen();
      resetLevel();
    } else if (stopwatchRunning || stopwatchFinished) {
      levelComplete = true;
      showDNFScreen();
    } else {
      resetLevel();
    }
  }

  // HUD
  document.getElementById('hud-fly').style.display   = player.flyMode ? 'block' : 'none';
  document.getElementById('hud-debug').style.display = debugMode      ? 'block' : 'none';
};
