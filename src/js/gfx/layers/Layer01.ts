import { ThreeDOMLayer } from "@fils/gl-dom";
import { OrthographicCamera, PlaneGeometry, Mesh, MeshBasicMaterial } from "three";
import { gsap } from "gsap";
import { ThreeSketch } from "../ThreeSketch";
import { BLACK, WHITE, RED } from "../palette";

const W = 1920, H = 1080;
const BPM = 60;
const BASE_FREQ = BPM / 60;

export class Layer01 extends ThreeSketch {
    hStripe: Mesh;
    vStripe: Mesh;
    ortho: OrthographicCamera;

    private phase = 0;
    private prevTime = 0;
    private lastBeat = -1;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
        this.ortho = new OrthographicCamera(-W/2, W/2, H/2, -H/2, -1, 1);
        this.params.camera = this.ortho;

        this.hStripe = new Mesh(
            new PlaneGeometry(W * 0.8, H * 0.35),
            new MeshBasicMaterial({ color: WHITE })
        );
        this.vStripe = new Mesh(
            new PlaneGeometry(W * 0.35, H * 0.8),
            new MeshBasicMaterial({ color: WHITE })
        );

        this.hStripe.visible = false;
        this.vStripe.visible = false;
        this.scene.add(this.hStripe);
        this.scene.add(this.vStripe);
    }

    private flashStripe(mesh: Mesh, axis: 'x' | 'y', duration: number) {
        gsap.killTweensOf(mesh.scale);
        mesh.scale.set(1, 1, 1);
        gsap.to(mesh.scale, { [axis]: 0, duration, ease: "none" });
    }

    update(time: number) {
        const dt = time - this.prevTime;
        this.prevTime = time;

        const speed = BASE_FREQ;
        this.phase += speed * dt;

        const beat = Math.floor(this.phase);
        // time remaining in this beat, shrunk to 90% to ensure completion
        const beatRemaining = ((1 - (this.phase % 1)) / speed) * 0.9;

        const isRed = beat % 13 === 0;
        const bg = isRed ? RED : beat % 2 === 0 ? WHITE : BLACK;
        this.gl.renderer.setClearColor(bg, 1);

        const showStripe = beat % 5 === 0;
        const useVertical = beat % 11 === 0;
        const fg = bg === BLACK ? WHITE : BLACK;

        this.hStripe.visible = showStripe && !useVertical;
        this.vStripe.visible = showStripe && useVertical;

        if (showStripe && beat !== this.lastBeat) {
            (this.hStripe.material as MeshBasicMaterial).color = fg;
            (this.vStripe.material as MeshBasicMaterial).color = fg;
            if (useVertical) {
                this.flashStripe(this.vStripe, 'x', beatRemaining);
            } else {
                this.flashStripe(this.hStripe, 'y', beatRemaining);
            }
        }

        this.lastBeat = beat;
    }
}
