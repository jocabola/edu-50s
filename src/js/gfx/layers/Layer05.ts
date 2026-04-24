import { ThreeDOMLayer } from "@fils/gl-dom";
import { World, Body, Box, Circle, Plane } from "p2-es";
import { Mesh, CircleGeometry, MeshBasicMaterial } from "three";
import { Text, preloadFont } from "troika-three-text";
import { gsap } from "gsap";
import { FlashLayer, DEFAULT_BPM, W, H, tempo } from "../FlashLayer";
import { BLACK, WHITE } from "../palette";

const HW           = W / 2;
const HH           = H / 2;
const MAX          = 512;
const HALF         = MAX >> 1;
const SIZE         = 55;             // fontSize in px (matches ortho pixel space)
const SPEED_MIN    = 80;             // px / s
const SPEED_MAX    = 220;            // px / s
const TURB_F       = 500;
const ATTRACT_F    = 400;            // attraction force toward dot
const REPEL_F      = 120;            // repulsion force away from dot
const RESTITUTION  = 0.55;
const FRICTION     = 0.1;
const COL_W        = 0.42;           // collider width  as fraction of fontSize
const COL_H        = 0.62;           // collider height as fraction of fontSize
const DOT_RADIUS_MIN   = 120;        // px minimum radius
const DOT_RADIUS_MAX   = 240;        // px maximum radius
const DOT_MASS         = 2;          // light enough to visibly drift with turbulence
const DOT_DAMPING      = 0.15;
const DOT_IDLE_BEATS   = 8;          // beats without a dot
const DOT_ACTIVE_BEATS = 12;         // beats the dot stays on screen
const DOT_ROAM_ATTRACT = 4000;       // centering pull on repeller dot (matches PhysicsLayer × mass)
const DOT_ROAM_ORBIT   = 6000;       // tangential orbit force on repeller dot

// ── Types ─────────────────────────────────────────────────────────────────────

interface Particle {
    mesh:      Mesh;
    body:      Body;
    alive:     boolean;
    baseScale: number;  // unitless multiplier; rendered px = SIZE * baseScale
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export class Layer05 extends FlashLayer {
    private world:      World;
    private pts:        Particle[] = [];
    private prevTime  = -1;
    private dotMesh:    Mesh;
    private dotBody:    Body;
    private dotInWorld    = false;
    private dotIsRepeller = false;
    private dotClock    = 0;
    private dotActive   = false;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl, DEFAULT_BPM);

        this.world = new World({ gravity: [0, 0] });
        this.world.defaultContactMaterial.restitution = RESTITUTION;
        this.world.defaultContactMaterial.friction    = FRICTION;
        this.addWalls();

        // Pre-allocate dot — shape is replaced per appearance with a random radius
        this.dotBody = new Body({ mass: DOT_MASS, damping: DOT_DAMPING, angularDamping: 1.0 });

        this.dotMesh = new Mesh(
            new CircleGeometry(1, 48),   // unit circle; sized via mesh.scale
            new MeshBasicMaterial({ color: BLACK }),
        );
        this.dotMesh.visible = false;
        this.scene.add(this.dotMesh);

