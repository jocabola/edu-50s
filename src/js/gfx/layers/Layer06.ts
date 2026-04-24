import { ThreeDOMLayer } from "@fils/gl-dom";
import {
    OrthographicCamera, Box3, Vector3, Matrix4,
    DoubleSide, Group, BufferGeometry, Vector2,
    Mesh as ThreeMesh, MeshBasicMaterial
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createNoise3D } from "simplex-noise";
import { ThreeSketch } from "../ThreeSketch";
import { WHITE, BLACK, RED } from "../palette";
import { W, H, tempo } from "../FlashLayer";

const HW = W / 2, HH = H / 2;
const TARGET_HEIGHT = 600;
const N_THREADS = 1000;
const N_SEGMENTS = 24;
const SPRING_REST = 0.3;
const THREAD_SCALE = 7;
const GRAVITY_STRENGTH = 0.016;
const GRAVITY_SPIN = 0.12;
const NOISE_STRENGTH = 0.48;
const NOISE_BOOST = 4.0;
const NOISE_SCALE = 0.12;
const NOISE_SPEED = 0.6;
const SLOW_RATIO = 0.3;
const FLASH_DURATION = 0.25;
const DAMPING = 0.975;
const CONSTRAINT_ITERS = 3;

function extractVertices(geo: BufferGeometry): Vector2[] {
    const pos = geo.getAttribute('position');
    const verts: Vector2[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
        const x = Math.round(pos.getX(i));
        const y = Math.round(pos.getY(i));
        const key = `${x},${y}`;
        if (!seen.has(key)) {
            seen.add(key);
            verts.push(new Vector2(x, y));
        }
    }
    return verts;
}

