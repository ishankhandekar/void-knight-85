// Planned additions:
// 1. Star pixels with score updates based on how many the player collects.
// 2. Magic fireball wizard?

export function buildLevel(canvasHeight) {
  const platformGroup = new Group();
  const honeyGroup = new Group();
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
    s.addAni("Sprites/explosionani.png", 6, "32x32");
    s.anis.explosionani.frameDelay = 2;
    s.anis.explosionani.scale.x = w / 16;
    s.anis.explosionani.scale.y = h / 4;
    s.anis.explosionani.loop = false;
    s.anis.explosionani.pause();
    return s;
  }

  function honey(x, y, w = BLOCK_SIZE, h = 12) {
    const sl = new honeyGroup.Sprite(x, y, w, h);
    sl.physics = STATIC;
    sl.color = '#f6b93b';
    sl.stroke = '#bd7600';
    sl.strokeWeight = 2;
    sl.img = 'Sprites/textures/honeytexture.png';
    sl.img.scale.x = w / 32;
    sl.img.scale.y = h / 10;
    return sl;
  }

  function jumpPad(x, y, w = 60, h = 12) {
    const jp = new jumpPadGroup.Sprite(x, y, w, h);
    jp.physics = STATIC;
    jp.color = '#39e58c'; 
    jp.stroke = '#17824e'; 
    jp.strokeWeight = 2;
    jp.addAni("Sprites/slimetextureani.png", 6, "32x32");
    jp.anis.slimetextureani.frameDelay = 2;
    jp.anis.slimetextureani.scale.x = w / 32;
    jp.anis.slimetextureani.scale.y = h / 32;
    jp.anis.slimetextureani.loop = false;
    jp.anis.slimetextureani.pause();
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
  const spawnPlatformLength = 3;
  const middlePlatformLength = 4;

  blockLine(-680, START_ROW, spawnPlatformLength, "right"); // spawn floor
  blockLine(-560, START_ROW, 15, "up"); // right spawn wall
  blockLine(-560, -260, 6, "down", "wall"); // ceiling wall
  blockLine(-360, -260, 12, "down", "wall"); // tall ceiling wall
  blockLine(-360, 660, 9, "up", "wall"); // bottom wall below tall ceiling wall
  blockLine(-320, 340, middlePlatformLength, "right"); // jump pad platform
  blockLine(-160, -260, 6, "down", "wall"); // top wall above slime platform wall
  blockLine(-160, 660, 15, "up", "wall"); // bottom wall against slime platform
  blockLine(40, 660, 20, "up", "wall"); // bottom wall against slime moving platform
  blockLine(200, -260, 22, "down", "wall"); // top wall right of slime moving platform
  spike(100, 674, 40, 12);
  spike(140, 674, 40, 12);
  blockLine(520, -175, 5, "right"); // door platform
  ///blockLine(400, -140, 5, "down", "wall"); // top wall above right upper wall
  ///blockLine(400, 180, 5, "down", "wall"); // upper wall above right support
  ///blockLine(400, 660, 5, "up", "wall"); // support below lowest right wall platform
  

//Ending Block Section
  blocks(320, 580);
  blocks(440, 460);
  blocks(560, 540);
  blocks(320, 300);
  blocks(480, 260);
  blocks(600, 340);
  blocks(360, 60);
  blocks(520, 100);
  blocks(400, -100);
  blocks(600, -60);

  spike(440, 674, 40, 12);
  honey(480, 674);

  // Wall-mounted mage perches
  blocks(240, 500);
  blocks(680, 340);
  blocks(240, 140);
  blocks(680, -60);

  jumpPad(-260, 314, 80, 12);

  const movingPlatformX = -520;
  const movingPlatformStartY = 596;
  const movingPlatformWidth = middlePlatformLength * BLOCK_SIZE;
  const movingPlatform = blockLine(movingPlatformX, movingPlatformStartY, middlePlatformLength, "right");
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
  const secondMovingPlatform = blockLine(secondMovingPlatformX, secondMovingPlatformStartY, middlePlatformLength, "right");
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

  function updateHazardAnimations() {
    for (const s of spikeGroup) {
      if (s.anis.explosionani.frame >= s.anis.explosionani.lastFrame) {
        s.anis.explosionani.pause();
      }
    }
    for (const jp of jumpPadGroup) {
      if (jp.anis.slimetextureani.frame >= jp.anis.slimetextureani.lastFrame) {
        jp.anis.slimetextureani.frame = 0;
        jp.anis.slimetextureani.pause();
      }
    }
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

    updateHazardAnimations();
  }

  // =========================================================
  // DOOR
  // =========================================================

  const doorSprite = new Sprite(600, -230, 80, 140);
  doorSprite.physics = STATIC;
  doorSprite.color = '#f4d35e';
  doorSprite.stroke = '#b8860b';
  doorSprite.strokeWeight = 3;
  doorSprite.bounciness = 0;
  // 28, 16
  doorSprite.addAni("Sprites/portaltexture.png", 9, "32x32");
  doorSprite.anis.portaltexture.frameDelay = 12;
  doorSprite.anis.portaltexture.scale.x = 32 / 16;
  doorSprite.anis.portaltexture.scale.y = 56 / 28;
  doorSprite.changeAni("portaltexture");
  doorSprite.ani.play();
  
  // =========================================================
  // SPAWN
  // =========================================================

  const spawnX = -680;
  const spawnY = 580;

  // =========================================================
  // INTERACTIONS
  // =========================================================

  honeyGroup.colliding(allSprites, (honey, sprite) => {
    if (!isPlayerTarget(sprite)) return;

    sprite._onHoney = true;

    // Slows horizontal movement.
    sprite.vel.x *= 0.65;

    // Reduces jump height while on honey.
    if (sprite.vel.y < -3.5) {
      sprite.vel.y = -3.5;
    }
  });

  jumpPadGroup.overlaps(allSprites, (pad, sprite) => {
    if (!isPlayerTarget(sprite)) return;

    if (sprite.vel.y >= -2) {
      sprite.vel.y = -15;
      sprite._jumpPadBounce = true;
      pad.anis.slimetextureani.frame = 0;
      pad.anis.slimetextureani.loop = false;
      pad.anis.slimetextureani.play();
    }
  });

  spikeGroup.overlaps(allSprites, (spike, sprite) => {
    if (!sprite._player || sprite._player.flyMode || sprite._player.isDying) return;
    spike.anis.explosionani.frame = 0;
    spike.anis.explosionani.loop = false;
    spike.anis.explosionani.play();
    sprite._player.dieInstant();
  });

  function resetSpikes() {
    for (const s of spikeGroup) {
      s.anis.explosionani.frame = 0;
      s.anis.explosionani.pause();
    }
  }

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

    resetSpikes();
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
    updateSpikes: updateHazardAnimations,
    freeze: freezeMovingPlatforms,
    reset: resetMovingPlatforms,
    spawnX,
    spawnY
  };
}
