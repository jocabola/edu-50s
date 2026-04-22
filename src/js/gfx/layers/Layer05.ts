import { ThreeDOMLayer } from "@fils/gl-dom";
import { World, Body, Box, Plane } from "p2-es";
import { Mesh } from "three";
import { Text, preloadFont } from "troika-three-text";
import { gsap } from "gsap";
import { FlashLayer, DEFAULT_BPM, W, H, tempo } from "../FlashLayer";

const HW          = W / 2;
const HH          = H / 2;
const MAX         = 512;
const HALF        = MAX >> 1;
const SIZE        = 55;             // fontSize in px (matches ortho pixel space)
const MIN_LIFE    = 5.0;
const MAX_LIFE    = 10.0;
const SPEED_MIN   = 80;             // px / s
const SPEED_MAX   = 220;            // px / s
const TURB_F      = 500;
const ATTRACT_F   = 200;           // attraction force toward giant
const RESTITUTION = 0.55;
const FRICTION    = 0.1;
const NORMAL_BEATS = 8;             // beats in normal phase
const GIANT_BEATS  = 8;             // beats in giant phase
const GIANT_SCALE  = 10;            // giant size multiplier
const COL_W        = 0.42;          // collider width  as fraction of fontSize
const COL_H        = 0.62;          // collider height as fraction of fontSize

// ── Types ─────────────────────────────────────────────────────────────────────

interface Particle {
    mesh:      Mesh;
    body:      Body;
    alive:     boolean;
    dying:     boolean;
    isGiant:   boolean;
    age:       number;
    lifetime:  number;
    baseScale: number;  // unitless multiplier; rendered px = SIZE * baseScale
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export class Layer05 extends FlashLayer {
    private world:       World;
    private pts:         Particle[] = [];
    private giant:       Particle | null = null;
    private prevTime   = -1;
    private giantClock = 0;
    private giantActive = false;

    constructor(_gl: ThreeDOMLayer) {
        super(_gl, DEFAULT_BPM);

        this.world = new World({ gravity: [0, 0] });
        this.world.defaultContactMaterial.restitution = RESTITUTION;
        this.world.defaultContactMaterial.friction    = FRICTION;
        this.addWalls();

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
                    alive: false, dying: false, isGiant: false,
                    age: 0, lifetime: 0, baseScale: 0,
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

        p.alive    = true;
        p.dying    = false;
        p.isGiant  = false;
        p.age      = 0;
        p.lifetime = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);

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

    private kill(p: Particle) {
        if (p.dying) return;
        p.dying = true;
        this.world.removeBody(p.body);
        gsap.killTweensOf(p.mesh.scale);
        gsap.to(p.mesh.scale, {
            x: 0, y: 0, duration: 0.35, ease: "back.in(2)",
            onComplete: () => { p.alive = false; p.mesh.visible = false; },
        });
    }

    // Takes the current visual scale (= mesh.scale.x) and rebuilds the Box shape.
    // remove+add is required because Box bakes vertices at construction time —
    // mutating width/height afterwards only affects the broadphase AABB.
    private resizeCollider(p: Particle, visualScale: number) {
        const s = Math.max(visualScale, 0.01);
        if (p.body.shapes.length) p.body.removeShape(p.body.shapes[0]);
        p.body.addShape(new Box({ width: SIZE * COL_W * s, height: SIZE * COL_H * s }));
        p.body.aabbNeedsUpdate = true;
    }

    private activateGiant() {
        this.deactivateGiant();
        const pool = this.pts.filter(p => p.alive && !p.dying);
        if (!pool.length) return;
        const p = pool[Math.floor(Math.random() * pool.length)];
        p.isGiant = true;
        this.giant = p;
        gsap.killTweensOf(p.mesh.scale);
        gsap.to(p.mesh.scale, {
            x: p.baseScale * GIANT_SCALE, y: p.baseScale * GIANT_SCALE,
            duration: 2.5, ease: "power2.inOut",
            onUpdate: () => this.resizeCollider(p, p.mesh.scale.x),
        });
    }

    private deactivateGiant() {
        if (!this.giant) return;
        const p = this.giant;
        p.isGiant = false;
        this.giant = null;
        gsap.killTweensOf(p.mesh.scale);
        gsap.to(p.mesh.scale, {
            x: p.baseScale, y: p.baseScale,
            duration: 1.5, ease: "expo.inOut",
            onUpdate: () => this.resizeCollider(p, p.mesh.scale.x),
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
        this.prevTime    = -1;
        this.giantClock  = 0;
        this.giantActive = false;
        this.deactivateGiant();
    }

    update(time: number) {
        if (this.prevTime < 0) { this.prevTime = time; }
        const dt = Math.min(time - this.prevTime, 0.05);
        this.prevTime = time;

        super.update(time);

        // giant cycle: NORMAL_BEATS normal → GIANT_BEATS giant → repeat
        const beatDuration = 60 / tempo.bpm;
        this.giantClock += dt;
        if (!this.giantActive && this.giantClock >= beatDuration * NORMAL_BEATS) {
            this.giantClock -= beatDuration * NORMAL_BEATS;
            this.giantActive = true;
            this.activateGiant();
        } else if (this.giantActive && this.giantClock >= beatDuration * GIANT_BEATS) {
            this.giantClock -= beatDuration * GIANT_BEATS;
            this.giantActive = false;
            this.deactivateGiant();
        }

        // refill pool gradually
        const dead = this.pts.filter(p => !p.alive).length;
        for (let i = 0; i < Math.min(dead, 3); i++) this.spawn();

        const gx = this.giant?.body.position[0] ?? 0;
        const gy = this.giant?.body.position[1] ?? 0;

        for (const p of this.pts) {
            if (!p.alive || p.dying) continue;

            if (!p.isGiant) {
                p.age += dt;
                if (p.age >= p.lifetime) { this.kill(p); continue; }
            }

            p.body.applyForce([
                (Math.random() - 0.5) * TURB_F,
                (Math.random() - 0.5) * TURB_F,
            ]);

            if (this.giant && !p.isGiant) {
                const dx = gx - p.body.position[0];
                const dy = gy - p.body.position[1];
                const dist = Math.sqrt(dx * dx + dy * dy) + 1;
                p.body.applyForce([dx * ATTRACT_F / dist, dy * ATTRACT_F / dist]);
            }
        }

        this.world.step(1 / 60, dt, 3);

        for (const p of this.pts) {
            if (!p.alive) continue;
            p.mesh.position.x = p.body.position[0];
            p.mesh.position.y = p.body.position[1];
            p.mesh.rotation.z = p.body.angle;
        }
    }
}
