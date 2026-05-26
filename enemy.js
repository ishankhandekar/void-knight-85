export class Enemy {
  constructor(x, y, patrolLeft, patrolRight, groundGroup) {
    this.groundGroup = groundGroup;
    this.patrolLeft = patrolLeft;
    this.patrolRight = patrolRight;
    this.speed = 1.5;
    this.dir = 1; // 1 = right, -1 = left

    this.spawnX = x;
    this.spawnY = y;

    this._buildSprite(x, y);
  }

  /** Create (or recreate) the physics sprite at the given position. */
  _buildSprite(x, y) {
    if (this.sprite && !this.sprite.deleted) this.sprite.delete();
    this.sprite = new Sprite(x, y, 24, 24, 'd');
    this.sprite.rotationLock = true;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;
    this.sprite.color = '#8e44ad';
    this.sprite.stroke = '#6c3483';
    this.sprite.strokeWeight = 2;
  }

  /**
   * Reset back to the spawn position.
   * Recreates the sprite so previously-killed enemies are restored.
   * Subclasses should call super.reset() then re-add their animations.
   */
  reset() {
    this._buildSprite(this.spawnX, this.spawnY);
    this.dir = 1;
  }

  update() {
    if (this.sprite.deleted) return;

    // Clamp to patrol bounds so overshooting is impossible
    if (this.sprite.x > this.patrolRight) {
      this.sprite.x = this.patrolRight;
      this.dir = -1;
      this.sprite.scale.x = -1;
    } else if (this.sprite.x < this.patrolLeft) {
      this.sprite.x = this.patrolLeft;
      this.dir = 1;
      this.sprite.scale.x = 1;
    } else if (this.sprite.x >= this.patrolRight - 2) {
      this.dir = -1;
      this.sprite.scale.x = -1;
    } else if (this.sprite.x <= this.patrolLeft + 2) {
      this.dir = 1;
      this.sprite.scale.x = 1;
    }

    // Check for platform edge ahead to avoid walking off — only when grounded
    const halfW = this.sprite.w / 2;
    const halfH = this.sprite.h / 2;
    const enemyBottom = this.sprite.y + halfH;
    const GROUND_THRESHOLD = 10;
    const lookAheadX = this.sprite.x + this.dir * (halfW + 8);

    let isGrounded = false;
    let groundAhead = false;
    for (const plat of this.groundGroup) {
      const platLeft  = plat.x - plat.w / 2;
      const platRight = plat.x + plat.w / 2;
      const platTop   = plat.y - plat.h / 2;
      const horizontalOverlap = this.sprite.x + halfW > platLeft && this.sprite.x - halfW < platRight;

      if (!isGrounded && horizontalOverlap && Math.abs(enemyBottom - platTop) < GROUND_THRESHOLD) {
        isGrounded = true;
      }
      if (lookAheadX >= platLeft && lookAheadX <= platRight &&
          Math.abs(enemyBottom - platTop) < GROUND_THRESHOLD) {
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
