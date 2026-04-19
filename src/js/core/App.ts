import { ThreeDOMLayer } from "@fils/gl-dom";
import { ThreeSketch } from "../gfx/ThreeSketch";
import { Layer01 } from "../gfx/layers/Layer01";
import { Layer02 } from "../gfx/layers/Layer02";
import { Layer03 } from "../gfx/layers/Layer03";
import { Timer } from "@fils/ani";

export class App {
	gl: ThreeDOMLayer;
	layers: ThreeSketch[] = [];
	activeIndex: number = 0;
	clock: Timer = new Timer(false);

	constructor() {
		this.gl = new ThreeDOMLayer(document.querySelector('.view') as HTMLElement);
		this.gl.renderer.setClearColor(0x000000, 1);

		this.layers = [
			new Layer01(this.gl),
			new Layer02(this.gl),
			new Layer03(this.gl),
		];

		this.activeIndex = 2;

		window.addEventListener('keydown', (e) => {
			const n = parseInt(e.key);
			if (!isNaN(n) && n >= 1 && n <= this.layers.length) {
				this.activeIndex = n - 1;
			}
		});

		this.start();
		console.log('^_^ edu-50s ready — layers:', this.layers.length);
	}

	get activeLayer(): ThreeSketch {
		return this.layers[this.activeIndex];
	}

	start() {
		const animate = () => {
			requestAnimationFrame(animate);
			this.update();
		}
		requestAnimationFrame(animate);
		this.clock.start();
	}

	update() {
		this.clock.tick();
		const t = this.clock.currentTime;
		this.activeLayer.update(t);
		this.activeLayer.render();
	}
}