import { ThreeDOMLayer } from "@fils/gl-dom";
import { Behaviour, Constraint, Particle } from "@fils/phy";
import { PhyThreeMesh, MeshParticle } from "@fils/phy-three";
import { createNoise2D } from "simplex-noise";
import {
    Mesh, MeshBasicMaterial, Box3, Vector3, Matrix4, DoubleSide,
    BufferGeometry, Float32BufferAttribute
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FlashLayer, DEFAULT_BPM, W, H } from "../FlashLayer";
import { RED } from "../palette";

const HW           = W / 2;
const HH           = H / 2;
const TARGET_HEIGHT = 500;
const DRAG          = 0.004;
const SPRING_STR    = 0.12;
const SHAPE_STR     = 0.025;
const WIND_STR      = 0.18;
const TURB_STR      = 0.02;
const BOUNCE        = 0.55;
const BEAT_IMPULSE  = 28;
const INIT_SPEED    = 1;

// Maintains body shape at whatever position/orientation it has drifted to.
// Pulls each particle toward (currentCOM + its rest-relative offset).
class ShapeBehaviour extends Behaviour {
    private comX = 0;
    private comY = 0;
    private rcx:  number;
    private rcy:  number;

    constructor(private pts: MeshParticle[], private strength: number) {
        super();
        let rx = 0, ry = 0;
        for (const p of pts) { rx += p.restPosition.x; ry += p.restPosition.y; }
        this.rcx = rx / pts.length;
        this.rcy = ry / pts.length;
    }

    prepare() {
        let cx = 0, cy = 0;
        for (const p of this.pts) { cx += p.position.x; cy += p.position.y; }
        this.comX = cx / this.pts.length;
        this.comY = cy / this.pts.length;
    }

    apply(p: Particle) {
        const mp = p as MeshParticle;
        mp.force.x += (this.comX + mp.restPosition.x - this.rcx - mp.position.x) * this.strength;
        mp.force.y += (this.comY + mp.restPosition.y - this.rcy - mp.position.y) * this.strength;
    }
}

// Smooth directional flight via simplex noise — each body gets a unique time offset
// so they drift independently even when starting at the same position.
class WindBehaviour extends Behaviour {
    private noise = createNoise2D();
    private age   = 0;

    constructor(private strength: number, private timeOffset: number) { super(); }

    prepare() { this.age++; }

    apply(p: Particle) {
        const t = this.age * 0.008 + this.timeOffset;
        p.force.x += this.noise(p.position.x * 0.0008 + t, 0.0) * this.strength;
        p.force.y += this.noise(p.position.y * 0.0008 + t, 1.7) * this.strength;
        p.force.x += (Math.random() - 0.5) * TURB_STR;
        p.force.y += (Math.random() - 0.5) * TURB_STR;
    }
}

// Reflects particle velocity off canvas walls (Verlet-friendly: adjusts prev, not force).
class WallConstraint extends Constraint {
    apply(p: Particle) {
        const vx = p.position.x - p.prev.x;
        const vy = p.position.y - p.prev.y;
        if (p.position.x < -HW) {
            p.position.x = -HW;
            p.prev.x = p.position.x + Math.abs(vx) * BOUNCE;
        } else if (p.position.x > HW) {
            p.position.x = HW;
            p.prev.x = p.position.x - Math.abs(vx) * BOUNCE;
        }
        if (p.position.y < -HH) {
            p.position.y = -HH;
            p.prev.y = p.position.y + Math.abs(vy) * BOUNCE;
        } else if (p.position.y > HH) {
            p.position.y = HH;
            p.prev.y = p.position.y - Math.abs(vy) * BOUNCE;
        }
    }
}

