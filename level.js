export function buildLevel(canvasHeight) {
  const platformGroup = new Group();
  const slimeGroup = new Group();
  const jumpPadGroup = new Group();
  const spikeGroup = new Group();

  function plat(x, y, w, h) {
    const p = new platformGroup.Sprite(x, y, w, h);
    p.physics = STATIC;
    p.color = '#25435f';
    p.stroke = '#3d4a5a';
    p.strokeWeight = 1;
    p.bounciness = 0;
    return p;
  }

  // === DUNGEON BORDER WALLS ===
  plat(0, 700, 1500, 40);
  plat(0, -280, 1500, 40);
  plat(-730, 140, 40, 1080);
  plat(730, 140, 40, 1080);

  // === CHAMBER 1: Starting Room (bottom) ===
  plat(-450, 500, 400, 20);
  plat(-100, 500, 200, 20);
  plat(250, 500, 250, 20);
  plat(550, 500, 200, 20);
  // Chamber ceiling with opening on the right side
  plat(-300, 420, 600, 20);

  // === CHAMBER 2: Spike Gauntlet ===
  plat(-550, 380, 160, 20);
  plat(-280, 350, 140, 20);
  plat(0, 370, 160, 20);
  plat(280, 340, 160, 20);
  plat(520, 360, 180, 20);
  // Chamber ceiling with opening on the left side
  plat(150, 270, 700, 20);

  // === CHAMBER 3: Wall Jump Corridor ===
  plat(-550, 240, 160, 20);
  plat(-370, 190, 20, 160);
  plat(-310, 190, 20, 160);
  plat(-150, 220, 140, 20);
  plat(100, 200, 160, 20);
  plat(350, 230, 140, 20);
  plat(580, 210, 160, 20);
  // Chamber ceiling with opening on the right side
  plat(-300, 120, 600, 20);

  // === CHAMBER 4: Jump Pad Ascent ===
  plat(-550, 80, 160, 20);
  plat(-250, 60, 160, 20);
  plat(50, 40, 140, 20);
  plat(350, 20, 160, 20);
  plat(580, 50, 160, 20);
  // Chamber ceiling with opening on the left side
  plat(100, -50, 750, 20);

  // === CHAMBER 5: Door Room (top) ===
  plat(-550, -80, 160, 20);
  plat(-280, -110, 160, 20);
  plat(0, -140, 140, 20);
  plat(280, -170, 160, 20);
  plat(520, -200, 200, 20);

  // === SPIKES ===
  const spikePositions = [
    { x: 0, y: 360, w: 60, h: 15 },
    { x: 280, y: 330, w: 60, h: 15 },
    { x: -150, y: 210, w: 50, h: 15 },
    { x: 0, y: -150, w: 50, h: 15 },
  ];
  for (const s of spikePositions) {
    const spike = new spikeGroup.Sprite(s.x, s.y, s.w, s.h);
    spike.physics = STATIC;
    spike.color = '#e74c3c';
    spike.stroke = '#c0392b';
    spike.strokeWeight = 1;
  }

  // === SLIME ===
  const slimePositions = [
    { x: 350, y: 222, w: 60, h: 10 },
  ];
  for (const s of slimePositions) {
    const sl = new slimeGroup.Sprite(s.x, s.y, s.w, s.h);
    sl.physics = STATIC;
    sl.color = '#2ecc71';
    sl.stroke = '#27ae60';
    sl.strokeWeight = 1;
  }

  // === JUMP PADS ===
  const jumpPadPositions = [
    { x: -250, y: 52, w: 50, h: 10 },
    { x: 100, y: 192, w: 80, h: 10 },
    { x: 350, y: 12, w: 50, h: 10 },
  ];
  for (const j of jumpPadPositions) {
    const jp = new jumpPadGroup.Sprite(j.x, j.y, j.w, j.h);
    jp.physics = STATIC;
    jp.color = '#f39c12';
    jp.stroke = '#e67e22';
    jp.strokeWeight = 1;
  }

  // === DOOR ===
  const doorSprite = new Sprite(550, -220, 30, 40);
  doorSprite.physics = STATIC;
  doorSprite.color = '#f1c40f';
  doorSprite.stroke = '#d4ac0d';
  doorSprite.strokeWeight = 2;
  doorSprite.bounciness = 0;

  // === SPAWN ===
  const spawnX = -450;
  const spawnY = 480;

  // === INTERACTIONS ===
  // Kill upward velocity every frame the player is touching slime, preventing jumping
  slimeGroup.colliding(allSprites, (slime, sprite) => {
    if (sprite !== slime && sprite.vel.y < 0) sprite.vel.y = 0;
  });

  // overlaps() instead of collides() so q5play doesn't resolve collision physics,
  // which would zero out the upward velocity we're trying to set
  jumpPadGroup.overlaps(allSprites, (pad, sprite) => {
    if (sprite !== pad && sprite.vel.y >= -2) {
      sprite.vel.y = -15;
      sprite._jumpPadBounce = true;
    }
  });

  spikeGroup.overlaps(allSprites, (spike, sprite) => {
    if (sprite !== spike && sprite !== doorSprite && sprite._player) {
      sprite._player.die();
    }
  });

  return { platforms: platformGroup, door: doorSprite, spawnX, spawnY };
}
