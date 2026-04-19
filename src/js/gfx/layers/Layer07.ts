import { ThreeDOMLayer } from "@fils/gl-dom";
import {
    OrthographicCamera, WebGLRenderTarget, Mesh, PlaneGeometry,
    ShaderMaterial, HalfFloatType, LinearFilter, RGBAFormat,
    Scene, Box3, Vector3, Matrix4, DoubleSide, MeshBasicMaterial,
    Vector2, Color
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ThreeSketch } from "../ThreeSketch";
import { W, H } from "../FlashLayer";
import { RED, WHITE } from "../palette";

const SW = 1920, SH = 1080;
const TARGET_HEIGHT = 600;
const STEPS_PER_FRAME = 24;
const FEED = 0.0545;
const KILL = 0.0620;
const SLOW_BPM = 8;
const SLOW_FREQ = SLOW_BPM / 60;

// ── Shaders ─────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

const INIT_FRAG = /* glsl */`
uniform sampler2D uMask;
varying vec2 vUv;
void main() {
    float b = texture2D(uMask, vUv).r;
    gl_FragColor = vec4(1.0, b, 0.0, 1.0);
}`;

const SIM_FRAG = /* glsl */`
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uFeed;
uniform float uKill;
varying vec2 vUv;
void main() {
    vec2 s = texture2D(uState, vUv).rg;
    vec2 lap =
        texture2D(uState, vUv + vec2(-uTexel.x,  uTexel.y)).rg * 0.05 +
        texture2D(uState, vUv + vec2( 0.0,        uTexel.y)).rg * 0.20 +
        texture2D(uState, vUv + vec2( uTexel.x,   uTexel.y)).rg * 0.05 +
        texture2D(uState, vUv + vec2(-uTexel.x,   0.0     )).rg * 0.20 +
        s                                                         * -1.0 +
        texture2D(uState, vUv + vec2( uTexel.x,   0.0     )).rg * 0.20 +
        texture2D(uState, vUv + vec2(-uTexel.x,  -uTexel.y)).rg * 0.05 +
        texture2D(uState, vUv + vec2( 0.0,       -uTexel.y)).rg * 0.20 +
        texture2D(uState, vUv + vec2( uTexel.x,  -uTexel.y)).rg * 0.05;
    float a = s.r, b = s.g;
    float abb = a * b * b;
    float na = clamp(a + 1.0 * lap.r - abb + uFeed * (1.0 - a), 0.0, 1.0);
    float nb = clamp(b + 0.5 * lap.g + abb - (uKill + uFeed) * b, 0.0, 1.0);
    gl_FragColor = vec4(na, nb, 0.0, 1.0);
}`;

const DISPLAY_FRAG = /* glsl */`
uniform sampler2D uState;
uniform vec3 uBg;
uniform float uTime;
varying vec2 vUv;
void main() {
    float kick = abs(sin(uTime * 7.3)) * abs(sin(uTime * 3.1));
    float disp = 0.002 + kick * 0.004;
    vec2 dir = vec2(cos(uTime * 2.1), sin(uTime * 1.7)) * disp;
    float r = 1.0 - smoothstep(0.15, 0.45, texture2D(uState, vUv - dir).g);
    float g = 1.0 - smoothstep(0.15, 0.45, texture2D(uState, vUv       ).g);
    float b = 1.0 - smoothstep(0.15, 0.45, texture2D(uState, vUv + dir).g);
    gl_FragColor = vec4(mix(vec3(0.0), uBg, vec3(r, g, b)), 1.0);
}`;

// ── Layer ────────────────────────────────────────────────────────────────────

export class Layer07 extends ThreeSketch {
    private simCam   = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private simScene = new Scene();
    private rts: [WebGLRenderTarget, WebGLRenderTarget];
    private simMat!: ShaderMaterial;
    private displayMat!: ShaderMaterial;
    private displayQuad!: Mesh;
    private initScene: Scene | null = null;
    private src = 0;
    private ready = false;

    private prevTime = 0;
    private slowPhase = 0;
    private slowBeat = -1;
    private bgIsRed = false;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
        this.params.camera = this.simCam;

