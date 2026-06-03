import { actionHeld, actionPressed } from './keybinds.js';
import { registerSfx } from './prefs.js';
import { computeRegions, applyRegionColors } from './recolor.js';
import { customization } from './customization.js';
import { playSfx } from './audio.js';
import { shake } from './juice.js';

export class Player {
  constructor(x, y, groundGroup, onDeath) {
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
    this.sprite.anis.MaskedMCdeath.frameDelay = 3;
    this.sprite.anis.MCattackani.frameDelay = 2;
    this.sprite.anis.MaskedMCSmashPart1.frameDelay = 1;
    this.sprite.anis.MaskedMCSmashPart2.frameDelay = 1;
    // Animation scales (stacks with sprite.scale so don't rescale after this)
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
    this._wasGrounded = false;   // previous-frame grounded state (landing-sound edge detect)
    this._fallVy = 0;            // downward speed captured just before a landing zeroes vel.y
    this.jumpAnimation = false;
    this.walkAnimation = false;
    this.idleAnimation = true;
    this.wallClimbAnimation = false;
    this.attackAnimation = false;
    this.smashAnimation1 = false;
    this.smashAnimation2 = false;

    this.isDying = false;

    this.flyMode = false;

    // Kill tracking
    this.kills = { slug: 0, mage: 0, bat: 0 };

    // Sound effects
    this.sfx = {
      death: new Audio('music/death.mp3'),
      downSlash: new Audio('music/downSlash.mp3'),
      jump: new Audio('music/jump.mp3'),
      attack: new Audio('music/attack.mp3'),
    };
    registerSfx(this.sfx.jump, 0.5);
    registerSfx(this.sfx.death, 0.8);
    registerSfx(this.sfx.downSlash, 0.8);
    registerSfx(this.sfx.attack, 0.8);

    // Death callback (stops bg music)
    this._onDeath = onDeath || (() => {});

    // Back-reference for collision callbacks
    this.sprite._player = this;

    this._skinCache = {};
  }

  // Recolor the knight's body / head / sword regions in place across all animations, reading the
  // chosen colors from `customization`. Region maps + pristine pixels are cached per sheet on first
  // call so recoloring never compounds. Returns true once at least one sheet was loaded (boot retry).
  applySkin() {
    const SKIN_ANIS = ['MaskedMCIdle', 'MaskedMCJump', 'MaskedMCWalking', 'MCwallclimb',
      'MaskedMCdeath', 'MCattackani', 'MaskedMCSmashPart1', 'MaskedMCSmashPart2'];
    let appliedAny = false;
    for (const name of SKIN_ANIS) {
      const ani = this.sprite.anis[name];
      if (!ani || !ani.spriteSheet) continue;
      const sheet = ani.spriteSheet;
      sheet.loadPixels();
      if (!sheet.pixels || sheet.pixels.length === 0) continue; // not loaded yet
      let cached = this._skinCache[name];
      if (!cached) {
        const orig = sheet.pixels.slice();
        const frames = [];
        for (let k = 0; k < ani.length; k++) frames.push(ani[k]);
        const map = computeRegions(orig, sheet.width, sheet.height, frames);
        cached = this._skinCache[name] = { orig, map };
      }
      applyRegionColors(cached.orig, sheet.pixels, cached.map, sheet.width, customization);
      sheet.updatePixels();
      appliedAny = true;
    }
    return appliedAny;
  }

