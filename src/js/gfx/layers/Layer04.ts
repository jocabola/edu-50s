import { ThreeDOMLayer } from "@fils/gl-dom";
import { World, Body, Box, Circle, Convex, Plane } from "p2-es";
import { quickDecomp, makeCCW } from "poly-decomp-es";
import {
    Mesh, BoxGeometry, CircleGeometry, BufferGeometry,
    Float32BufferAttribute, MeshBasicMaterial, Box3, Vector3,
    DoubleSide, Matrix4
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FlashLayer, DEFAULT_BPM, W, H } from "../FlashLayer";

const HW = W / 2, HH = H / 2;
const SIZE = 75;
const COUNT = 120;
const TURB = 2500;
const ATTRACT = 800;
const ORBIT = 1200;
const SPAWN_MIN_R = 280;
const SPAWN_MAX_R = 460;
const TARGET_HEIGHT = 600; // desired "50" height in pixels

type Vec2 = [number, number];

function extractContours(geo: BufferGeometry, scale: number, ox: number, oy: number): Vec2[][] {
    const pos = geo.getAttribute('position');
    const idx = geo.index;

    const snap = (v: number) => Math.round(v * 10000) / 10000;
    const vkey = (i: number) => `${snap(pos.getX(i))},${snap(pos.getY(i))}`;
    const vpos = (i: number): Vec2 => [pos.getX(i) * scale + ox, pos.getY(i) * scale + oy];

    const edgeCount = new Map<string, number>();
    const edgeVerts = new Map<string, [number, number]>();

    const faceCount = (idx ? idx.count : pos.count) / 3;
    for (let f = 0; f < faceCount; f++) {
        const a = idx ? idx.getX(f * 3)     : f * 3;
        const b = idx ? idx.getX(f * 3 + 1) : f * 3 + 1;
        const c = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;

        for (const [i, j] of [[a, b], [b, c], [c, a]] as [number, number][]) {
            const ki = vkey(i), kj = vkey(j);
            const key = ki < kj ? `${ki}|${kj}` : `${kj}|${ki}`;
            edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
            if (!edgeVerts.has(key)) edgeVerts.set(key, [i, j]);
        }
    }

    // Build adjacency from boundary edges (count === 1)
    const adj = new Map<string, string[]>();
    const posMap = new Map<string, Vec2>();

    for (const [key, count] of edgeCount) {
        if (count !== 1) continue;
        const [i, j] = edgeVerts.get(key)!;
        const ki = vkey(i), kj = vkey(j);
        if (!adj.has(ki)) adj.set(ki, []);
        if (!adj.has(kj)) adj.set(kj, []);
        adj.get(ki)!.push(kj);
        adj.get(kj)!.push(ki);
        posMap.set(ki, vpos(i));
        posMap.set(kj, vpos(j));
    }

    // Walk contours
    const visited = new Set<string>();
    const contours: Vec2[][] = [];

    for (const startKey of adj.keys()) {
        if (visited.has(startKey)) continue;
        const contour: Vec2[] = [];
        let prev = '';
        let curr = startKey;

        while (!visited.has(curr)) {
            visited.add(curr);
            contour.push(posMap.get(curr)!);
            const neighbors = (adj.get(curr) || []).filter(n => n !== prev && !visited.has(n));
            if (!neighbors.length) break;
            prev = curr;
            curr = neighbors[0];
        }

        if (contour.length >= 3) contours.push(contour);
    }

    return contours;
}

