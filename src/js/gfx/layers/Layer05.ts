import { ThreeDOMLayer } from "@fils/gl-dom";
import { gsap } from "gsap";
import { MeshBasicMaterial } from "three";
import { Layer04 } from "./Layer04";
import { WHITE } from "../palette";

const SLOW_BPM = 20;
const SLOW_FREQ = SLOW_BPM / 60;
const FLASH_DURATION = 0.18;

export class Layer05 extends Layer04 {
    private slowPhase = 0;
    private slowBeat = -1;
    private flashTimer = 0;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
    }

    private irritateShapes() {
        const IMPULSE = 18000;
        for (let i = 0; i < this.meshes.length; i++) {
            const s = 1.4 + Math.random() * 0.6;
            gsap.killTweensOf(this.meshes[i].scale);
            this.meshes[i].scale.set(s, s, 1);
            gsap.to(this.meshes[i].scale, { x: 1, y: 1, duration: 0.8, ease: "elastic.out(1, 0.3)" });

            this.bodies[i].applyImpulse([
                (Math.random() - 0.5) * IMPULSE,
                (Math.random() - 0.5) * IMPULSE,
            ]);
        }
    }

    update(time: number) {
        const dt = Math.min(time - this.prevTime, 0.05);

        super.update(time);

        this.slowPhase += SLOW_FREQ * dt;
        const newSlowBeat = Math.floor(this.slowPhase);

        if (newSlowBeat !== this.slowBeat) {
            this.slowBeat = newSlowBeat;
            this.flashTimer = FLASH_DURATION;
            this.irritateShapes();
        }

        if (this.flashTimer > 0) {
            this.flashTimer -= dt;
            this.gl.renderer.setClearColor(WHITE, 1);
        }
    }
}