        preloadFont({ characters: '50' }, () => {
            for (let i = 0; i < MAX; i++) {
                const body = new Body({ mass: 1, damping: 0.05, angularDamping: 0.2 });
                body.addShape(new Box({ width: SIZE * 0.75, height: SIZE * 0.9 }));


                const text = new Text();
                text.text      = i < HALF ? '5' : '0';
                text.fontSize  = SIZE;
                text.anchorX   = 'center';
                text.anchorY   = 'middle';
                text.color     = 0xffffff;
                text.visible   = false;
                text.sync();
                this.scene.add(text);

                this.pts.push({
                    mesh: text as unknown as Mesh,
                    body,
                    alive: false, baseScale: 0,
                });
            }

            for (let i = 0; i < 24; i++) this.spawn();
        });
    }

    private addWalls() {
        const defs: { pos: [number, number]; angle: number }[] = [
            { pos: [0, -HH], angle: 0 },
            { pos: [0,  HH], angle: Math.PI },
            { pos: [-HW, 0], angle: -Math.PI / 2 },
            { pos: [ HW, 0], angle:  Math.PI / 2 },
        ];
        for (const { pos, angle } of defs) {
            const b = new Body({ mass: 0, position: pos, angle });
            b.addShape(new Plane());
            this.world.addBody(b);
        }
    }

    private spawn() {
        const p = this.pts.find(p => !p.alive);
        if (!p) return;

        const angle = Math.random() * Math.PI * 2;
        const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);

        p.body.position[0]     = (Math.random() - 0.5) * (W - SIZE * 2);
        p.body.position[1]     = (Math.random() - 0.5) * (H - SIZE * 2);
        p.body.velocity[0]     = Math.cos(angle) * speed;
        p.body.velocity[1]     = Math.sin(angle) * speed;
        p.body.angle           = Math.random() * Math.PI * 2;
        p.body.angularVelocity = (Math.random() - 0.5) * 4;

        p.alive     = true;
        p.baseScale = 0.55 + Math.random() * 0.9;
        this.resizeCollider(p, p.baseScale);

        (p.mesh as unknown as Text).color = this.fg.getHex();
        p.mesh.position.set(p.body.position[0], p.body.position[1], 0);
        p.mesh.scale.set(0, 0, 1);
        p.mesh.visible = true;
        this.world.addBody(p.body);

        gsap.killTweensOf(p.mesh.scale);
        gsap.to(p.mesh.scale, {
            x: p.baseScale, y: p.baseScale, duration: 0.4, ease: "back.out(1.7)",
            onUpdate: () => this.resizeCollider(p, p.mesh.scale.x),
        });
    }

    private resizeCollider(p: Particle, visualScale: number) {
        const s = Math.max(visualScale, 0.01);
        if (p.body.shapes.length) p.body.removeShape(p.body.shapes[0]);
        p.body.addShape(new Box({ width: SIZE * COL_W * s, height: SIZE * COL_H * s }));
        p.body.aabbNeedsUpdate = true;
    }

    private resizeDotCollider(r: number) {
        if (!this.dotBody.shapes.length) return;
        const shape = this.dotBody.shapes[0] as Circle;
        shape.radius = Math.max(r, 0.1);
        shape.updateBoundingRadius();
        this.dotBody.aabbNeedsUpdate = true;
    }

    private showDot() {
        this.hideDot();

        const radius = DOT_RADIUS_MIN + Math.random() * (DOT_RADIUS_MAX - DOT_RADIUS_MIN);
        const margin = radius + 20;
        const x = (Math.random() - 0.5) * (W - margin * 2);
        const y = (Math.random() - 0.5) * (H - margin * 2);

        this.dotBody.position[0] = x;
        this.dotBody.position[1] = y;
        const spawnSpeed = 150 + Math.random() * 150;
        const spawnAngle = Math.random() * Math.PI * 2;
        this.dotBody.velocity[0] = Math.cos(spawnAngle) * spawnSpeed;
        this.dotBody.velocity[1] = Math.sin(spawnAngle) * spawnSpeed;

        // Start shape near-zero; onUpdate will grow it in sync with the mesh
        if (this.dotBody.shapes.length) this.dotBody.removeShape(this.dotBody.shapes[0]);
        this.dotBody.addShape(new Circle({ radius: 0.1 }));
        this.dotBody.aabbNeedsUpdate = true;

        this.world.addBody(this.dotBody);
        this.dotInWorld = true;
        this.dotIsRepeller = Math.random() < 0.45;
        (this.dotMesh.material as MeshBasicMaterial).color.copy(this.dotIsRepeller ? WHITE : BLACK);

        this.dotMesh.position.set(x, y, 0);
        this.dotMesh.scale.set(0, 0, 1);
        this.dotMesh.visible = true;

        gsap.killTweensOf(this.dotMesh.scale);
        gsap.to(this.dotMesh.scale, {
            x: radius, y: radius, duration: 2.0, ease: "power2.out",
            onUpdate: () => this.resizeDotCollider(this.dotMesh.scale.x),
        });
    }

    private hideDot() {
        if (!this.dotInWorld) return;
        gsap.killTweensOf(this.dotMesh.scale);
        gsap.to(this.dotMesh.scale, {
            x: 0, y: 0, duration: 1.5, ease: "power2.in",
            onUpdate: () => this.resizeDotCollider(this.dotMesh.scale.x),
            onComplete: () => {
                if (this.dotInWorld) {
                    this.world.removeBody(this.dotBody);
                    this.dotInWorld = false;
                }
                this.dotMesh.visible = false;
            },
        });
    }

    protected onBeat(_beat: number, _beatRemaining: number) {
        const color = this.fg.getHex();
        for (const p of this.pts) {
            if (p.alive) (p.mesh as unknown as Text).color = color;
        }
    }

    deactivate() {
        super.deactivate();
        this.prevTime  = -1;
        this.dotClock  = 0;
        this.dotActive = false;
        this.hideDot();
    }

    update(time: number) {
        if (this.prevTime < 0) { this.prevTime = time; }
        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        super.update(time);

        // Dot cycle: idle → active → idle → …
        const beatDuration = 60 / tempo.bpm;
        this.dotClock += dt;
        if (!this.dotActive && this.dotClock >= beatDuration * DOT_IDLE_BEATS) {
            this.dotClock -= beatDuration * DOT_IDLE_BEATS;
            this.dotActive = true;
            this.showDot();
        } else if (this.dotActive && this.dotClock >= beatDuration * DOT_ACTIVE_BEATS) {
            this.dotClock -= beatDuration * DOT_ACTIVE_BEATS;
            this.dotActive = false;
            this.hideDot();
        }

        // refill pool gradually
        const dead = this.pts.filter(p => !p.alive).length;
        for (let i = 0; i < Math.min(dead, 3); i++) this.spawn();

        if (this.dotInWorld) {
            this.dotBody.applyForce([
                (Math.random() - 0.5) * TURB_F,
                (Math.random() - 0.5) * TURB_F,
            ]);
            if (this.dotIsRepeller) {
                const [dx, dy] = this.dotBody.position;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                this.dotBody.applyForce([
                    -dx / d * DOT_ROAM_ATTRACT + (-dy / d) * DOT_ROAM_ORBIT,
                    -dy / d * DOT_ROAM_ATTRACT + ( dx / d) * DOT_ROAM_ORBIT,
                ]);
            }
        }

        const dotX = this.dotBody.position[0];
        const dotY = this.dotBody.position[1];

        for (const p of this.pts) {
            if (!p.alive) continue;

            p.body.applyForce([
                (Math.random() - 0.5) * TURB_F,
                (Math.random() - 0.5) * TURB_F,
            ]);

            if (this.dotInWorld) {
                const ex = dotX - p.body.position[0];
                const ey = dotY - p.body.position[1];
                const dist = Math.sqrt(ex * ex + ey * ey) + 1;
                const f = this.dotIsRepeller ? -REPEL_F : ATTRACT_F;
                p.body.applyForce([ex * f / dist, ey * f / dist]);
            }
        }

        this.world.step(1 / 60, dt, 3);

        if (this.dotInWorld) {
            this.dotMesh.position.x = this.dotBody.position[0];
            this.dotMesh.position.y = this.dotBody.position[1];
        }

        for (const p of this.pts) {
            if (!p.alive) continue;
            p.mesh.position.x  = p.body.position[0];
            p.mesh.position.y  = p.body.position[1];
            p.mesh.rotation.z  = p.body.angle;
        }
    }
}
