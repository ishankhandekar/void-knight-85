export function buildLevel(canvasHeight) {
  // Shift everything so the player rests at the vertical screen center (height/2).
  // Original rest y = 330 (platform top 340, player half 10). dy moves that to height/2.
  const dy = canvasHeight / 2 - 330;
  const max_y_velocity = -15;
  const platformGroup = new Group();

  const platforms = [
    { x: 0,    y: 350, w: 500, h: 20 },
    { x: -300, y: 280, w: 150, h: 20 },
    { x: -150, y: 200, w: 120, h: 20 },
    { x: 150,  y: 180, w: 120, h: 20 },
    { x: -55,  y: 215, w: 20,  h: 250 },
    { x: 55,   y: 215, w: 20,  h: 250 },
    { x: -500, y: 350, w: 200, h: 20 },
    { x: 500,  y: 350, w: 200, h: 20 },
    { x: -450, y: 160, w: 100, h: 20 },
    { x: 450,  y: 160, w: 100, h: 20 },
    { x: -250, y: 120, w: 80,  h: 20 },
    { x: 250,  y: 120, w: 80,  h: 20 },
  ].map(p => ({ ...p, y: p.y + dy }));

  for (const p of platforms) {
    const plat = new platformGroup.Sprite(p.x, p.y, p.w, p.h);
    plat.physics = STATIC;
    plat.color = '#25435f';
    plat.stroke = '#3d4a5a';
    plat.strokeWeight = 1;
    plat.bounciness = 0;
  }

  const slimeGroup = new Group();
  for (const p of [{ x: 200, y: 335 + dy, w: 80, h: 10 }]) {
    const s = new slimeGroup.Sprite(p.x, p.y, p.w, p.h);
    s.physics = STATIC;
    s.color = '#2ecc71';
    s.stroke = '#27ae60';
    s.strokeWeight = 1;
  }
  slimeGroup.collides(allSprites, (slime, sprite) => {
    if (sprite !== slime) sprite.vel.x *= 0.92;
  });

  let lastJumpPadTime = 0;

  const jumpPadGroup = new Group();
  for (const p of [{ x: -300, y: 265 + dy, w: 50, h: 10 }]) {
    const j = new jumpPadGroup.Sprite(p.x, p.y, p.w, p.h);
    j.physics = STATIC;
    j.color = '#f39c12';
    j.stroke = '#e67e22';
    j.strokeWeight = 1;
  }
  jumpPadGroup.collides(allSprites, (pad, sprite) => {
    const now = Date.now();
    if (sprite !== pad && sprite.vel.y > 0 && (now - lastJumpPadTime > 500)) {
      sprite.vel.y = max_y_velocity;
      lastJumpPadTime = now;
    }
  });

  const spikeGroup = new Group();
  for (const p of [{ x: 300, y: 240 + dy, w: 60, h: 20 }]) {
    const spike = new spikeGroup.Sprite(p.x, p.y, p.w, p.h);
    spike.physics = STATIC;
    spike.color = '#e74c3c';
    spike.stroke = '#c0392b';
    spike.strokeWeight = 1;
  }
  spikeGroup.overlaps(allSprites, (spike, sprite) => {
    if (sprite !== spike) {
      sprite.vel.x = 0;
      sprite.vel.y = 0;
      sprite.x = 0;
      sprite.y = canvasHeight / 2 - 5;
    }
  });

  return platformGroup;
}
