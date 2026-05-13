export class Player {
  constructor(x, y, groundGroup) {
    this.sprite = new Sprite(x, y, 20, 20, 'd');
    this.sprite.rotationLock = true;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;
    this.sprite.color = '#e74c3c';
    this.sprite.stroke = '#c0392b';
    this.sprite.strokeWeight = 2;

    this.speed = 4;
    this.jumpPower = 8;
    this.isGrounded = false;
    this.cameraSpeed = 0.1;

    const p = this.sprite;
    p.collides(groundGroup, () => this.isGrounded = true);
    p.collided(groundGroup, () => this.isGrounded = false);
  }

  update() {
    if (keyboard.ArrowLeft || keyboard.A) {
      this.sprite.vel.x = -this.speed;
    } else if (keyboard.ArrowRight || keyboard.D) {
      this.sprite.vel.x = this.speed;
    } else {
      this.sprite.vel.x *= 0.85;
    }

    if (this.isGrounded && (keyboard.presses('ArrowUp') || keyboard.presses('W') || keyboard.presses('Space'))) {
      this.sprite.vel.y = -this.jumpPower;
      this.isGrounded = false;
    }

    this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed)
  }

  _followCamera(targetX, targetY, speed) {
    camera.x += (targetX - camera.x) * speed;
    camera.y += (targetY - camera.y) * speed;
  }
}
