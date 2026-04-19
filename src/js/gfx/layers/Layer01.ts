import { ThreeDOMLayer } from "@fils/gl-dom";
import { PlaneGeometry, Mesh, MeshBasicMaterial } from "three";
import { gsap } from "gsap";
import { FlashLayer, W, H } from "../FlashLayer";
import { WHITE } from "../palette";

export class Layer01 extends FlashLayer {
    hStripe: Mesh;
    vStripe: Mesh;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);

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

    protected onBeat(beat: number, beatRemaining: number) {
        const showStripe = beat % 5 === 0;
        const useVertical = beat % 11 === 0;

        this.hStripe.visible = showStripe && !useVertical;
        this.vStripe.visible = showStripe && useVertical;

        if (showStripe) {
            (this.hStripe.material as MeshBasicMaterial).color = this.fg;
            (this.vStripe.material as MeshBasicMaterial).color = this.fg;
            if (useVertical) {
                this.flashStripe(this.vStripe, 'x', beatRemaining);
            } else {
                this.flashStripe(this.hStripe, 'y', beatRemaining);
            }
        }
    }
}
