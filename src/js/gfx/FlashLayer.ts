import { ThreeDOMLayer } from "@fils/gl-dom";
import { Color, OrthographicCamera } from "three";
import { ThreeSketch } from "./ThreeSketch";
import { BLACK, WHITE, RED } from "./palette";

export const W = 1920, H = 1080;
export const DEFAULT_BPM = 60;

export abstract class FlashLayer extends ThreeSketch {
    ortho: OrthographicCamera;
    protected beat = 0;
    protected prevBeat = -1;
    protected beatRemaining = 0;
    protected bg: Color = BLACK;
    protected fg: Color = WHITE;

    private phase = 0;
    private prevTime = 0;

    private freq: number;

    constructor(_gl: ThreeDOMLayer, bpm: number = DEFAULT_BPM) {
        super(_gl);
        this.freq = bpm / 60;
        this.ortho = new OrthographicCamera(-W/2, W/2, H/2, -H/2, -1, 1);
        this.params.camera = this.ortho;
    }

    protected abstract onBeat(beat: number, beatRemaining: number): void;

    update(time: number) {
        const dt = time - this.prevTime;
        this.prevTime = time;

        this.phase += this.freq * dt;
        this.beat = Math.floor(this.phase);
        this.beatRemaining = ((1 - (this.phase % 1)) / this.freq) * 0.9;

        const isRed = this.beat % 13 === 0;
        this.bg = isRed ? RED : this.beat % 2 === 0 ? WHITE : BLACK;
        this.fg = this.bg === BLACK ? WHITE : BLACK;
        this.gl.renderer.setClearColor(this.bg, 1);

        if (this.beat !== this.prevBeat) {
            this.onBeat(this.beat, this.beatRemaining);
            this.prevBeat = this.beat;
        }
    }
}
