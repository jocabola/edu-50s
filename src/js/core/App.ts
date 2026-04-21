import { ThreeDOMLayer } from "@fils/gl-dom";
import { ThreeSketch } from "../gfx/ThreeSketch";
import { Layer01 } from "../gfx/layers/Layer01";
import { Layer02 } from "../gfx/layers/Layer02";
import { Layer03 } from "../gfx/layers/Layer03";
import { Layer04 } from "../gfx/layers/Layer04";
import { Layer05 } from "../gfx/layers/Layer05";
import { Layer06 } from "../gfx/layers/Layer06";
import { Layer07 } from "../gfx/layers/Layer07";
import { Timer } from "@fils/ani";
import { tempo, MASTER_BPM } from "../gfx/FlashLayer";

export class App {
	gl: ThreeDOMLayer;
	layers: ThreeSketch[] = [];
	private _activeIndex: number = 0;
	clock: Timer = new Timer(false);

	get activeIndex() { return this._activeIndex; }
	set activeIndex(n: number) {
		if (this._activeIndex === n && this.layers[n].active) return;
		this.activeLayer.active = false;
		this.activeLayer.deactivate();
		this._activeIndex = n;
		this.activeLayer.active = true;
		this.activeLayer.activate();
	}

	constructor() {
		this.gl = new ThreeDOMLayer(document.querySelector('.view') as HTMLElement, {
			antialias: true
		});
		this.gl.renderer.setClearColor(0x000000, 1);

		this.layers = [
			new Layer01(this.gl),
			new Layer02(this.gl),
			new Layer03(this.gl),
			new Layer04(this.gl),
			new Layer05(this.gl),
			new Layer06(this.gl),
			new Layer07(this.gl),
		];

		for (const layer of this.layers) layer.active = false;
		this.activeIndex = 5;

		window.addEventListener('keydown', (e) => {
			const n = parseInt(e.key);
			if (!isNaN(n) && n >= 1 && n <= this.layers.length) {
				this.activeIndex = n - 1;
			}
			if (e.key === 'ArrowUp')   tempo.bpm = Math.min(300, tempo.bpm + 5);
			if (e.key === 'ArrowDown') tempo.bpm = Math.max(10,  tempo.bpm - 5);
			if (e.key === 'r')         tempo.bpm = MASTER_BPM;
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