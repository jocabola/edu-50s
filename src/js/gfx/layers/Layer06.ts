import { ThreeDOMLayer } from "@fils/gl-dom";
import { MulticolorFil, FilThreePalette } from "@fil-studio/identity-blocks";
import {
    Color, OrthographicCamera, Box3, Vector3, Matrix4,
    DoubleSide, Group, BufferGeometry, Vector2,
    Mesh as ThreeMesh, MeshBasicMaterial
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createNoise3D } from "simplex-noise";
import { ThreeSketch } from "../ThreeSketch";
import { WHITE, BLACK, RED } from "../palette";
import { W, H, tempo } from "../FlashLayer";

const HW = W / 2, HH = H / 2;
const TARGET_HEIGHT = 600;
const N_THREADS = 100;
const N_SEGMENTS = 100;
const SPRING_REST = 0.5;
const THREAD_SCALE = 10;
const GRAVITY_STRENGTH = 0.016;
const GRAVITY_SPIN = 0.12;
const NOISE_STRENGTH = 0.48;
const NOISE_BOOST = 4.0;
const NOISE_SCALE = 0.12;
const NOISE_SPEED = 0.6;
const SLOW_RATIO = 0.3;
const FLASH_DURATION = 0.25;

const BLACK_PALETTE: FilThreePalette = [
    new Color(0x000000),
    new Color(0x0d0d0d),
    new Color(0x1a1a1a),
    new Color(0x080808),
    new Color(0x111111),
];

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
    private fils: MulticolorFil[] = [];
    private group: Group = new Group();
    private prevTime = 0;
    private noiseX = createNoise3D();
    private noiseY = createNoise3D();
    private slowPhase = 0;
    private slowBeat = -1;
    private flashTimer = 0;
    private wasFlashing = false;
    private anchors: { x: number, y: number }[] = [];
    private labelMeshes: any[] = [];

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
        const mat = new LineMaterial({ linewidth: 2, vertexColors: true });
        mat.resolution.set(W, H);

        const loader = new GLTFLoader();
        loader.load('/assets/models/50.glb', (gltf) => {
            const meshObjects: any[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(child => {
                if ((child as any).isMesh) meshObjects.push(child);
            });

            // Bake to pixel space (same as Layer04)
            const bbox = new Box3();
            meshObjects.forEach(m => bbox.expandByObject(m));
            const size = new Vector3(), center = new Vector3();
            bbox.getSize(size); bbox.getCenter(center);
            const scale = TARGET_HEIGHT / size.y;
            const pixelMatrix = new Matrix4()
                .makeScale(scale, scale, scale)
                .setPosition(-center.x * scale, -center.y * scale, 0);

            // Collect all unique vertices in pixel space
            let allVerts: Vector2[] = [];
            for (const meshObj of meshObjects) {
                const geo = meshObj.geometry.clone();
                geo.applyMatrix4(meshObj.matrixWorld);
                geo.applyMatrix4(pixelMatrix);
                allVerts = allVerts.concat(extractVertices(geo));

                // "50" visual — black, hidden by default, shown on red flash
                const label = new ThreeMesh(geo, new MeshBasicMaterial({ color: BLACK, side: DoubleSide, transparent: true, opacity: 0.2 }));
                label.visible = false;
                label.renderOrder = 1;
                this.scene.add(label);
                this.labelMeshes.push(label);
            }

            // Pick N_THREADS random vertices
            shuffle(allVerts);
            const chosen = allVerts.slice(0, Math.min(N_THREADS, allVerts.length));

            for (const v of chosen) {
                // Physics positions are in pixel/THREAD_SCALE units
                const phyX = v.x / THREAD_SCALE;
                const phyY = v.y / THREAD_SCALE;

                const positions: number[] = [];
                for (let i = 0; i < N_SEGMENTS; i++) {
                    positions.push(phyX, phyY - i * SPRING_REST, 0);
                }

                const fil = new MulticolorFil({
                    customPositions: positions,
                    addGravity: false,
                    palette: BLACK_PALETTE,
                    materialInstance: mat,
                });

                fil.particles[0].lock();
                this.anchors.push({ x: phyX, y: phyY });
                this.group.add(fil.fil);
                this.fils.push(fil);
            }
        });
    }

    update(time: number) {
        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        // Slow beat
        this.slowPhase += (tempo.bpm * SLOW_RATIO / 60) * dt;
        const newSlowBeat = Math.floor(this.slowPhase);
        if (newSlowBeat !== this.slowBeat) {
            this.slowBeat = newSlowBeat;
            this.flashTimer = FLASH_DURATION;
        }

        const flashing = this.flashTimer > 0;
        this.flashTimer = Math.max(0, this.flashTimer - dt);

        // Flash start — unlock anchors
        if (flashing && !this.wasFlashing) {
            for (const fil of this.fils) fil.particles[0].unlock();
        }

        // Flash end — snap anchors back and re-lock
        if (!flashing && this.wasFlashing) {
            for (let i = 0; i < this.fils.length; i++) {
                const p = this.fils[i].particles[0];
                p.setPosition(this.anchors[i].x, this.anchors[i].y, 0);
                p.lock();
            }
        }

        this.wasFlashing = flashing;

        this.gl.renderer.setClearColor(flashing ? RED : WHITE, 1);
        for (const m of this.labelMeshes) m.visible = flashing;

        const strength = NOISE_STRENGTH * (flashing ? NOISE_BOOST : 1);
        const t = time * NOISE_SPEED;
        const gravAngle = time * GRAVITY_SPIN;
        const gx = Math.cos(gravAngle) * GRAVITY_STRENGTH;
        const gy = Math.sin(gravAngle) * GRAVITY_STRENGTH;

        for (const fil of this.fils) {
            const particles = fil.particles;
            // include particle[0] when unlocked so it also gets pushed around
            const start = flashing ? 0 : 1;
            for (let i = start; i < particles.length; i++) {
                const p = particles[i];
                const nx = p.position.x * NOISE_SCALE;
                const ny = p.position.y * NOISE_SCALE;
                p.force.x += gx + this.noiseX(nx, ny, t) * strength;
                p.force.y += gy + this.noiseY(nx + 31.7, ny + 17.3, t) * strength;
            }
            fil.update(dt);
        }
    }
}
