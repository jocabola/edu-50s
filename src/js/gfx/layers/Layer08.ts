import { ThreeDOMLayer } from "@fils/gl-dom";
import { ThreeSketch } from "../ThreeSketch";
import {
    InstancedMesh, MeshBasicMaterial, Object3D,
    Box3, Vector3, BufferAttribute, DynamicDrawUsage, Mesh, DoubleSide
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RED, WHITE } from "../palette";
import { tempo } from "../FlashLayer";

const COUNT        = 4000;
const SPHERE_R     = 60;    // world units — radius of the ball we sit inside
const PIVOT_YAW    = 0.07;  // rad/sec main rotation speed
const PIVOT_TILT   = 0.18;  // amplitude of slow tilt oscillation (rad)
const SPIN_MAX     = 0.35;  // rad/sec — slow individual rotation per instance
const FOV_DEG      = 80;
const SCALE_MIN    = 0.35;
const SCALE_MAX    = 0.9;

export class Layer08 extends ThreeSketch {
    private pivot  = new Object3D();
    private imesh: InstancedMesh | null = null;
    private dummy  = new Object3D();

    private posX:  Float32Array;
    private posY:  Float32Array;
    private posZ:  Float32Array;
    private scale: Float32Array;
    private rotX:  Float32Array;
    private rotY:  Float32Array;
    private rotZ:  Float32Array;
    private spinX: Float32Array;
    private spinY: Float32Array;
    private spinZ: Float32Array;

    private prevTime  = 0;
    private phase     = 0;
    private lastBeat  = -1;
    private beatPulse = 1.0;  // global scale multiplier, spikes on beat then decays

    constructor(_gl: ThreeDOMLayer) {
        super(_gl);

        this.camera.fov  = FOV_DEG;
        this.camera.near = 0.5;
        this.camera.far  = SPHERE_R + 10;
        this.camera.updateProjectionMatrix();

        this.posX  = new Float32Array(COUNT);
        this.posY  = new Float32Array(COUNT);
        this.posZ  = new Float32Array(COUNT);
        this.scale = new Float32Array(COUNT);
        this.rotX  = new Float32Array(COUNT);
        this.rotY  = new Float32Array(COUNT);
        this.rotZ  = new Float32Array(COUNT);
        this.spinX = new Float32Array(COUNT);
        this.spinY = new Float32Array(COUNT);
        this.spinZ = new Float32Array(COUNT);

        // Uniform distribution on sphere surface
        for (let i = 0; i < COUNT; i++) {
            const theta     = Math.random() * Math.PI * 2;
            const phi       = Math.acos(2 * Math.random() - 1);
            this.posX[i]    = SPHERE_R * Math.sin(phi) * Math.cos(theta);
            this.posY[i]    = SPHERE_R * Math.cos(phi);
            this.posZ[i]    = SPHERE_R * Math.sin(phi) * Math.sin(theta);
            this.scale[i]   = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN);
            this.rotX[i]    = Math.random() * Math.PI * 2;
            this.rotY[i]    = Math.random() * Math.PI * 2;
            this.rotZ[i]    = Math.random() * Math.PI * 2;
            this.spinX[i]   = (Math.random() - 0.5) * SPIN_MAX * 2;
            this.spinY[i]   = (Math.random() - 0.5) * SPIN_MAX * 2;
            this.spinZ[i]   = (Math.random() - 0.5) * SPIN_MAX * 2;
        }

        this.scene.add(this.pivot);
        this.loadModel();
    }

    private loadModel() {
        new GLTFLoader().load('./assets/models/50.glb', (gltf) => {
            const meshObjects: Mesh[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(c => {
                if ((c as Mesh).isMesh) meshObjects.push(c as Mesh);
            });

            const geos = meshObjects.map(m => {
                const g = m.geometry.clone();
                g.applyMatrix4(m.matrixWorld);
                return g;
            });

            const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
            if (geos.length > 1) geos.forEach(g => g.dispose());

            // Centre and normalise to 1 unit tall
            const box = new Box3();
            box.setFromBufferAttribute(merged.getAttribute('position') as BufferAttribute);
            const center = new Vector3(), size = new Vector3();
            box.getCenter(center); box.getSize(size);
            merged.translate(-center.x, -center.y, -center.z);
            const s = 1 / size.y;
            merged.scale(s, s, s);

            const mat  = new MeshBasicMaterial({ side: DoubleSide });
            this.imesh = new InstancedMesh(merged, mat, COUNT);
            this.imesh.instanceMatrix.usage = DynamicDrawUsage;
            this.imesh.frustumCulled = false;

            for (let i = 0; i < COUNT; i++) {
                this.imesh.setColorAt(i, Math.random() < 0.5 ? WHITE : RED);
            }
            this.imesh.instanceColor!.needsUpdate = true;

            this.pivot.add(this.imesh);
        });
    }

    activate() {
        this.gl.renderer.setClearColor(0x000000, 1);
        this.pivot.rotation.set(0, 0, 0);
    }

    deactivate() {
        this.prevTime  = 0;
        this.phase     = 0;
        this.lastBeat  = -1;
        this.beatPulse = 1.0;
        this.camera.rotation.set(0, 0, 0);
        this.camera.position.set(0, 0, 0);
    }

    update(time: number) {
        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        // Beat detection
        this.phase += dt * tempo.bpm / 60;
        const beat = Math.floor(this.phase);
        if (beat !== this.lastBeat) {
            this.lastBeat  = beat;
            this.beatPulse = 1.35;
        }
        this.beatPulse += (1.0 - this.beatPulse) * Math.min(1, 8 * dt); // snappy decay

        // Sphere rotates around the camera — yaw + lazy tilt
        this.pivot.rotation.y += PIVOT_YAW * dt;
        this.pivot.rotation.x  = Math.sin(time * 0.09) * PIVOT_TILT;

        if (!this.imesh) return;

        for (let i = 0; i < COUNT; i++) {
            this.rotX[i] += this.spinX[i] * dt;
            this.rotY[i] += this.spinY[i] * dt;
            this.rotZ[i] += this.spinZ[i] * dt;

            this.dummy.position.set(this.posX[i], this.posY[i], this.posZ[i]);
            this.dummy.rotation.set(this.rotX[i], this.rotY[i], this.rotZ[i]);
            this.dummy.scale.setScalar(this.scale[i] * this.beatPulse);
            this.dummy.updateMatrix();
            this.imesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.imesh.instanceMatrix.needsUpdate = true;
    }
}
