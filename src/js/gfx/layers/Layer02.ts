import { ThreeDOMLayer } from "@fils/gl-dom";
import { Text } from "troika-three-text";
import { FlashLayer, DEFAULT_BPM } from "../FlashLayer";
import { WHITE } from "../palette";

const FONT_SIZE = 690;

export class Layer02 extends FlashLayer {
    label: Text;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl, DEFAULT_BPM * 1.1);

        this.label = new Text();
        this.label.text = "50";
        this.label.font = "./assets/fonts/font.woff";
        this.label.fontSize = FONT_SIZE;
        this.label.letterSpacing = -0.2;
        this.label.anchorX = "center";
        this.label.anchorY = "top-cap";
        this.label.position.y = FONT_SIZE * 0.35;
        this.label.color = WHITE;
        this.label.visible = false;
        this.scene.add(this.label);
        this.label.sync();
    }

    protected onBeat(beat: number, _beatRemaining: number) {
        const show = beat % 5 === 0;
        this.label.visible = show;

        if (show) {
            this.label.color = this.fg;
            this.label.sync();
        }
    }
}
