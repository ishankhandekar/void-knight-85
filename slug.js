import { Enemy } from './enemy.js';

export class Slug extends Enemy {
    constructor(x, y, patrolLeft, patrolRight, groundGroup) {
        super(x, y, patrolLeft, patrolRight, groundGroup);
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
}