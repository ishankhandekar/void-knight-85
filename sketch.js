import { Player } from './player.js';
import { buildLevel } from './level.js';

await Canvas();
world.gravity.y = 16;

const platformGroup = buildLevel();
const player = new Player(0, 325, platformGroup);

q5.update = function () {
  background('#1a1a2e');

  player.update();
};
