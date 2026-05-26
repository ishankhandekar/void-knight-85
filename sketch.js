import { Player } from './player.js';
import { Slug } from './slug.js';
import { Mage } from './mage.js';
import { buildLevel } from './level.js';

let bgImage;
let gameStarted = false;
let levelComplete = false;
let debugMode = false;
let stopwatchStartTime = null;
let stopwatchElapsedMs = 0;
let stopwatchRunning = false;
let stopwatchFinished = false;

await Canvas();
displayMode(NORMAL, PIXELATED);
await loadImage('Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png', (img) => {
  bgImage = img;
});

world.gravity.y = 20;

const level = buildLevel(height);
const player = new Player(level.spawnX, level.spawnY, level.platforms);

//Start the camera on the player immediately
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
// Enemies: patrol(x, y, leftBound, rightBound, platforms)
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
];

// Use q5play's overlap system (same as spikes/jump pads) so physics separation
// doesn't prevent detection. overlaps() fires without resolving collision physics.
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
const levelCompleteScreen = document.getElementById('level-complete-screen');
const levelCompleteScore = document.getElementById('level-complete-score');
const levelCompleteTime = document.getElementById('level-complete-time');
const levelCompleteRecords = document.getElementById('level-complete-records');
const BEST_SCORE_KEY = 'retroRewindBestScore';
const BEST_TIME_KEY = 'retroRewindBestTime';

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
    keyboard.pressing('right') ||
    keyboard.presses('`');
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

function scoreForTime(milliseconds) {
  const seconds = milliseconds / 1000;

  if (seconds < 15) {
    return 500;
  } else if (seconds < 35) {
    return 400;
  } else if (seconds < 45) {
    return 300;
  } else {
    return 200;
  }
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
}

function hideStartScreen() {
  startScreen.style.display = 'none';
}

function showLevelCompleteScreen() {
  const score = scoreForTime(stopwatchElapsedMs);

  updatePersonalRecords(score, stopwatchElapsedMs);

  levelCompleteScore.textContent = `Score: ${score}`;
  levelCompleteTime.textContent = `Time: ${formatStopwatch(stopwatchElapsedMs)}`;
  levelCompleteRecords.textContent = `Best Score: ${getBestScore()} | Best Time: ${formatBestTime(getBestTime())}`;
  levelCompleteScreen.style.display = 'flex';
}

function hideLevelCompleteScreen() {
  levelCompleteScreen.style.display = 'none';
}

function resetStopwatch() {
  stopwatchStartTime = null;
  stopwatchElapsedMs = 0;
  stopwatchRunning = false;
  stopwatchFinished = false;
  stopwatchElement.textContent = formatStopwatch(stopwatchElapsedMs);
}

function resetLevel() {
  // Reset player to exact spawn position and clear all movement/animation state
  player.reset();

  // Reset camera to spawn immediately (no lerp lag)
  camera.x = level.spawnX + 10;
  camera.y = level.spawnY + 10;

  // Reset all enemies — restores killed ones and repositions live ones
  for (const enemy of enemies) {
    enemy.reset();
  }
  // Re-register overlap callbacks because enemy sprites were recreated
  setupEnemyOverlaps();

  // Reset moving platforms to their exact start positions
  level.reset();

  // Reset stopwatch
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
  // Toggle collision debug with ~ (shift+backtick)
  if (keyboard.presses('~')) {
    debugMode = !debugMode;
    allSprites.debug = debugMode;
  }

  if (!gameStarted && keyboard.presses('enter')) {
    gameStarted = true;
    hideStartScreen();
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
      resetLevel();
    } else if (!player.isDying) {
      level.update();
      if (player._enemiesFrozen) {
        unfreezeEnemies(enemies);
        player._enemiesFrozen = false;
      }
      for (const enemy of enemies) {
        if (enemy instanceof Mage) enemy.update(player);
        else enemy.update();
      }
    } else if (!player._enemiesFrozen) {
      freezeEnemies(enemies);
      level.freeze();
      player._enemiesFrozen = true;
    }

    level.updateSpikes();

    // Check if player reached the door
    if (!player.flyMode && playerTouchesDoor()) {
      stopStopwatch();
      levelComplete = true;
      showLevelCompleteScreen();
    }
  }

  // Press R at any time to reset the level to the exact starting position
  if (gameStarted && keyboard.presses('r')) {
    if (levelComplete) {
      // From end screen: go back to start screen
      levelComplete = false;
      gameStarted = false;
      hideLevelCompleteScreen();
      showStartScreen();
    }
    resetLevel();
  }

  // Sync debug HUD tags in the HTML overlay
  document.getElementById('hud-fly').style.display   = player.flyMode ? 'block' : 'none';
  document.getElementById('hud-debug').style.display = debugMode      ? 'block' : 'none';
};
