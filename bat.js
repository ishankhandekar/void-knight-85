import { Enemy } from './enemy.js';

export class Bat extends Enemy {
    constructor(x, y, patrolRadius, groundGroup) {
        super(x, y, x - patrolRadius, x + patrolRadius, groundGroup);
        this.patrolRadius = patrolRadius;
        this.anchorX = x;
        this.detectionRange = 200;
        this.chaseSpeed = 1;
        this.chasing = false;
        this._applyBatAni();
    }

    _buildSprite(x, y) {
        if (this.sprite && !this.sprite.deleted) this.sprite.delete();
        this.sprite = new Sprite(x, y, 40, 10, 'd');
        this.sprite.physics = 'kinematic';
        this.sprite.rotationLock = true;
        this.sprite.friction = 0;
        this.sprite.bounciness = 0;
        this.sprite.color = '#8e44ad';
        this.sprite.stroke = '#6c3483';
        this.sprite.strokeWeight = 2;
    }

    _applyBatAni() {
        this.sprite.addAni('Sprites/batani.png', 3, '32x32');
        this.sprite.anis.batani.frameDelay = 8;
        this.sprite.anis.batani.scale.x = 40 / 32;
        this.sprite.anis.batani.scale.y = 10 / 8;
        this.sprite.changeAni('batani');
        this.sprite.ani.loop = true;
        this.sprite.ani.play();
    }

    reset() {
        this.chasing = false;
        this.anchorX = this.spawnX;
        this.patrolLeft = this.spawnX - this.patrolRadius;
        this.patrolRight = this.spawnX + this.patrolRadius;
        super.reset();
        this._applyBatAni();
    }

    canSeePlayer(playerSprite) {
        const dx = playerSprite.x - this.sprite.x;
        const dy = playerSprite.y - this.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.detectionRange) return false;

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

    _hitsWall(vx, vy) {
        const halfW = this.sprite.w / 2;
        const halfH = this.sprite.h / 2;
        const nextX = this.sprite.x + vx * 2;
        const nextY = this.sprite.y + vy * 2;
        const nL = nextX - halfW;
        const nR = nextX + halfW;
        const nT = nextY - halfH;
        const nB = nextY + halfH;

        for (const plat of this.groundGroup) {
            const pL = plat.x - plat.w / 2;
            const pR = plat.x + plat.w / 2;
            const pT = plat.y - plat.h / 2;
            const pB = plat.y + plat.h / 2;
            if (nR > pL && nL < pR && nB > pT && nT < pB) return true;
        }
        return false;
    }

    _pushOutOfPlatforms() {
        const halfW = this.sprite.w / 2;
        const halfH = this.sprite.h / 2;
        const bL = this.sprite.x - halfW;
        const bR = this.sprite.x + halfW;
        const bT = this.sprite.y - halfH;
        const bB = this.sprite.y + halfH;

        for (const plat of this.groundGroup) {
            const pL = plat.x - plat.w / 2;
            const pR = plat.x + plat.w / 2;
            const pT = plat.y - plat.h / 2;
            const pB = plat.y + plat.h / 2;

            if (bR <= pL || bL >= pR || bB <= pT || bT >= pB) continue;

            const overlapLeft = bR - pL;
            const overlapRight = pR - bL;
            const overlapTop = bB - pT;
            const overlapBottom = pB - bT;
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

            if (minOverlap === overlapLeft) this.sprite.x -= overlapLeft;
            else if (minOverlap === overlapRight) this.sprite.x += overlapRight;
            else if (minOverlap === overlapTop) this.sprite.y -= overlapTop;
            else this.sprite.y += overlapBottom;
        }
    }

    update(player) {
        if (this.sprite.deleted) return;

        this._pushOutOfPlatforms();

        const playerSprite = player ? player.sprite : null;

        if (playerSprite && !player.flyMode && !player.isDying && this.canSeePlayer(playerSprite)) {
            this.chasing = true;
            const dx = playerSprite.x - this.sprite.x;
            const dy = playerSprite.y - this.sprite.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            let vx = (dx / dist) * this.chaseSpeed;
            let vy = (dy / dist) * this.chaseSpeed;

            if (this._hitsWall(vx, vy)) {
                vx = 0;
                vy = 0;
            }

            this.sprite.vel.x = vx;
            this.sprite.vel.y = vy;
            this.sprite.scale.x = dx > 0 ? 1 : -1;
            return;
        }

        if (this.chasing) {
            this.chasing = false;
            this.anchorX = this.sprite.x;
            this.patrolLeft = this.anchorX - this.patrolRadius;
            this.patrolRight = this.anchorX + this.patrolRadius;
            this.sprite.vel.y = 0;
        }

        if (this.patrolRadius <= 0) {
            this.sprite.vel.x = 0;
            this.sprite.vel.y = 0;
            return;
        }

        if (this._hitsWall(this.dir * this.speed, 0)) {
            this.dir *= -1;
            this.sprite.scale.x = this.dir;
        }

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

        this.sprite.vel.x = this.dir * this.speed;
        this.sprite.vel.y = 0;
    }
}