        const rtOpts = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat, type: HalfFloatType };
        this.rts = [
            new WebGLRenderTarget(SW, SH, rtOpts),
            new WebGLRenderTarget(SW, SH, rtOpts),
        ];

        this.simMat = new ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: SIM_FRAG,
            uniforms: {
                uState: { value: null },
                uTexel: { value: new Vector2(1 / SW, 1 / SH) },
                uFeed:  { value: FEED },
                uKill:  { value: KILL },
            },
        });

        const simQuad = new Mesh(new PlaneGeometry(2, 2), this.simMat);
        simQuad.frustumCulled = false;
        this.simScene.add(simQuad);

        this.displayMat = new ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: DISPLAY_FRAG,
            uniforms: {
                uState: { value: null },
                uBg:    { value: new Vector3(1, 1, 1) },
                uTime:  { value: 0 },
            },
        });
        this.displayQuad = new Mesh(new PlaneGeometry(2, 2), this.displayMat);
        this.displayQuad.frustumCulled = false;
        this.scene.add(this.displayQuad);

        this.loadMask();
    }

    private loadMask() {
        const renderer = this.gl.renderer;

        const loader = new GLTFLoader();
        loader.load('/assets/models/50.glb', (gltf) => {
            const meshObjects: any[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(c => { if ((c as any).isMesh) meshObjects.push(c); });

            const bbox = new Box3();
            meshObjects.forEach(m => bbox.expandByObject(m));
            const size = new Vector3(), center = new Vector3();
            bbox.getSize(size); bbox.getCenter(center);
            const scale = TARGET_HEIGHT / size.y;
            const pixelMatrix = new Matrix4()
                .makeScale(scale, scale, scale)
                .setPosition(-center.x * scale, -center.y * scale, 0);

            const maskCam = new OrthographicCamera(-SW/2, SW/2, SH/2, -SH/2, -1, 1);
            const maskRT  = new WebGLRenderTarget(SW, SH, { minFilter: LinearFilter, magFilter: LinearFilter });
            const maskScene = new Scene();

            for (const mo of meshObjects) {
                const geo = mo.geometry.clone();
                geo.applyMatrix4(mo.matrixWorld);
                geo.applyMatrix4(pixelMatrix);
                maskScene.add(new Mesh(geo, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide })));
            }

            renderer.setClearColor(0x000000, 1);
            renderer.setRenderTarget(maskRT);
            renderer.clear();
            renderer.render(maskScene, maskCam);

            const initMat = new ShaderMaterial({
                vertexShader: VERT,
                fragmentShader: INIT_FRAG,
                uniforms: { uMask: { value: maskRT.texture } },
            });
            const initQuad = new Mesh(new PlaneGeometry(2, 2), initMat);
            initQuad.frustumCulled = false;
            this.initScene = new Scene();
            this.initScene.add(initQuad);

            this.resetSim();
            this.ready = true;
        });
    }

    private resetSim() {
        if (!this.initScene) return;
        const renderer = this.gl.renderer;
        renderer.setRenderTarget(this.rts[0]);
        renderer.clear();
        renderer.render(this.initScene, this.simCam);
        renderer.setRenderTarget(null);
        this.src = 0;
    }

    update(time: number) {
        if (!this.ready) return;

        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        this.slowPhase += SLOW_FREQ * dt;
        const newSlowBeat = Math.floor(this.slowPhase);
        if (newSlowBeat !== this.slowBeat) {
            this.slowBeat = newSlowBeat;
            this.bgIsRed = !this.bgIsRed;
            if (this.slowBeat % 3 === 0) this.resetSim();
        }

        const bg = this.bgIsRed ? RED : WHITE;
        this.displayMat.uniforms.uBg.value.set(bg.r, bg.g, bg.b);
        this.displayMat.uniforms.uTime.value = time;

        const renderer = this.gl.renderer;
        let src = this.src;

        for (let i = 0; i < STEPS_PER_FRAME; i++) {
            const dst = 1 - src;
            this.simMat.uniforms.uState.value = this.rts[src].texture;
            renderer.setRenderTarget(this.rts[dst]);
            renderer.render(this.simScene, this.simCam);
            src = dst;
        }

        renderer.setRenderTarget(null);
        this.src = src;
        this.displayMat.uniforms.uState.value = this.rts[src].texture;
    }
}
