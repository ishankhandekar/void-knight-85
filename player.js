export class Player {
  constructor(x, y, groundGroup) {
    this.sprite = new Sprite(x, y, 20, 20, 'd');
    this.sprite.rotationLock = true;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;
    this.sprite.color = '#e74c3c';
    this.sprite.stroke = '#c0392b';
    this.sprite.strokeWeight = 2;

    this.spawnX = x;
    this.spawnY = y;
    this.groundGroup = groundGroup;

    // Movement
    this.speed = 4;
    this.jumpPower = 10;
    this.cameraSpeed = 0.1;

    // Coyote time
    this.coyoteTime = 120;
    this.lastGroundedTime = 0;

    // Jump buffer
    this.jumpBufferTime = 100;
    this.lastJumpPressTime = 0;

    // Wall slide
    this.wallSlideMaxSpeed = 1.5;

    // Wall jump — ease-out decaying force, fast at start and slow at end
    this.wallJumpPower = this.jumpPower * 0.7;
    this.wallJumpInstant = 2;     // immediate vel.x kick so player input can't zero it instantly
    this.wallJumpAccel = 1.2;     // peak force added per frame on top of the instant kick
    this.wallJumpDuration = 260;  // ms over which the decaying force fades to 0
    this.wallJumpForceDir = 0;    // +1 or -1

    // Prevent instantly re-grabbing the same wall
    this.reGrabCooldown = 60;
    this.lastWallJumpTime = 0;
    this.lastWallDir = 0;

    this.isGrounded = false;
  }

  update() {
    const hw = 10, hh = 10;
    const btm = this.sprite.y + hh;
    const top = this.sprite.y - hh;
    const l   = this.sprite.x - hw;
    const r   = this.sprite.x + hw;

    const now = Date.now();

    this.isGrounded = false;
    let onWall = 0;

    for (const plat of this.groundGroup) {
      const pL = plat.x - plat.w / 2;
      const pR = plat.x + plat.w / 2;
      const pT = plat.y - plat.h / 2;
      const pB = plat.y + plat.h / 2;

      if (!this.isGrounded && btm >= pT - 4 && btm <= pT + 5 &&
          r > pL && l < pR && this.sprite.vel.y >= 0) {
        this.isGrounded = true;
      }

      if (!onWall && !this.isGrounded) {
        if (Math.abs(l - pR) < 3 && btm > pT + 2 && top < pB - 2) onWall =  1;
        else if (Math.abs(r - pL) < 3 && btm > pT + 2 && top < pB - 2) onWall = -1;
      }
    }

    if (this.isGrounded) {
      this.lastGroundedTime = now;
      this.lastWallJumpTime = 0; // landing cancels any residual wall jump force
    }

    const coyoteOk = (now - this.lastGroundedTime) < this.coyoteTime && this.sprite.vel.y >= 0;

    const reGrabBlocked = (now - this.lastWallJumpTime) < this.reGrabCooldown &&
                          onWall === this.lastWallDir;
    const effectiveWall = reGrabBlocked ? 0 : onWall;

    const left  = keyboard.ArrowLeft  || keyboard.A;
    const right = keyboard.ArrowRight || keyboard.D;
    const jumpPressed = keyboard.presses('ArrowUp') || keyboard.presses('W') || keyboard.presses('Space');
    const jumpHeld    = keyboard.ArrowUp || keyboard.W || keyboard.Space;

    if (jumpPressed) this.lastJumpPressTime = now;
    const jumpBufferOk = (now - this.lastJumpPressTime) < this.jumpBufferTime;

    const wallJumpAge = now - this.lastWallJumpTime;
    const inArc = this.wallJumpForceDir !== 0 && wallJumpAge < this.wallJumpDuration;

    // --- Horizontal movement: air control is reduced while the wall jump arc is active ---
    if (left || right) {
      const targetVx = left ? -this.speed : this.speed;
      const accel = this.isGrounded ? 1.0 : (inArc ? 0.18 : 0.55);
      this.sprite.vel.x += (targetVx - this.sprite.vel.x) * accel;
    } else {
      this.sprite.vel.x *= this.isGrounded ? 0.72 : 0.92;
    }

    // --- Ease-out wall jump force on top of instant velocity: (1-t)² curve ---
    if (inArc) {
      const t = wallJumpAge / this.wallJumpDuration;
      const force = this.wallJumpAccel * Math.pow(1 - t, 2);
      this.sprite.vel.x += this.wallJumpForceDir * force;
    }

    // --- Wall slide: pressing into wall slows descent ---
    const pressingTowardWall = (effectiveWall === 1 && left) || (effectiveWall === -1 && right);
    if (effectiveWall && !this.isGrounded && pressingTowardWall) {
      if (this.sprite.vel.y > this.wallSlideMaxSpeed) {
        this.sprite.vel.y = this.wallSlideMaxSpeed;
      }
    }

    // --- Ground jump (coyote + buffer) ---
    if ((this.isGrounded || coyoteOk) && jumpBufferOk) {
      this.sprite.vel.y = -this.jumpPower;
      this.lastGroundedTime = 0;
      this.lastJumpPressTime = 0;
    // --- Wall jump: set vertical, reset horizontal, start decaying force ---
    } else if (effectiveWall && !this.isGrounded && jumpBufferOk) {
      this.sprite.vel.y = -this.wallJumpPower;
      this.sprite.vel.x = effectiveWall * this.wallJumpInstant;
      this.wallJumpForceDir = effectiveWall;
      this.lastWallJumpTime = now;
      this.lastWallDir = effectiveWall;
      this.lastJumpPressTime = 0;
    }

    // --- Variable jump height ---
    if (!jumpHeld && this.sprite.vel.y < -3) {
      this.sprite.vel.y *= 0.85;
    }

    this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed);

    if (this.sprite.y > 1000) {
      this.sprite.x = this.spawnX;
      this.sprite.y = this.spawnY;
      this.sprite.vel.x = 0;
      this.sprite.vel.y = 0;
    }
  }

  _followCamera(targetX, targetY, speed) {
    camera.x += (targetX - camera.x) * speed;
    // camera.y += (targetY - camera.y) * speed;
  }
}
