import { registerSfx } from './prefs.js';

// Shared "blade connects" impact sound, reused for every enemy kill.
const killSfx = registerSfx(new Audio('music/downSlash.mp3'), 0.5);

export class Enemy {
  constructor(x, y, patrolLeft, patrolRight, groundGroup) {
    this.groundGroup = groundGroup;
    this.patrolLeft = patrolLeft;
    this.patrolRight = patrolRight;
    this.speed = 1.5;
    this.dir = 1; // 1 = right, -1 = left

    this.spawnX = x;
    this.spawnY = y;

    this.isDying = false;
    this._deathT = 0;
    this._particles = [];

    this._buildSprite(x, y);
  }

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

  reset() {
    this._clearParticles();
    this.isDying = false;
    this._deathT = 0;
    this._buildSprite(this.spawnX, this.spawnY);
    this.dir = 1;
  }

  update() {
    if (this.sprite.deleted) return;

    // Stationary enemy
    if (this.patrolLeft >= this.patrolRight) {
      this.sprite.vel.x = 0;
      return;
    }

    // Clamp to patrol bounds
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

    // Edge detection
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

    // Patrol movement
    this.sprite.vel.x = this.dir * this.speed;

  }

  // ---- Death effects -------------------------------------------------------

  // Replaces the old instant `enemy.sprite.delete()` at the kill sites: freeze
  // the enemy, make it non-lethal, play the kill SFX, then start the type death.
  die() {
    if (this.isDying) return;
    this.isDying = true;
    this._deathT = 0;
    this.sprite._dying = true;          // read by the enemy->player overlap guard
    this.sprite.vel.x = 0;
    this.sprite.vel.y = 0;
    this.sprite.collider = 'none';      // leave physics: frozen in place + harmless
    this._faceSign = (this.sprite.scale.x < 0) ? -1 : 1;
    this._x0 = this.sprite.x;
    this._y0 = this.sprite.y;
    if (this.sprite.ani) this.sprite.ani.pause();
    // Shared "blade connects" SFX for mage/bat. Subclasses that play their own
    // death sound (slug -> synth splat) opt out via `this._useKillSfx = false`.
    if (killSfx && this._useKillSfx !== false) {
      try { killSfx.currentTime = 0; killSfx.play().catch(() => {}); } catch (e) { /* ignore */ }
    }
    this._startDeath();
  }

  // Advances the death effect one frame (called from the enemy loop while dying).
  // Removes the sprite once the body gesture AND its particles have all finished.
  updateDeath() {
    if (this.sprite.deleted) return;
    this._deathT++;
    this._stepParticles();
    const bodyDone = this._stepDeath(this._deathT);
    if (bodyDone && this._particles.length === 0) {
      this.sprite.delete();
    }
  }

  // Per-enemy hooks. Default = a quick shrink + small colored burst so any future
  // enemy still gets a death; Slug/Bat/Mage override both for signature deaths.
  _startDeath() {
    this._dur = 12;
    this._spawnParticles({ count: 6, color: '#cccccc', speed: 2, gravity: 0.18, size: 4, life: 14 });
  }

  _stepDeath(t) {
    const dur = this._dur || 12;
    const e = Math.min(1, t / dur);
    const s = 1 - e * (2 - e);          // easeOut 1 -> 0
    this.sprite.scale.x = this._faceSign * s;
    this.sprite.scale.y = s;
    this._setOpacity(1 - e);
    return t >= dur;
  }

  // Spawn a brief white circle that scales UP then fades, centered on the enemy.
  // Tracked in `this._particles` so the normal _stepParticles/updateDeath cleanup
  // disposes it; used by overrides (slug splat) for a flash of impact.
  _flash({ size = 28, grow = 2.4, life = 6, color = '#ffffff' } = {}) {
    const p = new Sprite(this.sprite.x, this.sprite.y, size, size, 'n');
    p.color = color;
    p.strokeWeight = 0;
    p.rotationLock = true;
    p._vx = 0;
    p._vy = 0;
    p._grav = 0;
    p._flash = true;          // _stepParticles expands (instead of shrinks) these
    p._flashGrow = grow;
    p._life = life;
    p._age = 0;
    this._particles.push(p);
    return p;
  }

  // Spawn a ring of short-lived, physics-less colored motes at the enemy center.
  // `inward: true` makes them collapse toward the center (used for the mage).
  // `sizeJitter` adds a random 0..sizeJitter px to each mote's size for variety.
  _spawnParticles({ count, color, speed, gravity = 0, size = 4, life = 16, inward = false, radius = 18, sizeJitter = 0 }) {
    const cx = this.sprite.x, cy = this.sprite.y;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const sp = speed * (0.6 + Math.random() * 0.6);
      const ox = inward ? Math.cos(ang) * radius : 0;
      const oy = inward ? Math.sin(ang) * radius : 0;
      const psize = size + (sizeJitter ? Math.random() * sizeJitter : 0);
      const p = new Sprite(cx + ox, cy + oy, psize, psize, 'n');
      p.color = color;
      p.strokeWeight = 0;
      p.rotationLock = true;
      if (inward) {
        p._vx = -Math.cos(ang) * sp;
        p._vy = -Math.sin(ang) * sp;
        p._grav = 0;
      } else {
        p._vx = Math.cos(ang) * sp;
        p._vy = Math.sin(ang) * sp - sp * 0.35;   // slight upward bias
        p._grav = gravity;
      }
      p._life = life;
      p._age = 0;
      this._particles.push(p);
    }
  }

  _stepParticles() {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      if (p.deleted) { this._particles.splice(i, 1); continue; }
      p._age++;
      p.x += p._vx;
      p.y += p._vy;
      p._vy += p._grav;
      const f = Math.max(0, 1 - p._age / p._life);   // 1 -> 0 over its life
      if (p._flash) {
        const s = 1 + (p._flashGrow - 1) * (1 - f);   // expand 1 -> grow
        p.scale.x = s;
        p.scale.y = s;
        this._setSpriteOpacity(p, f);                 // fade out as it grows
      } else {
        p.scale.x = f;
        p.scale.y = f;
        this._setSpriteOpacity(p, f);
      }
      if (p._age >= p._life) { try { p.delete(); } catch (e) { /* ignore */ } this._particles.splice(i, 1); }
    }
  }

  _clearParticles() {
    if (!this._particles) { this._particles = []; return; }
    for (const p of this._particles) if (p && !p.deleted) p.delete();
    this._particles = [];
  }

  _setOpacity(o) { this._setSpriteOpacity(this.sprite, o); }

  _setSpriteOpacity(sprite, o) {
    // q5play sprites support `opacity`; guard in case the build doesn't so the
    // scale-based shrink remains the guaranteed-visible fallback.
    try { sprite.opacity = Math.max(0, Math.min(1, o)); } catch (e) { /* unsupported */ }
  }
}
