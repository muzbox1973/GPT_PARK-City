// 액션 효과 7종: launch · horn · feed · drop · fireworks · rain · lights
import * as THREE from 'three';
import type { Effect } from './config';
import { patchMaterial, type Jelly } from './jelly';
import type { Movers } from './movers';
import type { Sound } from './audio';
import type { Water } from './water';

export interface ActionCtx {
  world: THREE.Group;
  water: Water;
  movers: Movers;
  jelly: Jelly;
  sound: Sound;
  size: number;
  setNight: (on: boolean) => void;
  isNight: () => boolean;
  palette: () => string[];
}

interface Faller { mesh: THREE.Object3D; vy: number; state: 'fall' | 'float'; t: number; spin: number; onHit?: () => void; ttl: number }
interface Burst { points: THREE.Points; vel: Float32Array; t: number }

export class Actions {
  private fallers: Faller[] = [];
  private bursts: Burst[] = [];
  private pending: { at: number; fn: () => void }[] = [];
  private rain: { lines: THREE.LineSegments; t: number } | null = null;
  private lastFired = new Map<Effect, number>();
  private clock = 0;
  private buoyMats: THREE.Material[];
  private pellet: THREE.MeshStandardMaterial;

  constructor(private c: ActionCtx) {
    this.buoyMats = [
      patchMaterial(new THREE.MeshStandardMaterial({ color: '#ff6a3d', roughness: 0.5 })),
      patchMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })),
    ];
    this.pellet = patchMaterial(new THREE.MeshStandardMaterial({ color: '#d9a35b', roughness: 0.8 }));
  }

  /** 같은 효과는 0.4초 간격 제한. 실제로 동작했으면 true */
  run(effect: Effect): boolean {
    const last = this.lastFired.get(effect) ?? -1;
    if (this.clock - last < 0.4) return false;
    this.lastFired.set(effect, this.clock);
    switch (effect) {
      case 'launch': {
        const ok = this.c.movers.launch();
        if (ok) { this.c.sound.horn(); this.c.jelly.poke(0.05, 0.05, 0.08); }
        return ok;
      }
      case 'horn':
        this.c.sound.horn();
        this.c.jelly.poke((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0.2);
        return true;
      case 'feed': this.feed(); return true;
      case 'drop': {
        const p = this.randomWater();
        if (!p) return false;
        this.dropBuoy(p.x, p.z);
        return true;
      }
      case 'fireworks': this.fireworks(); return true;
      case 'rain': this.startRain(); return true;
      case 'lights': {
        const on = !this.c.isNight();
        this.c.setNight(on);
        this.c.sound.switchOn(on);
        return true;
      }
    }
    return false;
  }

  randomWater(): THREE.Vector3 | null {
    const h = this.c.size / 2 - 0.8;
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() * 2 - 1) * h, z = (Math.random() * 2 - 1) * h;
      if (this.c.water.isWater(x, z) && this.c.water.isWater(x + 0.4, z) && this.c.water.isWater(x - 0.4, z) && this.c.water.isWater(x, z + 0.4) && this.c.water.isWater(x, z - 0.4)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  /** 물 위 (x,z) 에 물체가 떨어지며 물보라 — 더블클릭 / drop 공용 */
  dropAt(x: number, z: number, kind: 'buoy' | 'drop'): void {
    if (kind === 'buoy') return this.dropBuoy(x, z);
    const mat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: this.c.palette()[1] ?? '#3fa9f5', roughness: 0.1, transmission: 0.4, transparent: true, opacity: 0.9, clearcoat: 1 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat);
    m.castShadow = true;
    m.position.set(x, 5, z);
    this.c.world.add(m);
    this.fallers.push({ mesh: m, vy: 0, state: 'fall', t: 0, spin: 0, ttl: 5 });
  }

  private dropBuoy(x: number, z: number): void {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 8, 10, Math.PI / 2), this.buoyMats[i % 2]);
      seg.rotation.z = (i * Math.PI) / 2;
      seg.castShadow = true;
      g.add(seg);
    }
    g.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(g);
    holder.position.set(x, 5.5, z);
    this.c.world.add(holder);
    this.fallers.push({ mesh: holder, vy: 0, state: 'fall', t: 0, spin: (Math.random() - 0.5) * 3, ttl: 8 });
  }

  private feed(): void {
    const center = this.randomWater();
    if (!center) return;
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < 12; i++) {
      let x = center.x, z = center.z;
      for (let t = 0; t < 12; t++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.1;
        if (this.c.water.isWater(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r)) { x = center.x + Math.cos(a) * r; z = center.z + Math.sin(a) * r; break; }
      }
      pts.push({ x, z });
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), this.pellet);
      m.position.set(x, 3 + Math.random() * 1.2, z);
      this.c.world.add(m);
      this.fallers.push({ mesh: m, vy: 0, state: 'fall', t: 0, spin: 0, ttl: 4, onHit: () => this.c.sound.pop(1 + Math.random() * 0.5) });
    }
    this.c.movers.feed(pts);
  }

  private fireworks(): void {
    const colors = [...this.c.palette(), '#ffd166', '#ff6b9a'];
    for (let b = 0; b < 3; b++) {
      this.pending.push({
        at: this.clock + b * 0.45,
        fn: () => {
          const N = 150;
          const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), col = new Float32Array(N * 3);
          const cx = (Math.random() - 0.5) * 10, cy = 7.5 + Math.random() * 2, cz = (Math.random() - 0.5) * 8;
          const c1 = new THREE.Color(colors[(b * 2) % colors.length]), c2 = new THREE.Color(colors[(b * 2 + 1) % colors.length]);
          for (let i = 0; i < N; i++) {
            const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
            const sp = 2.4 + Math.random() * 0.6;
            pos.set([cx, cy, cz], i * 3);
            vel.set([s * Math.cos(th) * sp, u * sp, s * Math.sin(th) * sp], i * 3);
            const cc = i % 3 ? c1 : c2;
            col.set([cc.r, cc.g, cc.b], i * 3);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
          const pts = new THREE.Points(geo, mat);
          pts.frustumCulled = false;
          this.c.world.add(pts);
          this.bursts.push({ points: pts, vel, t: 0 });
          this.c.sound.boom();
        },
      });
    }
  }

  private startRain(): void {
    if (this.rain) { this.rain.t = 0; return; }
    const N = 420;
    const pos = new Float32Array(N * 6);
    const h = this.c.size / 2;
    for (let i = 0; i < N; i++) {
      const x = (Math.random() * 2 - 1) * h, z = (Math.random() * 2 - 1) * h, y = Math.random() * 8;
      pos.set([x, y, z, x, y + 0.25, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.55 }));
    lines.frustumCulled = false;
    this.c.world.add(lines);
    this.rain = { lines, t: 0 };
    this.c.sound.rain(5);
  }

  get raining(): boolean { return !!this.rain; }

  update(dt: number): void {
    this.clock += dt;
    // 예약 실행
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.clock) { const p = this.pending.splice(i, 1)[0]; p.fn(); }
    // 떨어지는 물체
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt;
      const m = f.mesh;
      const wy = this.c.water.heightAt(m.position.x, m.position.z);
      if (f.state === 'fall') {
        f.vy -= 9.8 * dt;
        m.position.y += f.vy * dt;
        m.rotation.y += f.spin * dt;
        if (m.position.y <= wy) {
          f.state = 'float'; f.t = 0;
          const big = f.vy < -6;
          this.c.water.sim.disturb(m.position.x, m.position.z, big ? 0.6 : 0.25, big ? 0.28 : 0.05);
          this.c.water.splash.emit(m.position.x, wy, m.position.z, big ? 46 : 6, big ? 1 : 0.4);
          if (big) this.c.sound.splash(1);
          f.onHit?.();
          f.vy = 0;
        }
      } else {
        // 떠 있기 (먹이는 가라앉는다)
        const sink = f.ttl < 5;
        const target = sink ? wy - f.t * 0.15 : wy + 0.02;
        m.position.y += (target - m.position.y) * Math.min(1, dt * 6);
        m.rotation.y += f.spin * 0.2 * dt;
        if (f.t > f.ttl) {
          m.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
          if (m.scale.x < 0.05) { this.c.world.remove(m); this.fallers.splice(i, 1); }
        }
      }
    }
    // 불꽃
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      const P = pos.array as Float32Array;
      const drag = Math.exp(-dt * 1.8);
      for (let k = 0; k < b.vel.length; k += 3) {
        b.vel[k] *= drag; b.vel[k + 1] = b.vel[k + 1] * drag - 1.6 * dt; b.vel[k + 2] *= drag;
        P[k] += b.vel[k] * dt; P[k + 1] += b.vel[k + 1] * dt; P[k + 2] += b.vel[k + 2] * dt;
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.t / 2.2);
      if (b.t > 2.2) { this.c.world.remove(b.points); b.points.geometry.dispose(); this.bursts.splice(i, 1); }
    }
    // 비
    if (this.rain) {
      const r = this.rain;
      r.t += dt;
      const pos = r.lines.geometry.attributes.position as THREE.BufferAttribute;
      const P = pos.array as Float32Array;
      const h = this.c.size / 2;
      const fade = r.t > 4.4 ? Math.max(0, (5 - r.t) / 0.6) : Math.min(1, r.t * 3);
      (r.lines.material as THREE.LineBasicMaterial).opacity = 0.55 * fade;
      for (let k = 0; k < P.length; k += 6) {
        P[k + 1] -= 9 * dt; P[k + 4] -= 9 * dt;
        const x = P[k], z = P[k + 2];
        if (P[k + 1] < this.c.water.level) {
          if (this.c.water.isWater(x, z) && Math.random() < 0.6) this.c.water.sim.disturb(x, z, 0.12, 0.018);
          const nx = (Math.random() * 2 - 1) * h, nz = (Math.random() * 2 - 1) * h, ny = 7 + Math.random() * 2;
          P.set([nx, ny, nz, nx, ny + 0.25, nz], k);
        }
      }
      pos.needsUpdate = true;
      if (r.t >= 5) { this.c.world.remove(r.lines); r.lines.geometry.dispose(); this.rain = null; }
    }
  }

  clear(): void {
    for (const f of this.fallers) this.c.world.remove(f.mesh);
    for (const b of this.bursts) this.c.world.remove(b.points);
    if (this.rain) this.c.world.remove(this.rain.lines);
    this.fallers = []; this.bursts = []; this.pending = []; this.rain = null;
  }
}
