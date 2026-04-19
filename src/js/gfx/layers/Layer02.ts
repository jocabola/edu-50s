import { ThreeDOMLayer } from "@fils/gl-dom";
import { ThreeSketch } from "../ThreeSketch";
import { BLACK } from "../palette";

export class Layer02 extends ThreeSketch {
    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
        this.gl.renderer.setClearColor(BLACK, 1);
    }

    update(time: number) {
    }
}
