import { Enemy } from './enemy.js';
import { playSfx } from './audio.js';
import { hitStop, shake } from './juice.js';

export class Slug extends Enemy {
    constructor(x, y, patrolLeft, patrolRight, groundGroup) {
        super(x, y, patrolLeft, patrolRight, groundGroup);
        this._useKillSfx = false;   // use the synth splat instead of the shared downSlash
        this._applySlugAni();
    }

    _applySlugAni() {
        this.sprite.addAni('Sprites/Slugani.png', 4, '32x32');
        this.sprite.anis.Slugani.frameDelay = 8;
        this.sprite.anis.Slugani.scale.x = 24 / 30;
        this.sprite.anis.Slugani.scale.y = 24 / 30;
        this.sprite.changeAni('Slugani');
    }

    reset() {
        super.reset();
        this._applySlugAni();
    }

    // Death: an explosive goo splat — squish flat while a wide burst of green
    // motes erupts under a brief white impact flash, with a punch of game-feel.
    _startDeath() {
        this._dur = 12;
        playSfx('splat');
        hitStop(60);
        shake(5, 160);
        this._flash({ size: 30, grow: 2.6, life: 6 });
        this._spawnParticles({ count: 18, color: '#7cb342', speed: 3.4, gravity: 0.42, size: 3, sizeJitter: 5, life: 18 });
    }

    _stepDeath(t) {
        const e = Math.min(1, t / this._dur);
        const ease = e * (2 - e);              // easeOut
        const sy = 1 - ease * 0.92;            // flatten 1 -> 0.08
        const sx = 1 + ease * 0.9;             // spread  1 -> 1.9
        this.sprite.scale.x = this._faceSign * sx;
        this.sprite.scale.y = sy;
        this.sprite.y = this._y0 + 12 * (1 - sy);  // keep the bottom edge planted
        this._setOpacity(1 - ease);
        return t >= this._dur;
    }
}