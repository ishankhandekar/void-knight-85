import { Enemy } from './enemy.js';

export class Mage extends Enemy {
    constructor(x, y, patrolLeft, patrolRight, groundGroup) {
        super(x, y, patrolLeft, patrolRight, groundGroup);
        this.sprite.addAni('Sprites/magechargeattackani.png', 6, '32x32');
        this.sprite.anis.magechargeattackani.frameDelay = 8;
        this.sprite.anis.magechargeattackani.scale.x = 24 / 30;
        this.sprite.anis.magechargeattackani.scale.y = 24 / 30;
        this.sprite.changeAni('magechargeattackani');
        this.sprite.ani.frame = 0;
        this.sprite.ani.pause();

        this.detectionRange = 250;
        this.fireballSpeed = 4;
        this.cooldown = 0;
        this.cooldownTimer = 0;
        this.charging = false;
        this.fireballs = [];
        this.targetX = 0;
        this.targetY = 0;
    }

    canSeePlayer(playerSprite) {
        const dx = playerSprite.x - this.sprite.x;
        const dy = playerSprite.y - this.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.detectionRange) return false;

        // Raycast: step along the line and check for platform collisions
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
        if (this.sprite.deleted) return;

        if (this.cooldownTimer > 0) this.cooldownTimer--;

        // Update existing fireballs — remove if too far or hit a platform
        for (let i = this.fireballs.length - 1; i >= 0; i--) {
            const fb = this.fireballs[i];
            if (fb.deleted) {
                this.fireballs.splice(i, 1);
                continue;
            }

            const fdx = fb.x - fb._originX;
            const fdy = fb.y - fb._originY;
            if (fdx * fdx + fdy * fdy > 400 * 400) {
                fb.delete();
                this.fireballs.splice(i, 1);
                continue;
            }

            // Destroy on platform collision
            for (const plat of this.groundGroup) {
                const pL = plat.x - plat.w / 2;
                const pR = plat.x + plat.w / 2;
                const pT = plat.y - plat.h / 2;
                const pB = plat.y + plat.h / 2;
                if (fb.x > pL && fb.x < pR && fb.y > pT && fb.y < pB) {
                    fb.delete();
                    this.fireballs.splice(i, 1);
                    break;
                }
            }
        }

        const playerSprite = player ? player.sprite : null;

        if (this.charging) {
            this.sprite.vel.x = 0;

            if (this.sprite.ani.frame >= this.sprite.ani.lastFrame) {
                this.charging = false;
                this.cooldownTimer = this.cooldown;
                this.sprite.ani.frame = 0;
                this.sprite.ani.pause();

                // Fire toward saved target position
                const dx = this.targetX - this.sprite.x;
                const dy = this.targetY - this.sprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                const fb = new Sprite(this.sprite.x + this.dir * 14, this.sprite.y, 12, 12);
                fb.addAni('Sprites/fireball.png', 3, '32x32');
                fb.anis.fireball.frameDelay = 6;
                fb.anis.fireball.scale.x = 12 / 19;
                fb.anis.fireball.scale.y = 12 / 19;
                fb.changeAni('fireball');
                fb.physics = 'kinematic';
                fb.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                fb.rotationLock = true;
                fb.vel.x = (dx / dist) * this.fireballSpeed;
                fb.vel.y = (dy / dist) * this.fireballSpeed;
                fb._originX = fb.x;
                fb._originY = fb.y;

                if (player && !player.isDying && !player.flyMode) {
                    fb.overlaps(player.sprite, (fireball, pSprite) => {
                        if (player.isDying || player.flyMode || fireball.deleted) return;
                        player.die();
                        fireball.delete();
                    });
                }

                this.fireballs.push(fb);
            }
            return;
        }

        // Start charge if player is visible and cooldown is ready
        if (playerSprite && this.cooldownTimer <= 0 && this.canSeePlayer(playerSprite)) {
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

        // Normal patrol
        super.update();
    }
}
