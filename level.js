// Planned additions:
// 1. Star pixels with score updates based on how many the player collects.
// 2. Magic fireball wizard?

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
    const lineBlocks = [];

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

      lineBlocks.push(blocks(blockX, blockY, texture));
    }

    return lineBlocks;
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
  const PLAYER_SIZE = 32;
  const BARRIER_GAP = PLAYER_SIZE * 2;
  const spawnPlatformLength = 4;

  blockLine(-680, START_ROW, spawnPlatformLength, "right"); // spawn floor
  blockLine(-560, START_ROW - BLOCK_SIZE, 14, "up"); // right spawn wall
  blockLine(-560, -260, 6, "down", "wall"); // ceiling wall
  blockLine(-360, -260, 12, "down", "wall"); // tall ceiling wall
  blockLine(-360, 660, 9, "up", "wall"); // bottom wall below tall ceiling wall
  blockLine(-320, 340, spawnPlatformLength, "right"); // jump pad platform
  blockLine(-160, -260, 6, "down", "wall"); // top wall above slime platform wall
  blockLine(-160, 660, 15, "up", "wall"); // bottom wall against slime platform
  blockLine(40, 660, 20, "up", "wall"); // bottom wall against slime moving platform
  blockLine(200, -260, 22, "down", "wall"); // top wall right of slime moving platform
  spike(120, 672, 80, 16);
  blockLine(520, -175, 5, "right"); // door platform
  ///blockLine(400, -140, 5, "down", "wall"); // top wall above right upper wall
  ///blockLine(400, 180, 5, "down", "wall"); // upper wall above right support
  ///blockLine(400, 660, 5, "up", "wall"); // support below lowest right wall platform
  

//Ending Block Section
  blocks(320, 600);
  blocks(440, 480);
  blocks(560, 560);
  blocks(320, 320);
  blocks(480, 280);
  blocks(600, 360);
  blocks(360, 80);
  blocks(520, 120);
  blocks(400, -80);
  blocks(600, -40);

  jumpPad(-260, 314, 80, 12);

  const movingPlatformX = -520;
  const movingPlatformStartY = 596;
  const movingPlatformWidth = spawnPlatformLength * BLOCK_SIZE;
  const movingPlatform = blockLine(movingPlatformX, movingPlatformStartY, spawnPlatformLength, "right");
  const movingPlatformTopY = -300 + BLOCK_SIZE / 2 + BARRIER_GAP + BLOCK_SIZE / 2;
  const movingPlatformBottomY = 700 - BLOCK_SIZE / 2 - BARRIER_GAP - BLOCK_SIZE / 2;
  const movingPlatformSlug = {
    x: movingPlatformX + movingPlatformWidth / 2 - BLOCK_SIZE / 2,
    y: movingPlatformStartY - BLOCK_SIZE / 2 - 12,
    left: movingPlatformX - BLOCK_SIZE / 2 + 12,
    right: movingPlatformX + movingPlatformWidth - BLOCK_SIZE / 2 - 12
  };

  const secondMovingPlatformX = -120;
  const secondMovingPlatformStartY = 60;
  const secondMovingPlatform = blockLine(secondMovingPlatformX, secondMovingPlatformStartY, spawnPlatformLength, "right");
  const secondMovingPlatformSlug = {
    x: secondMovingPlatformX + movingPlatformWidth / 2 - BLOCK_SIZE / 2,
    y: secondMovingPlatformStartY - BLOCK_SIZE / 2 - 12,
    left: secondMovingPlatformX - BLOCK_SIZE / 2 + 12,
    right: secondMovingPlatformX + movingPlatformWidth - BLOCK_SIZE / 2 - 12
  };
  const secondMovingPlatformTopY = -300 + BLOCK_SIZE / 2 + BARRIER_GAP + BLOCK_SIZE / 2;
  const secondMovingPlatformBottomY = 700 - BLOCK_SIZE / 2 - BARRIER_GAP - BLOCK_SIZE / 2;
  let movingPlatformDirection = -1;
  let secondMovingPlatformDirection = -1;

  for (const platform of movingPlatform) {
    platform.physics = 'kinematic';
    platform.vel.y = -2;
  }
  for (const platform of secondMovingPlatform) {
    platform.physics = 'kinematic';
    platform.vel.y = -2;
  }
  function updateMovingPlatform() {
    const currentY = movingPlatform[0].y;

    if (currentY <= movingPlatformTopY) {
      movingPlatformDirection = 1;
      for (const platform of movingPlatform) {
        platform.y = movingPlatformTopY;
      }
    } else if (currentY >= movingPlatformBottomY) {
      movingPlatformDirection = -1;
      for (const platform of movingPlatform) {
        platform.y = movingPlatformBottomY;
      }
    }

    const velocity = movingPlatformDirection * 2;
    for (const platform of movingPlatform) {
      platform.vel.y = velocity;
    }
    const secondCurrentY = secondMovingPlatform[0].y;

    if (secondCurrentY <= secondMovingPlatformTopY) {
      secondMovingPlatformDirection = 1;
      for (const platform of secondMovingPlatform) {
        platform.y = secondMovingPlatformTopY;
      }
    } else if (secondCurrentY >= secondMovingPlatformBottomY) {
      secondMovingPlatformDirection = -1;
      for (const platform of secondMovingPlatform) {
        platform.y = secondMovingPlatformBottomY;
      }
    }

    const secondVelocity = secondMovingPlatformDirection * 2;
    for (const platform of secondMovingPlatform) {
      platform.vel.y = secondVelocity;
    }
  }

  // =========================================================
  // DOOR
  // =========================================================

  const doorSprite = new Sprite(600, -220, 36, 50);
  doorSprite.physics = STATIC;
  doorSprite.color = '#f4d35e';
  doorSprite.stroke = '#b8860b';
  doorSprite.strokeWeight = 3;
  doorSprite.bounciness = 0;
  
  // =========================================================
  // SPAWN
  // =========================================================

  const spawnX = -680;
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

  function resetMovingPlatforms() {
    // First moving platform
    movingPlatformDirection = -1;
    for (const platform of movingPlatform) {
      platform.y = movingPlatformStartY;
      platform.vel.y = -2;
    }
    // Second moving platform
    secondMovingPlatformDirection = -1;
    for (const platform of secondMovingPlatform) {
      platform.y = secondMovingPlatformStartY;
      platform.vel.y = -2;
    }
  }

  function freezeMovingPlatforms() {
    for (const platform of movingPlatform) {
      platform.vel.y = 0;
    }
    for (const platform of secondMovingPlatform) {
      platform.vel.y = 0;
    }
  }

  return {
    platforms: platformGroup,
    door: doorSprite,
    movingPlatformSlug,
    secondMovingPlatformSlug,
    update: updateMovingPlatform,
    freeze: freezeMovingPlatforms,
    reset: resetMovingPlatforms,
    spawnX,
    spawnY
  };
}
