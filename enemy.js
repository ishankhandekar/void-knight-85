export class Enemy {
  constructor(x, y, patrolLeft, patrolRight, groundGroup) {
    this.sprite = new Sprite(x, y, 24, 24);
    this.sprite.rotationLock = true;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;
    this.sprite.color = '#8e44ad';
    this.sprite.stroke = '#6c3483';
    this.sprite.strokeWeight = 2;
    this.sprite.addAni('Sprites/Slugani.png', 4, '32x32');
    this.sprite.anis.Slugani.frameDelay = 8;
    this.sprite.anis.Slugani.scale.x = 24 / 30;
    this.sprite.anis.Slugani.scale.y = 24 / 30;
    this.sprite.changeAni('Slugani');

    this.groundGroup = groundGroup;
    this.patrolLeft = patrolLeft;
    this.patrolRight = patrolRight;
    this.speed = 1.5;
    this.dir = 1; // 1 = right, -1 = left

    this.spawnX = x;
    this.spawnY = y;
  }

  update() {
    if (this.sprite.deleted) return;

    // Reverse at patrol bounds
    if (this.sprite.x >= this.patrolRight) {
      this.dir = -1;
      this.sprite.scale.x = -1;
    } else if (this.sprite.x <= this.patrolLeft) {
      this.dir = 1;
      this.sprite.scale.x = 1;
    }

    // Check for platform edge ahead to avoid walking off — only when grounded
    const halfW = this.sprite.w / 2;
    const halfH = this.sprite.h / 2;
    const enemyBottom = this.sprite.y + halfH;
    const lookAheadX = this.sprite.x + this.dir * (halfW + 4);

    let isGrounded = false;
    let groundAhead = false;
    for (const plat of this.groundGroup) {
      const platLeft  = plat.x - plat.w / 2;
      const platRight = plat.x + plat.w / 2;
      const platTop   = plat.y - plat.h / 2;
      const horizontalOverlap = this.sprite.x + halfW > platLeft && this.sprite.x - halfW < platRight;

      if (!isGrounded && horizontalOverlap && Math.abs(enemyBottom - platTop) < 8) {
        isGrounded = true;
      }
      if (lookAheadX >= platLeft && lookAheadX <= platRight &&
          Math.abs(enemyBottom - platTop) < 10) {
        groundAhead = true;
      }
    }
    if (isGrounded && !groundAhead) {
      this.dir *= -1;
      this.sprite.scale.x = this.dir;
    }

    // Move horizontally
    this.sprite.vel.x = this.dir * this.speed;

  }
}
