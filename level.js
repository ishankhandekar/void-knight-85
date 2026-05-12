export function buildLevel() {
  const platformGroup = new Group();

  const platforms = [
    { x: 0, y: 350, w: 500, h: 20 },
    { x: -300, y: 280, w: 150, h: 20 },
    { x: 300, y: 260, w: 150, h: 20 },
    { x: -150, y: 200, w: 120, h: 20 },
    { x: 150, y: 180, w: 120, h: 20 },
  ];

  for (const p of platforms) {
    const plat = new platformGroup.Sprite(p.x, p.y, p.w, p.h);
    plat.physics = STATIC;
    plat.color = '#5a6c7d';
    plat.stroke = '#3d4a5a';
    plat.strokeWeight = 1;
  }

  return platformGroup;
}