function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export class Layer06 extends ThreeSketch {
    private ortho: OrthographicCamera;
    private group: Group = new Group();
    private prevTime = 0;
    private noiseX = createNoise3D();
    private noiseY = createNoise3D();
    private slowPhase = 0;
    private slowBeat = -1;
    private flashTimer = 0;
    private labelMeshes: any[] = [];

    // Physics — pre-allocated per-thread Float32Arrays, zero GC in hot path
    private nThreads = 0;
    private curPos: Float32Array[] = [];
    private prevPos: Float32Array[] = [];
    private anchorX: number[] = [];
    private anchorY: number[] = [];

    // Rendering — direct references to Line2 interleaved buffers, updated in-place
    // LineGeometry stores segment pairs as [(p0,p1), (p1,p2), ...], (N_SEGMENTS-1)*6 floats
    private lineBuffers: Float32Array[] = [];
    private lineIBufs: any[] = [];

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);
        this.ortho = new OrthographicCamera(-HW, HW, HH, -HH, -1, 1);
        this.params.camera = this.ortho;
        this.gl.renderer.setClearColor(WHITE, 1);
        this.scene.add(this.group);
        this.group.scale.setScalar(THREAD_SCALE);
        this.loadThreads();
    }

    private loadThreads() {
        const mat = new LineMaterial({ linewidth: 2, color: 0x000000 });
        mat.resolution.set(W, H);

        const loader = new GLTFLoader();
        loader.load('./assets/models/50-02.glb', (gltf) => {
            const meshObjects: any[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(child => {
                if ((child as any).isMesh) meshObjects.push(child);
            });

            const bbox = new Box3();
            meshObjects.forEach(m => bbox.expandByObject(m));
            const size = new Vector3(), center = new Vector3();
            bbox.getSize(size); bbox.getCenter(center);
            const scale = TARGET_HEIGHT / size.y;
            const pixelMatrix = new Matrix4()
                .makeScale(scale, scale, scale)
                .setPosition(-center.x * scale, -center.y * scale, 0);

            let allVerts: Vector2[] = [];
            for (const meshObj of meshObjects) {
                const geo = meshObj.geometry.clone();
                geo.applyMatrix4(meshObj.matrixWorld);
                geo.applyMatrix4(pixelMatrix);
                allVerts = allVerts.concat(extractVertices(geo));

                const label = new ThreeMesh(geo, new MeshBasicMaterial({ color: BLACK, side: DoubleSide }));
                label.visible = false;
                label.renderOrder = 1;
                this.scene.add(label);
                this.labelMeshes.push(label);
            }

            shuffle(allVerts);
            const chosen = allVerts.slice(0, Math.min(N_THREADS, allVerts.length));
            console.log(`[Layer06] total unique verts: ${allVerts.length}, threads spawned: ${chosen.length}`);
            this.nThreads = chosen.length;

            for (let ti = 0; ti < this.nThreads; ti++) {
                const v = chosen[ti];
                const ax = v.x / THREAD_SCALE;
                const ay = v.y / THREAD_SCALE;
                this.anchorX.push(ax);
                this.anchorY.push(ay);

                const cur = new Float32Array(N_SEGMENTS * 3);
                const prev = new Float32Array(N_SEGMENTS * 3);
                for (let i = 0; i < N_SEGMENTS; i++) {
                    cur[i*3]     = ax;
                    cur[i*3 + 1] = ay - i * SPRING_REST;
                    prev[i*3]     = ax;
                    prev[i*3 + 1] = ay - i * SPRING_REST;
                }
                this.curPos.push(cur);
                this.prevPos.push(prev);

                // Build flat point list for initial LineGeometry.setPositions
                const pts: number[] = [];
                for (let i = 0; i < N_SEGMENTS; i++) pts.push(ax, ay - i * SPRING_REST, 0);

                const lgeo = new LineGeometry();
                lgeo.setPositions(pts);

                // Grab the backing InstancedInterleavedBuffer directly so we never
                // call setPositions() or computeLineDistances() again (both allocate)
                const attr = lgeo.getAttribute('instanceStart') as any;
                this.lineIBufs.push(attr.data);
                this.lineBuffers.push(attr.data.array as Float32Array);

                this.group.add(new Line2(lgeo, mat));
            }
        });
    }

    update(time: number) {
        if (this.nThreads === 0) return;

        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        this.slowPhase += (tempo.bpm * SLOW_RATIO / 60) * dt;
        const newSlowBeat = Math.floor(this.slowPhase);
        if (newSlowBeat !== this.slowBeat) {
            this.slowBeat = newSlowBeat;
            this.flashTimer = FLASH_DURATION;
        }

        const flashing = this.flashTimer > 0;
        this.flashTimer = Math.max(0, this.flashTimer - dt);

        this.gl.renderer.setClearColor(flashing ? RED : WHITE, 1);

        const strength = NOISE_STRENGTH * (flashing ? NOISE_BOOST : 1);
        const t = time * NOISE_SPEED;
        const gravAngle = time * GRAVITY_SPIN;
        const gx = Math.cos(gravAngle) * GRAVITY_STRENGTH;
        const gy = Math.sin(gravAngle) * GRAVITY_STRENGTH;
        const nT = this.nThreads;

        for (let ti = 0; ti < nT; ti++) {
            const cur = this.curPos[ti];
            const prev = this.prevPos[ti];
            const ax = this.anchorX[ti];
            const ay = this.anchorY[ti];

            // Verlet integrate — particle 0 stays pinned.
            // Forces are per-frame impulses (tuned constants), not physical accelerations,
            // so they are added directly without dt scaling.
            for (let i = 1; i < N_SEGMENTS; i++) {
                const k = i * 3;
                const px = cur[k],     ox = prev[k];
                const py = cur[k + 1], oy = prev[k + 1];
                const fx = gx + this.noiseX(px * NOISE_SCALE, py * NOISE_SCALE, t) * strength;
                const fy = gy + this.noiseY(px * NOISE_SCALE + 31.7, py * NOISE_SCALE + 17.3, t) * strength;
                prev[k]     = px;
                prev[k + 1] = py;
                cur[k]     = px + (px - ox) * DAMPING + fx;
                cur[k + 1] = py + (py - oy) * DAMPING + fy;
            }

            // Spring constraint relaxation — re-pin anchor after each pass
            for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
                for (let i = 0; i < N_SEGMENTS - 1; i++) {
                    const a = i * 3, b = (i + 1) * 3;
                    const dx = cur[b]     - cur[a];
                    const dy = cur[b + 1] - cur[a + 1];
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 1e-6) continue;
                    const diff = (dist - SPRING_REST) / dist * 0.5;
                    const cx = dx * diff, cy = dy * diff;
                    if (i > 0) { cur[a] += cx; cur[a + 1] += cy; }
                    cur[b]     -= cx;
                    cur[b + 1] -= cy;
                }
                cur[0] = ax; cur[1] = ay;
            }

            // Write physics positions into the Line2 interleaved buffer in-place.
            // Format: [(p0.x,p0.y,p0.z, p1.x,p1.y,p1.z), (p1.x,...), ...] — (N_SEGMENTS-1)*6 floats
            const buf = this.lineBuffers[ti];
            for (let i = 0; i < N_SEGMENTS - 1; i++) {
                const s = i * 3, d = i * 6;
                buf[d]     = cur[s];
                buf[d + 1] = cur[s + 1];
                buf[d + 3] = cur[s + 3];   // (i+1)*3
                buf[d + 4] = cur[s + 4];   // (i+1)*3+1
            }
            this.lineIBufs[ti].needsUpdate = true;
        }
    }
}