// Midpoint (Loop-topology) subdivision — each triangle → 4, sharing edge midpoints.
function subdivide(geo: BufferGeometry): BufferGeometry {
    const src  = geo.attributes.position;
    const idx  = geo.index!;
    const verts: number[] = [];
    const newIdx: number[] = [];
    const midCache = new Map<string, number>();

    for (let i = 0; i < src.count; i++)
        verts.push(src.getX(i), src.getY(i), src.getZ(i));

    const mid = (a: number, b: number): number => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (midCache.has(key)) return midCache.get(key)!;
        const i = verts.length / 3;
        verts.push(
            (src.getX(a) + src.getX(b)) / 2,
            (src.getY(a) + src.getY(b)) / 2,
            (src.getZ(a) + src.getZ(b)) / 2,
        );
        midCache.set(key, i);
        return i;
    };

    for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        newIdx.push(a, ab, ca,  b, bc, ab,  c, ca, bc,  ab, bc, ca);
    }

    const out = new BufferGeometry();
    out.setAttribute('position', new Float32BufferAttribute(verts, 3));
    out.setIndex(newIdx);
    return out;
}

interface SoftBody { phy: PhyThreeMesh; mesh: Mesh; }

export class Layer07 extends FlashLayer {
    private softBodies: SoftBody[] = [];

    constructor(_gl: ThreeDOMLayer) {
        super(_gl, DEFAULT_BPM);
        this.loadMesh();
    }

    private loadMesh() {
        new GLTFLoader().load('/assets/models/50.glb', (gltf) => {
            const meshObjects: Mesh[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(c => { if ((c as Mesh).isMesh) meshObjects.push(c as Mesh); });

            const bbox = new Box3();
            meshObjects.forEach(m => bbox.expandByObject(m));
            const size = new Vector3(), center = new Vector3();
            bbox.getSize(size); bbox.getCenter(center);
            const scale = TARGET_HEIGHT / size.y;
            const pixelMatrix = new Matrix4()
                .makeScale(scale, scale, scale)
                .setPosition(-center.x * scale, -center.y * scale, 0);

            meshObjects.forEach((mo, idx) => {
                let geo = mo.geometry.clone();
                geo.applyMatrix4(mo.matrixWorld);
                geo.applyMatrix4(pixelMatrix);
                geo = subdivide(geo);

                const mat = new MeshBasicMaterial({ color: this.fg, side: DoubleSide });
                const mesh = new Mesh(geo, mat);
                mesh.frustumCulled = false;
                this.scene.add(mesh);

                const phy = new PhyThreeMesh(mesh, {
                    dragGen:      () => DRAG,
                    springStrGen: () => SPRING_STR,
                });
                phy.springIterations     = 4;
                phy.constraintIterations = 2;

                phy.addBehaviour(new ShapeBehaviour(phy.particles, SHAPE_STR));
                phy.addBehaviour(new WindBehaviour(WIND_STR, idx * 37.3));
                phy.addConstraint(new WallConstraint());

                // kick each body in a different direction at birth
                const angle = (Math.PI * 2 / meshObjects.length) * idx + Math.random() * 0.5;
                const ivx = Math.cos(angle) * INIT_SPEED;
                const ivy = Math.sin(angle) * INIT_SPEED;
                for (const p of phy.particles) {
                    p.prev.x = p.position.x - ivx;
                    p.prev.y = p.position.y - ivy;
                }

                this.softBodies.push({ phy, mesh });
            });
        });
    }

    protected onBeat(_beat: number, _beatRemaining: number) {
        for (const { phy, mesh } of this.softBodies) {
            (mesh.material as MeshBasicMaterial).color = this.fg;

            for (const p of phy.particles) {
                p.force.x += (Math.random() - 0.5) * BEAT_IMPULSE;
                p.force.y += (Math.random() - 0.5) * BEAT_IMPULSE;
            }
        }
    }

    update(time: number) {
        super.update(time);

        const isRed = this.bg === RED;
        for (const { phy, mesh } of this.softBodies) {
            (mesh.material as MeshBasicMaterial).wireframe = isRed;
            phy.update();

            const pos = mesh.geometry.attributes.position;
            for (let i = 0; i < phy.particles.length; i++) {
                const p = phy.particles[i];
                pos.setXY(i, p.position.x, p.position.y);
            }
            pos.needsUpdate = true;
        }
    }
}
