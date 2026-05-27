import { Enemy } from './enemy.js';

export class Mage extends Enemy {
    constructor(x, y, patrolLeft, patrolRight, groundGroup) {
        super(x, y, patrolLeft, patrolRight, groundGroup);

        const now = Date.now();
        this.detectionRange = 250;
        this.fireballSpeed = 4;
        this.cooldown = 500;
        this.lastFireTime = now;
        this.charging = false;
        this.fireballs = [];
        this.targetX = 0;
        this.targetY = 0;

        this._applyMageAni();
        this._fireballPool = [];
        this._initFireballPool();
    }

    // Pre-create hidden fireballs so animations are loaded before the first shot
    async _initFireballPool() {
        const POOL_SIZE = 3;
        const PARK_X = 5000;
        const PARK_Y = 5000;
        for (let i = 0; i < POOL_SIZE; i++) {
            const fb = new Sprite(PARK_X, PARK_Y, 12, 12);
            fb.physics = 'kinematic';
            fb.vel.x = 0;
            fb.vel.y = 0;
            fb.visible = false;
            await fb.addAni('Sprites/fireball.png', 3, '32x32');
            fb.anis.fireball.frameDelay = 6;
            fb.anis.fireball.scale.x = 12 / 19;
            fb.anis.fireball.scale.y = 12 / 19;
            fb.changeAni('fireball');
            fb.ani.pause();
            fb._inPool = true;
            this._fireballPool.push(fb);
        }
    }

    _getFireball(x, y) {
        for (const fb of this._fireballPool) {
            if (fb._inPool && !fb.deleted) {
                fb.x = x;
                fb.y = y;
                fb.vel.x = 0;
                fb.vel.y = 0;
                fb.rotation = 0;
                fb.visible = true;
                fb._inPool = false;
                fb._age = 0;
                fb.ani.play();
                return fb;
            }
        }
        // Pool exhausted fallback
        const fb = new Sprite(x, y, 12, 12);
        fb.physics = 'kinematic';
        fb.addAni('Sprites/fireball.png', 3, '32x32');
        fb.anis.fireball.frameDelay = 6;
        fb.anis.fireball.scale.x = 12 / 19;
        fb.anis.fireball.scale.y = 12 / 19;
        fb.changeAni('fireball');
        fb._inPool = false;
        fb._age = 0;
        return fb;
    }

    _returnFireball(fb) {
        if (this._fireballPool.includes(fb)) {
            fb.vel.x = 0;
            fb.vel.y = 0;
            fb.x = 5000;
            fb.y = 5000;
            fb.visible = false;
            fb._inPool = true;
            fb.ani.pause();
        } else {
            fb.delete();
        }
    }

    _applyMageAni() {
        this.sprite.addAni('Sprites/magechargeattackani.png', 5, '32x32');
        this.sprite.anis.magechargeattackani.frameDelay = 8;
        this.sprite.anis.magechargeattackani.scale.x = 24 / 30;
        this.sprite.anis.magechargeattackani.scale.y = 24 / 30;
        this.sprite.changeAni('magechargeattackani');
        this.sprite.ani.frame = 0;
        this.sprite.ani.pause();
    }

    reset() {
        // Clean up fireballs
        for (const fb of this.fireballs) {
            if (!fb.deleted && !fb._inPool) fb.delete();
        }
        this.fireballs = [];
        for (const fb of (this._fireballPool || [])) {
            if (!fb.deleted) fb.delete();
        }
        this._fireballPool = [];
        this.charging = false;
        this.targetX = 0;
        this.targetY = 0;

        super.reset();
        this._applyMageAni();
        this._initFireballPool();
    }

    canSeePlayer(playerSprite) {
        const dx = playerSprite.x - this.sprite.x;
        const dy = playerSprite.y - this.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.detectionRange) return false;

        // Raycast
        const stepSize = 8;
        const steps = Math.ceil(dist / stepSize);
        const stepX = dx / steps;
        const stepY = dy / steps;

        for (let i = 1; i < steps; i++) {
            const rx = this.sprite.x + stepX * i;
            const ry = this.sprite.y + stepY * i;

            for (const plat of this.groundGroup) {
                const pL = plat.x - plat.w / 2;
                const pR = plat.x + plat.w / 2;
                const pT = plat.y - plat.h / 2;
                const pB = plat.y + plat.h / 2;

                if (rx > pL && rx < pR && ry > pT && ry < pB) {
                    return false;
                }
            }
        }

        return true;
    }

    update(player) {
        const now = Date.now();

        if (this.sprite.deleted) return;

        // Update fireballs
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const fb = this.fireballs[i];
            if (fb.deleted) {
                this.fireballs.splice(i, 1);
                continue;
            }

            const fdx = fb.x - fb._originX;
            const fdy = fb.y - fb._originY;
            if (fdx * fdx + fdy * fdy > 400 * 400) {
                this._returnFireball(fb);
                this.fireballs.splice(i, 1);
                continue;
            }

            // Platform collision
            for (const plat of this.groundGroup) {
                const pL = plat.x - plat.w / 2;
                const pR = plat.x + plat.w / 2;
                const pT = plat.y - plat.h / 2;
                const pB = plat.y + plat.h / 2;
                if (fb.x > pL && fb.x < pR && fb.y > pT && fb.y < pB) {
                    this._returnFireball(fb);
                    this.fireballs.splice(i, 1);
                    break;
                }
            }
            if (!fb.deleted && !fb._inPool) fb._age = (fb._age || 0) + 1;
        }

        const playerSprite = player ? player.sprite : null;

        if (this.charging) {
            this.sprite.vel.x = 0;

            if (this.sprite.ani.frame >= this.sprite.ani.lastFrame && this.lastFireTime <= now - this.cooldown) {
                this.charging = false;
                this.lastFireTime = now;
                this.sprite.ani.frame = 0;
                this.sprite.ani.pause();

                // Fire
                const dx = this.targetX - this.sprite.x;
                const dy = this.targetY - this.sprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Spawn offset clears the mage's own collider
                const spawnOffset = 30;
                const originX = this.sprite.x;
                const originY = this.sprite.y - 8;
                const fb = this._getFireball(
                  originX + (dx / dist) * spawnOffset,
                  originY + (dy / dist) * spawnOffset
                );
                fb.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                fb.rotationLock = true;
                fb.vel.x = (dx / dist) * this.fireballSpeed;
                fb.vel.y = (dy / dist) * this.fireballSpeed;
                fb._originX = fb.x;
                fb._originY = fb.y;
                fb._age = 0;

                if (player && !player.isDying && !player.flyMode) {
                    fb.overlaps(player.sprite, (fireball, pSprite) => {
                        if (player.isDying || player.flyMode || fireball._inPool) return;
                        player.die();
                        this._returnFireball(fireball);
                        const idx = this.fireballs.indexOf(fireball);
                        if (idx !== -1) this.fireballs.splice(idx, 1);
                    });
                }

                this.fireballs.push(fb);
            }
            return;
        }

        // Start charge
        if (playerSprite && !player.flyMode && now - this.lastFireTime >= this.cooldown && this.canSeePlayer(playerSprite)) {
            this.charging = true;
            this.targetX = playerSprite.x;
            this.targetY = playerSprite.y;
            this.dir = playerSprite.x > this.sprite.x ? 1 : -1;
            this.sprite.scale.x = this.dir;
            this.sprite.changeAni('magechargeattackani');
            this.sprite.ani.frame = 0;
            this.sprite.ani.loop = false;
            this.sprite.ani.play();
            this.sprite.vel.x = 0;
            return;
        }

        // Patrol
        super.update();
    }
}