  reset() {
    this.isDying = false;
    this._deathFalling = false;
    this.flyMode = false;
    this.kills = { slug: 0, mage: 0, bat: 0 };
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

  _recordKill(enemy) {
    const name = enemy.constructor.name.toLowerCase();
    if (name in this.kills) this.kills[name]++;
  }

  die() {
    if (this.isDying) return;
    this.isDying = true;
    this._deathFalling = true;
    this._onDeath();
    this.sfx.death.currentTime = 0;
    this.sfx.death.play();

    this.sprite.vel.x = 0;
    this.sprite.physics = DYNAMIC;

    this.sprite.changeAni('MaskedMCJump');
    this.sprite.ani.frame = this.sprite.ani.lastFrame;
    this.sprite.ani.pause();
  }

  dieInstant() {
    if (this.isDying) return;
    this.isDying = true;
    this._deathFalling = false;
    this._onDeath();
    this.sfx.death.currentTime = 0;
    this.sfx.death.play();

    this.sprite.vel.x = 0;
    this.sprite.vel.y = 0;
    this.sprite.physics = STATIC;

    this.sprite.changeAni('MaskedMCdeath');
    this.sprite.ani.frame = 0;
    this.sprite.ani.loop = false;
    this.sprite.ani.play();
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
    if (window.kx7q && keyboard.presses('`')) {
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

    if (!window.kx7q && this.flyMode) {
      this.flyMode = false;
    }

    if (this.flyMode) {
      const up    = actionHeld('jump');
      const down  = actionHeld('smash');
      const left  = actionHeld('left');
      const right = actionHeld('right');
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
        this._respawnReady = true;
      }
      return;
    }

    // Player edge positions
    const halfWidth  = this.sprite.w / 2;
    const halfHeight = this.sprite.h / 2;
    const playerBottom = this.sprite.y + halfHeight;
    const playerTop    = this.sprite.y - halfHeight;
    const playerLeft   = this.sprite.x - halfWidth;
    const playerRight  = this.sprite.x + halfWidth;

    const now = Date.now();

    // Ground and wall detection
    // Downward speed this frame, before any landing zeroes vel.y (used to pick the landing sound)
    this._fallVy = this.sprite.vel.y;
    this.isGrounded = false;
    let groundPlatVelY = 0;
    let landedPlat = null;
    let onWall = 0; // 0 = none, +1 = wall on left, -1 = wall on right

    for (const plat of this.groundGroup) {
      const platLeft   = plat.x - plat.w / 2;
      const platRight  = plat.x + plat.w / 2;
      const platTop    = plat.y - plat.h / 2;
      const platBottom = plat.y + plat.h / 2;

      const horizontalOverlap = playerRight > platLeft + 1 && playerLeft < platRight - 1;

      // Grounded check. The detection window is widened by both the platform's
      // speed and the player's own downward speed so a fast fall (up to terminal
      // velocity ~13px/frame) can't step clean across the ~14px window in a single
      // frame and read as airborne on the touchdown frame.
      const platVelY = Number.isFinite(plat.vel.y) ? plat.vel.y : 0;
      const platSpeed = Math.abs(platVelY);
      const fallSpeed = Math.max(0, this.sprite.vel.y);
      if (!this.isGrounded && horizontalOverlap &&
          playerBottom >= platTop - 6 - platSpeed &&
          playerBottom <= platTop + 8 + platSpeed + fallSpeed &&
          this.sprite.vel.y >= -1 - platSpeed) {
        this.isGrounded = true;
        groundPlatVelY = platVelY;
        landedPlat = plat;
      }

      // Wall detection
      if (!onWall) {
        const verticalOverlap = playerBottom > platTop + 2 && playerTop < platBottom - 2;
        if (Math.abs(playerLeft - platRight) < 9 && verticalOverlap) onWall =  1;
        else if (Math.abs(playerRight - platLeft) < 9 && verticalOverlap) onWall = -1;
      }
    }

    // On landing
    if (this.isGrounded) {
      this.lastGroundedTime = now;
      this.lastWallJumpTime = 0;
      this.wallJumpForceDir = 0;
      // Ride with moving platforms
      if (groundPlatVelY !== 0) {
        this.sprite.vel.y = groundPlatVelY;
      } else if (this.sprite.vel.y > 0) {
        this.sprite.vel.y = 0;
      }
      // Clear smash state
      if (this.smashAnimation1 || this.smashAnimation2) {
        this.smashAnimation1 = false;
        this.smashAnimation2 = false;
        this.jumpAnimation = false;
      }
    }

    // Landing sound — fire once on the grounded edge, skip jump-pad bounces (they have their own feel)
    if (!this._wasGrounded && this.isGrounded && this._fallVy > 4 && !this.sprite._jumpPadBounce) {
      let landSfx;
      if (this.sprite._onHoney) landSfx = 'landHoney';
      else if (this._texturePath(landedPlat).includes('walltexture')) landSfx = 'landWall';
      else landSfx = 'landStone';
      playSfx(landSfx);
      if (this._fallVy > 9) shake(3, 120);   // hard land — punch the camera
    }

    // Edge jump grace
    const edgeJumpAllowed = !this.isGrounded &&
      this.lastGroundedTime > 0 &&
      (now - this.lastGroundedTime) < this.edgeJumpGraceMs &&
      this.sprite.vel.y >= 0;

    // Re-grab cooldown
    const reGrabBlocked = (now - this.lastWallJumpTime) < this.reGrabCooldown &&
                          onWall === this.lastWallDir;
    const effectiveWall = reGrabBlocked ? 0 : onWall;


    // Input
    const left  = actionHeld('left');
    const right = actionHeld('right');
    const jumpPressed = actionPressed('jump');
    const jumpHeld    = actionHeld('jump');
    const attack = actionHeld('attack');
    const smash = actionPressed('smash');

    const onHoney = this.sprite._onHoney === true;
    this.sprite._onHoney = false;

    const currentSpeed = onHoney ?
    this.speed * 0.45 : this.speed;
    const currentJumpPower = onHoney ?
    this.jumpPower * 0.55 : this.jumpPower;
    const currentWallJumpPower = onHoney ?
    this.wallJumpPower * 0.55 : this.wallJumpPower;

    // Jump buffer
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
        this.sfx.downSlash.currentTime = 0;
        this.sfx.downSlash.play();
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

    // Smash hold + kill check
    if (this.smashAnimation2 && this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
      this.sprite.ani.pause();
      this.sprite.vel.y = 15;
      for (const enemy of enemies) {
        if (enemy.sprite.deleted || enemy.isDying) continue;
        const dx = Math.abs(this.sprite.x - enemy.sprite.x);
        const dy = enemy.sprite.y - this.sprite.y;
        if (dx < 28 && dy > 0 && dy < 40) {
          this._recordKill(enemy);
          enemy.die();
        }
      }
    }

    // Wall jump arc
    const wallJumpAge = now - this.lastWallJumpTime;
    const inArc = !this.isGrounded && this.wallJumpForceDir !== 0;

    if (inArc) {
      const decayedVx = this.wallJumpPeakVx * Math.exp(-this.wallJumpDecay * wallJumpAge);
      if (decayedVx < this.wallJumpEndVx) {
        this.wallJumpForceDir = 0;
      } else {
        const arcVx = this.wallJumpForceDir * decayedVx;
        if (this.wallJumpForceDir * this.sprite.vel.x < decayedVx) {
          this.sprite.vel.x = arcVx;
        }
      }
    }

    // Horizontal movement
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
      playSfx('swordSwing');
      this.sprite.changeAni('MCattackani');
      this.sprite.ani.frame = 0;
      this.sprite.ani.loop = false;
      this.sprite.ani.play();
      this.attackAnimation = true;
    }

    // Attack hitbox check — active for the whole swing so the hit lands the instant you press
    if (this.attackAnimation) {
      for (const enemy of enemies) {
        if (enemy.sprite.deleted || enemy.isDying) continue;
        const dx = this.sprite.x - enemy.sprite.x;
        const dy = this.sprite.y - enemy.sprite.y;
        if (Math.abs(dy) < 32) {
          if ((this.sprite.scale.x > 0 && dx < 0) || (this.sprite.scale.x < 0 && dx > 0)) {
            if (Math.abs(dx) < 48) {
              this._recordKill(enemy);
              enemy.die();
            }
          }
        }
      }
    }

      if (this.attackAnimation && (this.sprite.ani.name !== 'MCattackani' ||
          this.sprite.ani.frame >= this.sprite.ani.lastFrame)) {
        this.attackAnimation = false;
      }

    // Wall slide
    const pressingTowardWall = (effectiveWall === 1 && left) || (effectiveWall === -1 && right);
    if (effectiveWall && !this.isGrounded && pressingTowardWall) {
      if (this.sprite.vel.y > this.wallSlideMaxSpeed) {
        this.sprite.vel.y = this.wallSlideMaxSpeed;
      }
    }

    // Jump pad override
    if (this.sprite._jumpPadBounce) {
      this.sprite._jumpPadBounce = false;
      this._lastJumpPadTime = now;
      this.lastJumpPressTime = 0;
      this.lastGroundedTime = 0;
    }

    const recentJumpPad = (now - (this._lastJumpPadTime || 0)) < 300;

    if (effectiveWall && !this.isGrounded && jumpBufferOk) {
      this.sfx.jump.currentTime = 0;
      this.sfx.jump.play();
      this.sprite.vel.y = - currentWallJumpPower;
      this.sprite.vel.x = effectiveWall * this.wallJumpPeakVx;
      this.wallJumpForceDir = effectiveWall;
      this.lastWallJumpTime = now;
      this.lastWallDir = effectiveWall;
      this.lastJumpPressTime = 0;
    } else if (!recentJumpPad && (this.isGrounded || edgeJumpAllowed) && jumpBufferOk) {
      this.sfx.jump.currentTime = 0;
      this.sfx.jump.play();
      this.sprite.vel.y = - currentJumpPower;
      this.lastGroundedTime = 0;
      this.lastJumpPressTime = 0;
    }

    // Cancel arc on new wall
    if (effectiveWall && this.wallJumpForceDir !== 0 && effectiveWall !== this.lastWallDir) {
      this.wallJumpForceDir = 0;
    }

    // Variable jump height
    if (!jumpHeld && this.sprite.vel.y < -3 && !recentJumpPad) {
      this.sprite.vel.y *= 0.85;
    }

    // Wall climb animation
    const isWallClimbing = effectiveWall && !this.isGrounded && pressingTowardWall;
    if (isWallClimbing && !this.wallClimbAnimation) {
      if (this.smashAnimation1 || this.smashAnimation2) {
        this.smashAnimation1 = false;
        this.smashAnimation2 = false;
      }
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

    // Jump animation hold
    if (this.jumpAnimation && !this.wallClimbAnimation) {
      if (this.isGrounded) {
        this.jumpAnimation = false;
      } else if (this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
        this.sprite.ani.pause();
      }
    }

    // Ground animations
    if (!this.jumpAnimation && !this.wallClimbAnimation && !this.attackAnimation) {
      if (this.isGrounded && Math.abs(this.sprite.vel.x) > 0.5) {
        this.sprite.changeAni('MaskedMCWalking');
        this.walkAnimation = true;
      } else if (this.isGrounded) {
        this.sprite.changeAni('MaskedMCIdle');
        this.idleAnimation = true;
      } else if (!this.smashAnimation1 && !this.smashAnimation2) {
        // Falling pose
        this.sprite.changeAni('MaskedMCJump');
        this.sprite.ani.frame = this.sprite.ani.lastFrame;
        this.sprite.ani.pause();
        this.jumpAnimation = true;
      }
    }

    // Flip sprite to face movement direction
    if (left) this.sprite.scale.x = -1;
    else if (right) this.sprite.scale.x = 1;
      


    // Smooth camera follow on both axes
    this._followCamera(this.sprite.x + 10, this.sprite.y + 10, this.cameraSpeed);

    // Respawn if fallen off the map
    if (!this.flyMode && this.sprite.y > this.spawnY + 600) {
      this.die();
    }

    // Remember grounded state for next frame's landing-edge detection
    this._wasGrounded = this.isGrounded;

    // Terminal velocity
    this.sprite.vel.y = Math.min(this.sprite.vel.y, 13);
  }

  // Best-effort source path for a platform's texture. `plat.img` may be the raw path string
  // or a q5 Image object (whose source lives on .url / .src / .name), so probe each.
  _texturePath(plat) {
    const img = plat && plat.img;
    if (!img) return '';
    if (typeof img === 'string') return img;
    return img.url || img.src || img.name || '';
  }

  _followCamera(targetX, targetY, speed) {
    camera.x += (targetX - camera.x) * speed;
    camera.y += (targetY - camera.y) * speed;
  }
}
