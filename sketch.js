import { Player } from './player.js';
import { buildLevel } from './level.js';

let bgImage;
let levelComplete = false;

await Canvas();
displayMode(NORMAL, PIXELATED);
await loadImage('Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png', (img) => {
  bgImage = img;
});

world.gravity.y = 20;

/*const level = buildLevel(height);
const player = new Player(level.spawnX, level.spawnY, level.platforms);*/

const level = buildLevel(height);
const player = new Player(level.spawnX, level.spawnY, level.platforms);

//Start the camera on the player immediately
camera.x = level.spawnX + 10;
camera.y = level.spawnY + 10;

const PARALLAX_X = 0.05;
const PARALLAX_Y = 0.03;

q5.update = function () {
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

  if (!levelComplete) {
    player.update();

    // Check if player reached the door
    const dx = player.sprite.x - level.door.x;
    const dy = player.sprite.y - level.door.y;
    if (Math.abs(dx) < 25 && Math.abs(dy) < 30) {
      levelComplete = true;
    }
  }

  // Level complete overlay
  if (levelComplete) {
    push();
    fill(0, 0, 0, 160);
    rectMode(CORNER);
    rect(camera.x - width / 2, camera.y - height / 2, width, height);

    textAlign(CENTER, CENTER);
    textSize(48);
    fill('#f1c40f');
    text('Level Complete!', camera.x, camera.y - 30);

    textSize(18);
    fill('#ecf0f1');
    text('Press R to restart', camera.x, camera.y + 30);
    pop();

    if (keyboard.presses('r')) {
      levelComplete = false;
      player.sprite.x = level.spawnX;
      player.sprite.y = level.spawnY;
      player.sprite.vel.x = 0;
      player.sprite.vel.y = 0;
    }
  }
};
