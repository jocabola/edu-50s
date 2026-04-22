import { ThreeDOMLayer } from "@fils/gl-dom";
import { PlaneGeometry, Mesh, ShaderMaterial, OrthographicCamera } from "three";
import { ThreeSketch } from "../ThreeSketch";
import { tempo } from "../FlashLayer";

const vert = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const frag = /* glsl */`
precision highp float;
uniform float uTime;
uniform float uBpm;
uniform float uBands;
varying vec2 vUv;

float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

// "5" as thick stroked polyline — top bar, left stroke, mid bar, bowl
float digit5(vec2 p) {
    float r = 0.055;
    float d = sdSeg(p, vec2(-0.14,  0.33), vec2( 0.14,  0.33)) - r;
    d = min(d, sdSeg(p, vec2(-0.14,  0.33), vec2(-0.14,  0.04)) - r);
    d = min(d, sdSeg(p, vec2(-0.14,  0.04), vec2( 0.14,  0.04)) - r);
    d = min(d, sdSeg(p, vec2( 0.14,  0.04), vec2( 0.19, -0.07)) - r);
    d = min(d, sdSeg(p, vec2( 0.19, -0.07), vec2( 0.16, -0.23)) - r);
    d = min(d, sdSeg(p, vec2( 0.16, -0.23), vec2( 0.04, -0.33)) - r);
    d = min(d, sdSeg(p, vec2( 0.04, -0.33), vec2(-0.10, -0.33)) - r);
    d = min(d, sdSeg(p, vec2(-0.10, -0.33), vec2(-0.17, -0.17)) - r);
    return d;
}

// "0" as a filled ring (outer rounded box minus inner rounded box)
float digit0(vec2 p) {
    float outer = sdRoundBox(p, vec2(0.20, 0.33), 0.10);
    float inner = sdRoundBox(p, vec2(0.10, 0.23), 0.08);
    return max(outer, -inner);
}

float sdf50(vec2 p) {
    return min(digit5(p - vec2(-0.34, 0.0)), digit0(p - vec2(0.34, 0.0)));
}

void main() {
    vec2 uv = (vUv - 0.5) * vec2(1.7778, 1.0);

    // beat tracking
    float beatPhase = uTime * uBpm / 60.0;
    float beatFrac  = fract(beatPhase);

    // noise displacement — kicks harder on the beat, settles quickly
    float noiseStr = 0.018 + exp(-beatFrac * 6.0) * 0.030;
    vec2 disp = vec2(
        noise(uv * 3.5 + uTime * 0.35) - 0.5,
        noise(uv * 3.5 + uTime * 0.35 + 7.3) - 0.5
    ) * noiseStr;

    float d = sdf50(uv + disp);
    float speed = uBpm / 60.0;

    // hard-stepped bands
    float t = d * uBands - uTime * speed * 2.0;
    float col = mod(floor(t), 2.0) < 1.0 ? 1.0 : 0.0;

    // colour: alternate white/black and red/black each beat
    float isRed = mod(floor(beatPhase), 2.0) < 1.0 ? 1.0 : 0.0;
    vec3 bright = mix(vec3(1.0), vec3(0.8, 0.0, 0.0), isRed);

    gl_FragColor = vec4(bright * col, 1.0);
}
`;

export class Layer03 extends ThreeSketch {
    private mat: ShaderMaterial;
    private bands = 16;
    private onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft')  this.bands = Math.max(8,   this.bands - 1);
        if (e.key === 'ArrowRight') this.bands = Math.min(128, this.bands + 1);
    };

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
        const ortho = new OrthographicCamera(-960, 960, 540, -540, -1, 1);
        this.params.camera = ortho;

        this.mat = new ShaderMaterial({
            vertexShader: vert,
            fragmentShader: frag,
            uniforms: {
                uTime:  { value: 0 },
                uBpm:   { value: tempo.bpm },
                uBands: { value: this.bands },
            },
            depthTest: false,
            depthWrite: false,
        });
        this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.mat));
    }

    activate()   { window.addEventListener('keydown', this.onKey); }
    deactivate() { window.removeEventListener('keydown', this.onKey); }

    update(time: number) {
        this.mat.uniforms.uTime.value  = time;
        this.mat.uniforms.uBpm.value   = tempo.bpm;
        this.mat.uniforms.uBands.value = this.bands;
    }
}
