import { Player } from './player.js';
import { buildLevel } from './level.js';

let bgImage;

await Canvas();
await loadImage('Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png', (img) => {
  bgImage = img;
});

world.gravity.y = 20;

const platformGroup = buildLevel(height);
const player = new Player(0, height / 2 - 5, platformGroup);

const PARALLAX_X = 0.05;

q5.update = function () {
  background('#000000');

  // Lock camera to only follow the player on the X axis
  camera.y = height / 2;  // fixed vertical position (adjust if your ground isn't at y=0)

  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    const scale = height / bgImage.height;
    const scaledW = bgImage.width * scale;
    const scaledH = height;

    const bgBaseX = -camera.x * PARALLAX_X;

    // With camera.y locked, this is always 0 (top of screen)
    const bgY = camera.y - height / 2;

    const viewLeft  = camera.x - width / 2;
    const viewRight = camera.x + width / 2;
    const startTile = Math.floor((viewLeft - bgBaseX) / scaledW);
    const endTile   = Math.ceil((viewRight - bgBaseX) / scaledW);

    for (let i = startTile; i <= endTile; i++) {
      image(bgImage, bgBaseX + i * scaledW, bgY, scaledW, scaledH);
    }
  }

  player.update();
};
