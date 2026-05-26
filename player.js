export class Player {
  constructor(x, y, groundGroup) {
    this.sprite = new Sprite(x, y, 32, 32, 'd');
    this.sprite.rotationLock = true;
    this.sprite.friction = 0;
    this.sprite.bounciness = 0;
    this.sprite.color = '#e74c3c';
    this.sprite.stroke = '#c0392b';
    this.sprite.strokeWeight = 2;
    this.sprite.addAni('Sprites/MaskedMCIdle.png', 3, '32x32')
    this.sprite.addAni('Sprites/MaskedMCJump.png', 4, '32x32')
    this.sprite.addAni('Sprites/MaskedMCWalking.png', 8, '32x32')
    this.sprite.addAni('Sprites/MCwallclimb.png', 3, '32x32')
    this.sprite.addAni('Sprites/MaskedMCdeath.png', 23, '32x32')
    this.sprite.addAni('Sprites/MCattackani.png', 8, '32x32')
    this.sprite.addAni('Sprites/MaskedMCSmashPart1.png', 6, '32x32');
    this.sprite.addAni('Sprites/MaskedMCSmashPart2.png', 6, '32x32')
    this.sprite.anis.MaskedMCIdle.frameDelay = 10;
    this.sprite.anis.MaskedMCJump.frameDelay = 10;
    this.sprite.anis.MaskedMCWalking.frameDelay = 6;
    this.sprite.anis.MCwallclimb.frameDelay = 8;
    this.sprite.anis.MaskedMCdeath.frameDelay = 5;
    this.sprite.anis.MCattackani.frameDelay = 4;
    this.sprite.anis.MaskedMCSmashPart1.frameDelay = 1;
    this.sprite.anis.MaskedMCSmashPart2.frameDelay = 2;
    // No need to scale after this
    // if you scale sprite after this it applies on top (stacks)
    for (const key of ['MaskedMCIdle', 'MaskedMCJump', 'MaskedMCWalking', 'MCwallclimb', 'MaskedMCdeath', 'MCattackani', 'MaskedMCSmashPart1', 'MaskedMCSmashPart2']) {
      this.sprite.anis[key].scale.x = 32 / 19;
      this.sprite.anis[key].scale.y = 32 / 19;
    }
    this.sprite.changeAni('MaskedMCIdle');
    // this.sprite.debug = true
    this.spawnX = x;
    this.spawnY = y;
    this.groundGroup = groundGroup;

    // Movement
    this.speed = 3;
    this.jumpPower = 9;
    this.cameraSpeed = 0.1;

    // Edge jump grace time
    this.edgeJumpGraceMs = 150;
    this.lastGroundedTime = 0;

    // Jump buffer
    this.jumpBufferTime = 120;
    this.lastJumpPressTime = 0;

    // Wall slide
    this.wallSlideMaxSpeed = 1.5;

    // Wall jump — horizontal velocity starts at peak and decays exponentially until next collision
    this.wallJumpPower = this.jumpPower * 0.7;
    this.wallJumpPeakVx = 5;      // initial horizontal velocity right after the jump
    this.wallJumpDecay = 0.0004;   // exponential decay rate per ms: vx = peak * exp(-decay * age)
    this.wallJumpEndVx = 0.05;     // arc ends once decayed velocity falls below this
    this.wallJumpForceDir = 0;    // +1 or -1, 0 when arc is inactive

    // Prevent instantly re-grabbing the same wall
    this.reGrabCooldown = 30;
    this.lastWallJumpTime = 0;
    this.lastWallDir = 0;

    this.isGrounded = false;
    this.jumpAnimation = false;
    this.walkAnimation = false;
    this.idleAnimation = true;
    this.wallClimbAnimation = false;
    this.attackAnimation = false;
    this.smashAnimation1 = false;
    this.smashAnimation2 = false;

    this.isDying = false;

    this.flyMode = false;

    // Back-reference so collision callbacks in level.js can call die()
    this.sprite._player = this;
  }

  /** Full reset to exact spawn position — safe to call at any time. */
  reset() {
    this.isDying = false;
    this._deathFalling = false;
    this.flyMode = false;
    this.sprite.physics = 'dynamic';
    this.sprite.x = this.spawnX;
    this.sprite.y = this.spawnY;
    this.sprite.vel.x = 0;
    this.sprite.vel.y = 0;

    // Animation state
    this.jumpAnimation      = false;
    this.walkAnimation      = false;
    this.idleAnimation      = true;
    this.wallClimbAnimation = false;
    this.attackAnimation    = false;
    this.smashAnimation1    = false;
    this.smashAnimation2    = false;

    // Movement state
    this.wallJumpForceDir   = 0;
    this.lastWallJumpTime   = 0;
    this.lastWallDir        = 0;
    this.lastGroundedTime   = 0;
    this.lastJumpPressTime  = 0;
    this._lastJumpPadTime   = 0;
    this.isGrounded         = false;

    this.sprite.changeAni('MaskedMCIdle');
  }

  die() {
    if (this.isDying) return;
    this.isDying = true;
    this._deathFalling = true;

    this.sprite.vel.x = 0;
    this.sprite.physics = DYNAMIC;

    this.sprite.changeAni('MaskedMCJump');
    this.sprite.ani.frame = this.sprite.ani.lastFrame;
    this.sprite.ani.pause();
  }

  _isOnGround() {
    const halfW = this.sprite.w / 2;
    const halfH = this.sprite.h / 2;
    const bottom = this.sprite.y + halfH;
    for (const plat of this.groundGroup) {
      const pL = plat.x - plat.w / 2;
      const pR = plat.x + plat.w / 2;
      const pT = plat.y - plat.h / 2;
      if (this.sprite.x + halfW > pL && this.sprite.x - halfW < pR &&
          bottom >= pT - 6 && bottom <= pT + 8 && this.sprite.vel.y >= -1) {
        return true;
      }
    }
    return false;
  }

  update(enemies) {
    // Toggle fly mode with backtick
    if (keyboard.presses('`')) {
      this.flyMode = !this.flyMode;
      if (this.flyMode) {
        this.sprite.physics = 'kinematic';
        this.sprite.vel.x = 0;
        this.sprite.vel.y = 0;
      } else {
        this.sprite.physics = 'dynamic';
        this.sprite.vel.x = 0;
        this.sprite.vel.y = 0;
      }
    }

    if (this.flyMode) {
      const up    = keyboard.pressing('up')    || keyboard.pressing('w');
      const down  = keyboard.pressing('down')  || keyboard.pressing('s');
      const left  = keyboard.pressing('left')  || keyboard.pressing('a');
      const right = keyboard.pressing('right') || keyboard.pressing('d');
      const flySpeed = this.speed * 2.5;
      this.sprite.vel.x = right ? flySpeed : left ? -flySpeed : 0;
      this.sprite.vel.y = down  ? flySpeed : up   ? -flySpeed : 0;
      if (left)  this.sprite.scale.x = -1;
      if (right) this.sprite.scale.x =  1;
      this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed);
      return;
    }

    if (this.isDying) {
      if (this._deathFalling) {
        this.sprite.vel.x = 0;
        this.sprite.vel.y = Math.min(this.sprite.vel.y, 13);
        this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed);
        if (this._isOnGround() || this.sprite.y > this.spawnY + 600) {
          this._deathFalling = false;
          this.sprite.vel.x = 0;
          this.sprite.vel.y = 0;
          this.sprite.physics = STATIC;
          this.sprite.changeAni('MaskedMCdeath');
          this.sprite.ani.frame = 0;
          this.sprite.ani.loop = false;
          this.sprite.ani.play();
        }
      } else if (this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
        this.isDying = false;
        this._deathFalling = false;
        this.sprite.physics = DYNAMIC;
        this.sprite.x = this.spawnX;
        this.sprite.y = this.spawnY;
        this.sprite.vel.x = 0;
        this.sprite.vel.y = 0;
        this.jumpAnimation = false;
        this.wallClimbAnimation = false;
        this.idleAnimation = true;
        this.sprite.changeAni('MaskedMCIdle');
      }
      return;
    }

    // Player edge positions (sprite is 32x32, centered)
    const halfWidth  = this.sprite.w / 2;
    const halfHeight = this.sprite.h / 2;
    const playerBottom = this.sprite.y + halfHeight;
    const playerTop    = this.sprite.y - halfHeight;
    const playerLeft   = this.sprite.x - halfWidth;
    const playerRight  = this.sprite.x + halfWidth;

    const now = Date.now();

    // Check if player is on ground or touching a wall by comparing edges to every platform
    this.isGrounded = false;
    let groundPlatVelY = 0;
    let onWall = 0; // 0 = none, +1 = wall on left, -1 = wall on right

    for (const plat of this.groundGroup) {
      const platLeft   = plat.x - plat.w / 2;
      const platRight  = plat.x + plat.w / 2;
      const platTop    = plat.y - plat.h / 2;
      const platBottom = plat.y + plat.h / 2;

      const horizontalOverlap = playerRight > platLeft + 1 && playerLeft < platRight - 1;

      // Grounded if bottom is near platform top and not jumping upward
      // For moving platforms, widen the detection window by the platform's speed
      const platSpeed = Math.abs(plat.vel.y || 0);
      if (!this.isGrounded && horizontalOverlap &&
          playerBottom >= platTop - 6 - platSpeed && playerBottom <= platTop + 8 + platSpeed &&
          this.sprite.vel.y >= -1 - platSpeed) {
        this.isGrounded = true;
        groundPlatVelY = plat.vel.y || 0;
      }

      // Wall detected if player's side is within 9px of a platform edge
      // Guard removed from !this.isGrounded so fast ground-to-wall transitions don't miss detection
      if (!onWall) {
        const verticalOverlap = playerBottom > platTop + 2 && playerTop < platBottom - 2;
        if (Math.abs(playerLeft - platRight) < 9 && verticalOverlap) onWall =  1;
        else if (Math.abs(playerRight - platLeft) < 9 && verticalOverlap) onWall = -1;
      }
    }

    // On landing: save timestamp for edge jump grace period, cancel wall jump arc, stop downward velocity
    if (this.isGrounded) {
      this.lastGroundedTime = now;
      this.lastWallJumpTime = 0;
      this.wallJumpForceDir = 0;
      // Ride with moving platforms — match their vertical velocity instead of zeroing out
      if (groundPlatVelY !== 0) {
        this.sprite.vel.y = groundPlatVelY;
      } else if (this.sprite.vel.y > 0) {
        this.sprite.vel.y = 0;
      }
      // Clear smash state so idle/walk animation can resume
      if (this.smashAnimation1 || this.smashAnimation2) {
        this.smashAnimation1 = false;
        this.smashAnimation2 = false;
        this.jumpAnimation = false;
      }
    }

    // Edge jump grace time: allow jumping for 150ms after leaving the ground
    const edgeJumpAllowed = !this.isGrounded &&
      this.lastGroundedTime > 0 &&
      (now - this.lastGroundedTime) < this.edgeJumpGraceMs &&
      this.sprite.vel.y >= 0;

    // Block re-grabbing the same wall right after wall-jumping off it
    // Not really necessary but we will keep it
    const reGrabBlocked = (now - this.lastWallJumpTime) < this.reGrabCooldown &&
                          onWall === this.lastWallDir;
    const effectiveWall = reGrabBlocked ? 0 : onWall;


    // Arc cancellation moved to after wall-jump logic so momentum isn't stripped
    // before the new jump can fire (see below)

    // Read keyboard input (held = continuous, presses = first frame only)
    const left  = keyboard.pressing('left')  || keyboard.pressing('a');
    const right = keyboard.pressing('right') || keyboard.pressing('d');
    const jumpPressed = keyboard.presses('up') || keyboard.presses('w') || keyboard.presses('space');
    const jumpHeld    = keyboard.pressing('up') || keyboard.pressing('w') || keyboard.pressing('space');
    const attack = keyboard.pressing('p')
    const smash = keyboard.presses('s') || keyboard.presses('down');

    //Slime effect from level.js
    const onSlime = this.sprite._onSlime === true;
    this.sprite._onSlime = false;

    const currentSpeed = onSlime ?
    this.speed * 0.45 : this.speed;
    const currentJumpPower = onSlime ?
    this.jumpPower * 0.55 : this.jumpPower;
    const currentWallJumpPower = onSlime ?
    this.wallJumpPower * 0.55 : this.wallJumpPower;

    // Jump buffer: remember jump press for 120ms so pressing slightly before landing still works
    if (jumpPressed) {
      this.lastJumpPressTime = now;
      this.sprite.changeAni('MaskedMCJump');
      this.sprite.ani.frame = 0;
      this.sprite.ani.play();
      this.jumpAnimation = true;
    }
    const jumpBufferOk = (now - this.lastJumpPressTime) < this.jumpBufferTime;

    if (smash && this.jumpAnimation && !this.smashAnimation1 && !this.smashAnimation2) {
      if (this.sprite.ani.frame == this.sprite.ani.lastFrame) {
        this.sprite.changeAni('MaskedMCSmashPart1');
        this.smashAnimation1 = true;
        this.sprite.ani.frame = 0;
        this.sprite.ani.loop = false;
        this.sprite.ani.play();
      }
    }

    if (this.smashAnimation1 && this.sprite.ani.frame == this.sprite.ani.lastFrame && !this.smashAnimation2) {
      this.sprite.changeAni('MaskedMCSmashPart2');
      this.smashAnimation1 = false;
      this.smashAnimation2 = true;
      this.sprite.ani.frame = 0;
      this.sprite.ani.loop = false;
      this.sprite.ani.play();
    }

    // When Part2 reaches last frame, hold it there — state clears on landing
    if (this.smashAnimation2 && this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
      this.sprite.ani.pause();
      // Smash kill: destroy any enemy directly below while the last frame is active
      for (const enemy of enemies) {
        if (enemy.sprite.deleted) continue;
        const dx = Math.abs(this.sprite.x - enemy.sprite.x);
        const dy = enemy.sprite.y - this.sprite.y;
        if (dx < 28 && dy > 0 && dy < 40) {
          enemy.sprite.delete();
        }
      }
    }

    // Wall jump arc: apply decaying horizontal push away from the wall
    const wallJumpAge = now - this.lastWallJumpTime;
    const inArc = !this.isGrounded && this.wallJumpForceDir !== 0;

    if (inArc) {
      const decayedVx = this.wallJumpPeakVx * Math.exp(-this.wallJumpDecay * wallJumpAge);
      if (decayedVx < this.wallJumpEndVx) {
        this.wallJumpForceDir = 0;
      } else {
        // Only override vel.x if the arc would push faster than current speed in that direction
        // Prevents the arc from slowing a fast-moving player mid-air
        const arcVx = this.wallJumpForceDir * decayedVx;
        if (this.wallJumpForceDir * this.sprite.vel.x < decayedVx) {
          this.sprite.vel.x = arcVx;
        }
      }
    }

    // Horizontal movement: full control on ground, reduced during wall jump arc, moderate in air
    const arcActive = this.wallJumpForceDir !== 0 && !this.isGrounded;
    if (left || right) {
      //const targetVx = left ? -this.speed : this.speed;
      const targetVx = left ?
        -currentSpeed : currentSpeed;
      const accel = this.isGrounded ? 1.0 : (arcActive ? 0.2 : 0.55);
      this.sprite.vel.x += (targetVx - this.sprite.vel.x) * accel;
    } else if (!arcActive) {
      this.sprite.vel.x *= this.isGrounded ? 0.72 : 0.92;
    }

    // Attack
    if (attack && !this.attackAnimation) {
      this.sprite.changeAni('MCattackani');
      this.sprite.ani.frame = 0;
      this.sprite.ani.loop = false;
      this.sprite.ani.play();
      this.attackAnimation = true;
    }

    // While attacking: check for enemies in range, then reset when animation finishes
    if (this.attackAnimation && this.sprite.ani.frame > 3) {
      for (const enemy of enemies) {
        if (enemy.sprite.deleted) continue;
        const dx = this.sprite.x - enemy.sprite.x;
        const dy = this.sprite.y - enemy.sprite.y;
        if (Math.abs(dy) < 32) {
          if ((this.sprite.scale.x > 0 && dx < 0) || (this.sprite.scale.x < 0 && dx > 0)) {
            if (Math.abs(dx) < 48) {
              enemy.sprite.delete();
            }
          }
        }
      }
    }

      if (this.attackAnimation && (this.sprite.ani.name !== 'MCattackani' ||
          this.sprite.ani.frame >= this.sprite.ani.lastFrame)) {
        this.attackAnimation = false;
      }

    // Wall slide: pressing into a wall while airborne caps fall speed
    const pressingTowardWall = (effectiveWall === 1 && left) || (effectiveWall === -1 && right);
    if (effectiveWall && !this.isGrounded && pressingTowardWall) {
      if (this.sprite.vel.y > this.wallSlideMaxSpeed) {
        this.sprite.vel.y = this.wallSlideMaxSpeed;
      }
    }

    // Ground jump (uses edge jump grace period + jump buffer) or wall jump (pushes away from wall)
    // Skip player jump if a jump pad just bounced us — prevents velocity stacking
    if (this.sprite._jumpPadBounce) {
      this.sprite._jumpPadBounce = false;
      this._lastJumpPadTime = now;
      this.lastJumpPressTime = 0;
      this.lastGroundedTime = 0;
    }

    const recentJumpPad = (now - (this._lastJumpPadTime || 0)) < 300;

    if (effectiveWall && !this.isGrounded && jumpBufferOk) {
      this.sprite.vel.y = - currentWallJumpPower;
      this.sprite.vel.x = effectiveWall * this.wallJumpPeakVx;
      this.wallJumpForceDir = effectiveWall;
      this.lastWallJumpTime = now;
      this.lastWallDir = effectiveWall;
      this.lastJumpPressTime = 0;
    } else if (!recentJumpPad && (this.isGrounded || edgeJumpAllowed) && jumpBufferOk) {
      this.sprite.vel.y = - currentJumpPower;
      this.lastGroundedTime = 0;
      this.lastJumpPressTime = 0;
    }

    // Cancel arc when touching a new wall — placed after wall-jump so the new jump fires first
    if (effectiveWall && this.wallJumpForceDir !== 0 && effectiveWall !== this.lastWallDir) {
      this.wallJumpForceDir = 0;
    }

    // Variable jump height: releasing jump early cuts upward velocity for shorter hops
    // Don't cut velocity during a jump pad bounce
    if (!jumpHeld && this.sprite.vel.y < -3 && !recentJumpPad) {
      this.sprite.vel.y *= 0.85;
    }

    // Wall climb animation: play once and freeze on last frame while pressing into wall
    const isWallClimbing = effectiveWall && !this.isGrounded && pressingTowardWall;
    if (isWallClimbing && !this.wallClimbAnimation) {
      this.sprite.changeAni('MCwallclimb');
      this.sprite.ani.frame = 0;
      this.sprite.ani.play();
      this.wallClimbAnimation = true;
    }
    if (!isWallClimbing) {
      this.wallClimbAnimation = false;
    }
    if (this.wallClimbAnimation && this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
      this.sprite.ani.pause();
    }

    // Hold jump animation on last frame while airborne, return to idle/walk on landing
    if (this.jumpAnimation && !this.wallClimbAnimation) {
      if (this.isGrounded) {
        this.jumpAnimation = false;
      } else if (this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
        this.sprite.ani.pause();
      }
    }

    // Animate walking or idle when on the ground
    if (!this.jumpAnimation && !this.wallClimbAnimation && !this.attackAnimation) {
      if (this.isGrounded && Math.abs(this.sprite.vel.x) > 0.5) {
        this.sprite.changeAni('MaskedMCWalking');
        this.walkAnimation = true;
      } else if (this.isGrounded) {
        this.sprite.changeAni('MaskedMCIdle');
        this.idleAnimation = true;
      } else if (!this.smashAnimation1 && !this.smashAnimation2) {
        // Walked or fell off a ledge without jumping — snap to falling pose
        this.sprite.changeAni('MaskedMCJump');
        this.sprite.ani.frame = this.sprite.ani.lastFrame;
        this.sprite.ani.pause();
        this.jumpAnimation = true;
      }
    }

    // We flip the image based on the direction
    // No need to do 32/19 scale because the ani is already scaled to that so adding it here would cause them to stack
    if (left) this.sprite.scale.x = -1;
    else if (right) this.sprite.scale.x = 1;
      


    // Smooth camera follow on both axes
    this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed);

    // Respawn if fallen off the map
    if (!this.flyMode && this.sprite.y > this.spawnY + 600) {
      this.die();
    }

    // Terminal velocity: cap fall speed so player can't clip through platforms
    this.sprite.vel.y = Math.min(this.sprite.vel.y, 13);
  }

  _followCamera(targetX, targetY, speed) {
    camera.x += (targetX - camera.x) * speed;
    camera.y += (targetY - camera.y) * speed;
  }
}
