export function buildLevel(canvasHeight) {
  const platformGroup = new Group();
  const slimeGroup = new Group();
  const jumpPadGroup = new Group();
  const spikeGroup = new Group();

  const BLOCK_SIZE = 40;

  // Only affect the player, not platforms, hazards, or the door.
  function isPlayerTarget(sprite) {
    return sprite && sprite.rotationLock === true;
  }

  // =========================================================
  // REQUIRED FUNCTION #1
  // Creates one block at the given x and y position.
  // =========================================================
  function blocks(x, y) {
    const b = new platformGroup.Sprite(x, y, BLOCK_SIZE, BLOCK_SIZE);
    b.physics = STATIC;
    b.color = '#1b3148';
    b.stroke = '#7fb7dc';
    b.strokeWeight = 2;
    b.bounciness = 0;
    b.img = 'Sprites/textures/platformtexture.png';
    b.img.scale.x = BLOCK_SIZE / 32;
    b.img.scale.y = BLOCK_SIZE / 32;
    return b;
  }

  // =========================================================
  // REQUIRED FUNCTION #2
  // Creates a line of blocks using a for loop.
  //
  // direction can be:
  // "right", "left", "up", or "down"
  // =========================================================
  function blockLine(x, y, block_count, direction) {
    for (let i = 0; i < block_count; i++) {
      let blockX = x;
      let blockY = y;

      if (direction === "right") {
        blockX = x + i * BLOCK_SIZE;
      } else if (direction === "left") {
        blockX = x - i * BLOCK_SIZE;
      } else if (direction === "up") {
        blockY = y - i * BLOCK_SIZE;
      } else if (direction === "down") {
        blockY = y + i * BLOCK_SIZE;
      }

      blocks(blockX, blockY);
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
    sl.color = '#39e58c';
    sl.stroke = '#17824e';
    sl.strokeWeight = 2;
    return sl;
  }

  function jumpPad(x, y, w = 60, h = 12) {
    const jp = new jumpPadGroup.Sprite(x, y, w, h);
    jp.physics = STATIC;
    jp.color = '#f6b93b';
    jp.stroke = '#bd7600';
    jp.strokeWeight = 2;
    return jp;
  }

  // =========================================================
  // OUTER BORDER
  // Border blocks do not overlap with the interior platforms.
  // =========================================================

  blockLine(-680, 700, 35, "right"); // bottom floor
  blockLine(-680, -300, 35, "right"); // top ceiling
  blockLine(-720, -260, 24, "down"); // left wall
  blockLine(720, -260, 24, "down"); // right wall

  // =========================================================
  // CHAMBER 1: SPAWN AREA
  // Clear starter path upward. Each gap is at least 80px wide.
  // =========================================================

  blockLine(-640, 620, 7, "right"); // spawn floor
  blockLine(-240, 620, 5, "right");
  blockLine(120, 620, 5, "right");
  blockLine(440, 620, 5, "right");

  // starter steps near spawn
  blocks(-480, 560);
  blocks(-400, 500);
  blocks(-320, 440);

  // upper divider with a large opening near the left-middle
  blockLine(-680, 380, 6, "right");
  blockLine(-280, 380, 6, "right");
  blockLine(240, 380, 9, "right");

  // =========================================================
  // CHAMBER 2: SPIKE GAUNTLET
  // Platforms are spaced so the player can move between them.
  // =========================================================

  blockLine(-560, 320, 4, "right");
  blockLine(-300, 300, 4, "right");
  blockLine(-40, 320, 4, "right");
  blockLine(240, 300, 4, "right");
  blockLine(500, 320, 4, "right");

  spike(-20, 296);
  spike(260, 276);

  // divider with a large left opening
  blockLine(-120, 220, 7, "right");
  blockLine(280, 220, 8, "right");

  // =========================================================
  // CHAMBER 3: WALL JUMP / SLIME ROOM
  // Wall pillars do not intersect any horizontal block lines.
  // There is a 120px gap between the wall-jump pillars.
  // =========================================================

  blockLine(-600, 160, 4, "right");

  // wall jump pillars
  blockLine(-420, 160, 4, "up");
  blockLine(-260, 160, 4, "up");

  blockLine(-60, 140, 4, "right");
  blockLine(220, 160, 4, "right");
  blockLine(500, 140, 4, "right");

  slime(260, 136, 80, 12);
  jumpPad(-20, 116, 60, 12);
  spike(520, 116);

  // divider with large right opening
  blockLine(-680, 40, 8, "right");
  blockLine(-240, 40, 7, "right");

  // =========================================================
  // CHAMBER 4: JUMP PAD ASCENT
  // Jump pads make the taller vertical movement possible.
  // =========================================================

  blockLine(520, -20, 4, "right");
  jumpPad(560, -44, 60, 12);

  blockLine(260, -80, 4, "right");
  blockLine(-20, -120, 4, "right");
  jumpPad(20, -144, 60, 12);

  blockLine(-320, -160, 4, "right");
  blockLine(-600, -120, 4, "right");

  // divider with a wide center opening
  blockLine(-680, -220, 6, "right");
  blockLine(240, -220, 11, "right");

  // =========================================================
  // CHAMBER 5: FINAL DOOR ROOM
  // Final staircase to the door.
  // =========================================================

  blockLine(-480, -240, 4, "right");
  blockLine(-200, -260, 4, "right");
  blockLine(80, -240, 4, "right");
  blockLine(360, -260, 6, "right");

  // Door platform
  blockLine(440, -220, 5, "right");

  // =========================================================
  // DOOR
  // =========================================================

  const doorSprite = new Sprite(560, -260, 36, 50);
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