export class Layer04 extends FlashLayer {
    protected world: World;
    protected bodies: Body[] = [];
    protected meshes: Mesh[] = [];
    protected labelMeshes: Mesh[] = [];
    protected prevTime = 0;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl, DEFAULT_BPM);

        this.world = new World({ gravity: [0, 0] });
        this.world.defaultContactMaterial.restitution = 0.5;
        this.world.defaultContactMaterial.friction = 0.05;

        this.addWalls();
        this.addShapes();
        this.loadLabel();
    }

    protected loadLabel() {
        const loader = new GLTFLoader();
        loader.load('/assets/models/50.glb', (gltf) => {
            const meshObjects: Mesh[] = [];
            gltf.scene.updateWorldMatrix(true, true);
            gltf.scene.traverse(child => {
                if ((child as Mesh).isMesh) meshObjects.push(child as Mesh);
            });

            // Compute combined bounding box in world space
            const bbox = new Box3();
            meshObjects.forEach(m => bbox.expandByObject(m));
            const size = new Vector3();
            const center = new Vector3();
            bbox.getSize(size);
            bbox.getCenter(center);

            const scale = TARGET_HEIGHT / size.y;
            const ox = -center.x * scale;
            const oy = -center.y * scale;

            // Pixel-space transform: (v - center) * scale
            const pixelMatrix = new Matrix4()
                .makeScale(scale, scale, scale)
                .setPosition(ox, oy, 0);

            for (const meshObj of meshObjects) {
                // Bake world matrix + pixel transform into a cloned geometry
                const geo = meshObj.geometry.clone();
                geo.applyMatrix4(meshObj.matrixWorld);
                geo.applyMatrix4(pixelMatrix);

                // Visual mesh (already in pixel space, no extra transform)
                const mat = new MeshBasicMaterial({ color: this.fg, side: DoubleSide });
                const visual = new Mesh(geo, mat);
                visual.renderOrder = 1;
                this.scene.add(visual);
                this.labelMeshes.push(visual);

                // Physics contours (vertices already in pixel space)
                const contours = extractContours(geo, 1, 0, 0);
                for (const contour of contours) {
                    makeCCW(contour);
                    const parts = quickDecomp(contour);
                    const body = new Body({ mass: 0 });
                    for (const part of parts) {
                        if (part.length >= 3) body.addShape(new Convex({ vertices: part }));
                    }
                    this.world.addBody(body);
                }
            }
        });
    }

    private addWalls() {
        const walls = [
            { pos: [0, -HH] as [number, number], angle: 0 },
            { pos: [0,  HH] as [number, number], angle: Math.PI },
            { pos: [-HW, 0] as [number, number], angle: -Math.PI / 2 },
            { pos: [ HW, 0] as [number, number], angle:  Math.PI / 2 },
        ];
        for (const { pos, angle } of walls) {
            const body = new Body({ mass: 0, position: pos, angle });
            body.addShape(new Plane());
            this.world.addBody(body);
        }
    }

    private addShapes() {
        for (let i = 0; i < COUNT; i++) {
            const roll = Math.random();
            const isCircle = roll < 0.33;
            const isTriangle = roll < 0.66 && !isCircle;
            const r = SIZE / 2;
            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnR = SPAWN_MIN_R + Math.random() * (SPAWN_MAX_R - SPAWN_MIN_R);
            const body = new Body({
                mass: 1,
                position: [Math.cos(spawnAngle) * spawnR, Math.sin(spawnAngle) * spawnR] as [number, number],
                damping: 0.8,
                angularDamping: 0.8,
                angle: Math.random() * Math.PI * 2,
            });

            let mesh: Mesh;
            if (isCircle) {
                body.addShape(new Circle({ radius: r }));
                mesh = new Mesh(new CircleGeometry(r, 48), new MeshBasicMaterial({ color: this.fg }));
            } else if (isTriangle) {
                const tr = r * 1.5;
                const verts: Vec2[] = [
                    [0, tr],
                    [-tr * Math.sin(Math.PI * 2 / 3), tr * Math.cos(Math.PI * 2 / 3)],
                    [ tr * Math.sin(Math.PI * 2 / 3), tr * Math.cos(Math.PI * 2 / 3)],
                ];
                body.addShape(new Convex({ vertices: verts }));
                const geo = new BufferGeometry();
                geo.setAttribute('position', new Float32BufferAttribute([
                    verts[0][0], verts[0][1], 0,
                    verts[1][0], verts[1][1], 0,
                    verts[2][0], verts[2][1], 0,
                ], 3));
                mesh = new Mesh(geo, new MeshBasicMaterial({ color: this.fg }));
            } else {
                body.addShape(new Box({ width: SIZE, height: SIZE }));
                mesh = new Mesh(new BoxGeometry(SIZE, SIZE), new MeshBasicMaterial({ color: this.fg }));
            }

            this.world.addBody(body);
            this.scene.add(mesh);
            this.bodies.push(body);
            this.meshes.push(mesh);
        }
    }

    protected onBeat(_beat: number, _beatRemaining: number) {
        for (const mesh of this.meshes) {
            (mesh.material as MeshBasicMaterial).color = this.fg;
        }
        for (const mesh of this.labelMeshes) {
            (mesh.material as MeshBasicMaterial).color = this.fg;
        }
    }

    update(time: number) {
        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        super.update(time);

        for (const body of this.bodies) {
            const [x, y] = body.position;
            const dist = Math.sqrt(x * x + y * y) || 1;
            const nx = x / dist, ny = y / dist;

            body.applyForce([
                -nx * ATTRACT + (-ny) * ORBIT + (Math.random() - 0.5) * TURB,
                -ny * ATTRACT +   nx  * ORBIT + (Math.random() - 0.5) * TURB,
            ]);
        }

        this.world.step(1 / 60, dt, 10);

        for (let i = 0; i < this.bodies.length; i++) {
            this.meshes[i].position.x = this.bodies[i].position[0];
            this.meshes[i].position.y = this.bodies[i].position[1];
            this.meshes[i].rotation.z = this.bodies[i].angle;
        }
    }
}
