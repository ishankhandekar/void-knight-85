import { Player } from './player.js';
import { buildLevel } from './level.js';

let bgImage;

await Canvas();
await loadImage('Images/crystal_cave_background_by_fellfeline_dektmf0-fullview-1.png.png', (img) => {
  bgImage = img;
});

world.gravity.y = 16;

const platformGroup = buildLevel();
const player = new Player(0, 325, platformGroup);

q5.update = function () {
  if (bgImage) {
    image(bgImage, 0, 0, width, height);
  } else {
    background('#1a1a2e');
  }

  player.update();
};
