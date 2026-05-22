export function buildLevel(canvasHeight) {
  const platformGroup = new Group();
  const slimeGroup = new Group();
  const jumpPadGroup = new Group();
  const spikeGroup = new Group();

  const BLOCK_SIZE = 40;
  const BLOCK_TEXTURES = {
    platform: 'Sprites/textures/platformtexture.png',
    wall: 'Sprites/textures/walltexture.png'
  };

  // Only affect the player, not platforms, hazards, or the door.
  function isPlayerTarget(sprite) {
    return sprite && sprite.rotationLock === true;
  }

  // =========================================================
  // REQUIRED FUNCTION #1
  // Creates one block at the given x and y position.
  // =========================================================
  function blocks(x, y, texture = 'platform') {
    const b = new platformGroup.Sprite(x, y, BLOCK_SIZE, BLOCK_SIZE);
    b.physics = STATIC;
    b.color = '#1b3148';
    b.stroke = '#7fb7dc';
    b.strokeWeight = 2;
    b.bounciness = 0;

    const texturePath = BLOCK_TEXTURES[texture] ?? texture;
    if (texturePath) {
      b.img = texturePath;
      b.img.scale.x = BLOCK_SIZE / 32;
      b.img.scale.y = BLOCK_SIZE / 32;
    }

    return b;
  }

  // =========================================================
  // REQUIRED FUNCTION #2
  // Creates a line of blocks using a for loop.
  //
  // direction can be:
  // "right", "left", "up", or "down"
  // =========================================================
  function blockLine(x, y, block_count, direction, texture = 'platform') {
    for (let i = 0; i < block_count; i++) {
      let blockX = x;
      let blockY = y;

      if (direction === "right") {
        blockX = x + i * BLOCK_SIZE;
      } else if (direction === "left") {
        blockX = x - i * BLOCK_SIZE;
      } else if (direction === "up") {
        blockY = y - i * BLOCK_SIZE;
        texture = 'wall'; // Use wall texture for vertical blocks
      } else if (direction === "down") {
        blockY = y + i * BLOCK_SIZE;
        texture = 'wall'; // Use wall texture for vertical blocks
      }

      blocks(blockX, blockY, texture);
    }
  }

  // =========================================================
  // HAZARD / SPECIAL BLOCK HELPERS
  // =========================================================
  function spike(x, y, w = 50, h = 16) {
    const s = new spikeGroup.Sprite(x, y, w, h);
    s.physics = STATIC;
    s.color = '#e85d4f';
    s.stroke = '#9f3029';
    s.strokeWeight = 2;
    return s;
  }

  function slime(x, y, w = 80, h = 12) {
    const sl = new slimeGroup.Sprite(x, y, w, h);
    sl.physics = STATIC;
    sl.color = '#f6b93b'; 
    sl.stroke = '#bd7600'; 
    sl.strokeWeight = 2;
    return sl;
  }

  function jumpPad(x, y, w = 60, h = 12) {
    const jp = new jumpPadGroup.Sprite(x, y, w, h);
    jp.physics = STATIC;
    jp.color = '#39e58c'; 
    jp.stroke = '#17824e'; 
    jp.strokeWeight = 2;
    return jp;
  }

  // =========================================================
  // OUTER BORDER
  // Border blocks do not overlap with the interior platforms.
  // =========================================================

  blockLine(-680, 700, 35, "right", "wall"); // bottom floor
  blockLine(-680, -300, 35, "right", "wall"); // top ceiling
  blockLine(-720, -260, 24, "down", "wall"); // left wall
  blockLine(720, -260, 24, "down", "wall"); // right wall

  // =========================================================
  // MAIN PATH
  // Interior platforms stay off the border and use 40px grid spacing.
  // =========================================================

  const START_ROW = 620;
  const PLATFORM_ROW_GAP = BLOCK_SIZE * 2;

  blockLine(-560, START_ROW, 5, "right"); // spawn floor
  blockLine(-300, START_ROW - PLATFORM_ROW_GAP, 4, "right");
  blockLine(-380, START_ROW - PLATFORM_ROW_GAP - BLOCK_SIZE * 3, 7, "up");
  blockLine(-260, START_ROW - PLATFORM_ROW_GAP - BLOCK_SIZE * 3, 7, "up");
  blockLine(-20, START_ROW - PLATFORM_ROW_GAP * 2, 4, "right");
  blockLine(260, START_ROW - PLATFORM_ROW_GAP * 3, 4, "right");
  blockLine(480, START_ROW - PLATFORM_ROW_GAP * 4, 4, "right");

  spike(320, START_ROW - PLATFORM_ROW_GAP * 3 - 24);

  blockLine(160, START_ROW - PLATFORM_ROW_GAP * 5, 4, "right");
  slime(220, START_ROW - PLATFORM_ROW_GAP * 5 - 24, 80, 12);

  blockLine(-160, START_ROW - PLATFORM_ROW_GAP * 6, 4, "right");
  jumpPad(-100, START_ROW - PLATFORM_ROW_GAP * 6 - 24, 60, 12);
  blocks(40, START_ROW - PLATFORM_ROW_GAP * 8);
  blocks(120, START_ROW - PLATFORM_ROW_GAP * 9);

  blockLine(-500, START_ROW - PLATFORM_ROW_GAP * 7, 4, "right");
  blockLine(200, START_ROW - PLATFORM_ROW_GAP * 9, 4, "right");

  // Door platform
  blockLine(360, START_ROW - PLATFORM_ROW_GAP * 10, 7, "right");

  // =========================================================
  // DOOR
  // =========================================================

  const doorSprite = new Sprite(560, START_ROW - PLATFORM_ROW_GAP * 10 - 40, 36, 50);
  doorSprite.physics = STATIC;
  doorSprite.color = '#f4d35e';
  doorSprite.stroke = '#b8860b';
  doorSprite.strokeWeight = 3;
  doorSprite.bounciness = 0;
  
  // =========================================================
  // SPAWN
  // =========================================================

  const spawnX = -560;
  const spawnY = 580;

  // =========================================================
  // INTERACTIONS
  // =========================================================

  slimeGroup.colliding(allSprites, (slime, sprite) => {
    if (!isPlayerTarget(sprite)) return;

    sprite._onSlime = true;

    // Slows horizontal movement.
    sprite.vel.x *= 0.65;

    // Reduces jump height while on slime.
    if (sprite.vel.y < -3.5) {
      sprite.vel.y = -3.5;
    }
  });

  jumpPadGroup.overlaps(allSprites, (pad, sprite) => {
    if (!isPlayerTarget(sprite)) return;

    if (sprite.vel.y >= -2) {
      sprite.vel.y = -15;
      sprite._jumpPadBounce = true;
    }
  });

  spikeGroup.overlaps(allSprites, (spike, sprite) => {
    if (!sprite._player || sprite._player.flyMode) return;
    sprite._player.die();
  });

  return {
    platforms: platformGroup,
    door: doorSprite,
    spawnX,
    spawnY
  };
}
