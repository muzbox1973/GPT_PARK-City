// 탈것 · 새 · 물고기 경로 이동 (Catmull-Rom), 배의 물결, launch 효과
import * as THREE from 'three';
import type { MoverDef } from './config';
import { accent, glow, mat } from './landmarks/kit';
import { patchMaterial } from './jelly';
import { makeCurve } from './paths';
import type { HeightFn } from './terrain';
import type { Water } from './water';

export interface MoverCtx { height: HeightFn; water: Water; sea: number; pad?: THREE.Vector3; onArrive?: () => void }

type Kind = 'dronebus' | 'subway' | 'autonomous' | 'boat' | 'car' | 'train' | 'bike' | 'bird' | 'fish';

interface Unit {
  kind: Kind; def: MoverDef; curve: THREE.CatmullRomCurve3; length: number;
  obj: THREE.Object3D; u: number; parts: THREE.Object3D[]; spin: THREE.Object3D[];
  pos: THREE.Vector3; heading: number; wakeT: number;
}

const kindOf = (d: MoverDef): Kind => {
  if (d.variant === 'dronebus' || d.variant === 'subway' || d.variant === 'autonomous') return d.variant;
  return d.type;
};

const CAR_COLORS = ['#f7f7f2', '#ffd166', '#8ab6f9', '#f26b5b', '#5ec2b7', '#c8ccd2'];

export class Movers {
  group = new THREE.Group();
  units: Unit[] = [];
  roads: THREE.Mesh[] = [];
  food: { x: number; z: number; life: number }[] = [];
  private launchUnit?: Unit;
  private launchState: 'idle' | 'up' | 'lap' | 'down' = 'idle';
  private launchT = 0;
  private launchU0 = 0;
  private launchFrom = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private colorIdx = 0;

  constructor(defs: MoverDef[], private ctx: MoverCtx, launchTarget?: string) {
    let warned = false;
    for (const d of defs) {
      if (d.type === 'boat' && !ctx.water.sim.hasWater()) {
        if (!warned) console.warn('[town] 물이 없는 지형이라 boat 를 제외했습니다.');
        warned = true;
        continue;
      }
      const curve = makeCurve(d.path, d.loop);
      const length = curve.getLength();
      if (d.type === 'car' || d.type === 'bike') this.buildRoad(curve, d.type === 'bike' ? 0.22 : 0.42);
      for (let i = 0; i < d.count; i++) this.units.push(this.makeUnit(d, curve, length, i / Math.max(1, d.count)));
    }
    if (launchTarget) {
      const d = defs.find((m) => m.variant === launchTarget || m.type === launchTarget);
      if (d && (d.type !== 'boat' || ctx.water.sim.hasWater())) {
        const curve = makeCurve(d.path, d.loop);
        this.launchUnit = this.makeUnit(d, curve, curve.getLength(), 0);
        this.launchU0 = this.nearestU(curve, ctx.pad ?? curve.getPointAt(0));
        this.parkLaunch();
      }
    }
  }

  private nearestU(curve: THREE.CatmullRomCurve3, p: THREE.Vector3): number {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 200; i++) {
      const q = curve.getPointAt(i / 200);
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) { bd = d; best = i / 200; }
    }
    return best;
  }

  private buildRoad(curve: THREE.CatmullRomCurve3, width: number): void {
    const N = 360;
    const pts = curve.getSpacedPoints(N);
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = pts[i % pts.length];
      const t = curve.getTangentAt((i % N) / N);
      const nx = -t.z, nz = t.x;
      const y = this.roadY(p.x, p.z) - 0.035;
      pos.push(p.x + nx * width / 2, y, p.z + nz * width / 2, p.x - nx * width / 2, y, p.z - nz * width / 2);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, patchMaterial(new THREE.MeshStandardMaterial({ color: '#676d77', roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
    m.receiveShadow = true;
    m.name = 'road';
    this.roads.push(m);
    this.group.add(m);
  }

  /** 땅 위는 지형을 따르고, 물 위는 최고 물때보다 높은 다리 상판 */
  roadY(x: number, z: number): number {
    return Math.max(this.ctx.height(x, z), this.ctx.sea + 0.48) + 0.04;
  }

  private makeUnit(d: MoverDef, curve: THREE.CatmullRomCurve3, length: number, u: number): Unit {
    const kind = kindOf(d);
    const { obj, parts, spin } = this.buildMesh(kind);
    this.group.add(...parts);
    const unit: Unit = { kind, def: d, curve, length, obj, u, parts, spin, pos: curve.getPointAt(u % 1), heading: 0, wakeT: 0 };
    return unit;
  }

  private buildMesh(kind: Kind): { obj: THREE.Object3D; parts: THREE.Object3D[]; spin: THREE.Object3D[] } {
    const g = new THREE.Group();
    const spin: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    switch (kind) {
      case 'dronebus': {
        const white = mat('#f5f7fa', { rough: 0.35, flat: false });
        const body = add(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10), white, 0, 0, 0);
        body.rotation.x = Math.PI / 2;
        add(new THREE.BoxGeometry(0.205, 0.05, 0.36), glow('#bfe9ff', 0.3, 1.8, { base: '#33475e' }), 0, 0.03, 0);
        add(new THREE.BoxGeometry(0.21, 0.02, 0.5), accent(0.6, 2.2), 0, -0.04, 0);
        for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
          add(new THREE.BoxGeometry(Math.abs(x) * 1.1, 0.015, 0.025), white, x / 2, 0.06, z);
          const rotor = add(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 12), patchMaterial(new THREE.MeshStandardMaterial({ color: '#cfd6de', transparent: true, opacity: 0.55 })), x, 0.08, z);
          spin.push(rotor);
          add(new THREE.BoxGeometry(0.2, 0.01, 0.02), mat('#39404c'), x, 0.085, z).userData.blade = true;
          spin.push(g.children[g.children.length - 1]);
        }
        g.scale.setScalar(1.25);
        break;
      }
      case 'subway': {
        const cars: THREE.Object3D[] = [];
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Group();
          const shell = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.52), mat('#e3e8ee', { rough: 0.4 }));
          shell.position.y = 0.1;
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.06, 0.46), glow('#fff1c8', 0.8, 1.8, { base: '#3a4352' }));
          win.position.y = 0.13;
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.206, 0.02, 0.52), accent(0.7, 2.0));
          stripe.position.y = 0.06;
          c.add(shell, win, stripe);
          if (i === 0) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.01), glow('#ffffff', 1.5, 3)); hl.position.set(0, 0.09, 0.265); c.add(hl); }
          cars.push(c);
        }
        return { obj: cars[0], parts: cars, spin };
      }
      case 'autonomous':
      case 'car': {
        const col = CAR_COLORS[this.colorIdx++ % CAR_COLORS.length];
        add(new THREE.BoxGeometry(0.13, 0.06, 0.26), mat(col, { rough: 0.35 }), 0, 0.045, 0);
        add(new THREE.BoxGeometry(0.115, 0.05, 0.14), mat('#2c3644', { rough: 0.15, metal: 0.4 }), 0, 0.095, -0.01);
        if (kind === 'autonomous') {
          add(new THREE.CylinderGeometry(0.022, 0.026, 0.025, 10), accent(0.9, 2.4), 0, 0.13, -0.01);
          add(new THREE.BoxGeometry(0.1, 0.012, 0.01), accent(0.9, 2.4), 0, 0.05, 0.132);
        }
        add(new THREE.BoxGeometry(0.1, 0.02, 0.01), glow('#ffffff', 0.4, 2.5), 0, 0.055, 0.131);
        break;
      }
      case 'bike': {
        add(new THREE.BoxGeometry(0.02, 0.06, 0.12), mat('#f26b5b'), 0, 0.05, 0);
        add(new THREE.CapsuleGeometry(0.02, 0.05, 2, 6), mat('#4f86f7'), 0, 0.12, 0);
        break;
      }
      case 'boat': {
        const hull = add(new THREE.CylinderGeometry(0.09, 0.05, 0.4, 6, 1), mat('#f7f7f2'), 0, 0.03, 0);
        hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.45);
        add(new THREE.BoxGeometry(0.1, 0.07, 0.12), mat('#2f6fd1'), 0, 0.09, -0.04);
        break;
      }
      case 'bird': {
        const w = mat('#f4f4f4');
        add(new THREE.SphereGeometry(0.035, 6, 4), w);
        const l = add(new THREE.BoxGeometry(0.14, 0.008, 0.05), w, -0.07, 0, 0);
        const r = add(new THREE.BoxGeometry(0.14, 0.008, 0.05), w, 0.07, 0, 0);
        l.userData.wing = -1; r.userData.wing = 1;
        spin.push(l, r);
        break;
      }
      case 'fish': {
        const body = add(new THREE.SphereGeometry(0.05, 8, 6), mat('#ff8a3d', { rough: 0.4 }));
        body.scale.set(0.6, 0.7, 1.4);
        const tail = add(new THREE.ConeGeometry(0.04, 0.07, 4), mat('#ffb067'), 0, 0, -0.09);
        tail.rotation.x = -Math.PI / 2;
        spin.push(tail);
        break;
      }
      case 'train': {
        add(new THREE.BoxGeometry(0.18, 0.16, 0.5), mat('#3e7bd1'), 0, 0.1, 0);
        break;
      }
    }
    return { obj: g, parts: [g], spin };
  }

  private yFor(u: Unit, x: number, z: number, time: number, idx: number): number {
    switch (u.kind) {
      case 'dronebus': return (u.def.altitude ?? 3.4) + Math.sin(time * 1.6 + idx) * 0.06;
      case 'bird': return (u.def.altitude ?? 4) + Math.sin(time * 2 + idx) * 0.15;
      case 'subway': case 'train': return u.def.depth ?? (u.kind === 'subway' ? -2.45 : this.roadY(x, z) - 0.02);
      case 'boat': return this.ctx.water.heightAt(x, z) - 0.01;
      case 'fish': return this.ctx.water.level - 0.32;
      default: return this.roadY(x, z) - 0.03;
    }
  }

  private place(u: Unit, uu: number, time: number, idx: number, dt: number): void {
    const p = u.curve.getPointAt(((uu % 1) + 1) % 1, this.tmp);
    const t = u.curve.getTangentAt(((uu % 1) + 1) % 1, this.tmp2);
    if (u.kind === 'subway') {
      // 4량: 앞 차에서 일정 간격 뒤
      u.parts.forEach((part, i) => {
        const pu = (((uu - (i * 0.58) / u.length) % 1) + 1) % 1;
        const pp = u.curve.getPointAt(pu);
        const tt = u.curve.getTangentAt(pu);
        part.position.set(pp.x, u.def.depth ?? -2.45, pp.z);
        part.lookAt(pp.x + tt.x, part.position.y, pp.z + tt.z);
      });
      return;
    }
    if (u.kind === 'fish' && this.food.length) {
      // 먹이 쪽으로 모여든다
      let best = this.food[0], bd = Infinity;
      for (const f of this.food) { const d = Math.hypot(f.x - u.pos.x, f.z - u.pos.z); if (d < bd) { bd = d; best = f; } }
      const dx = best.x - u.pos.x, dz = best.z - u.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = Math.min(d, 1.6 * dt);
      u.pos.x += (dx / d) * sp; u.pos.z += (dz / d) * sp;
      u.heading = Math.atan2(dx, dz);
      if (d < 0.12) best.life = 0;
    } else if (u.kind === 'fish') {
      const dx = p.x - u.pos.x, dz = p.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) { const sp = Math.min(d, 1.2 * dt); u.pos.x += (dx / d) * sp; u.pos.z += (dz / d) * sp; u.heading = Math.atan2(dx, dz); }
      else { u.pos.set(p.x, 0, p.z); u.heading = Math.atan2(t.x, t.z); }
    } else {
      u.pos.set(p.x, 0, p.z);
      u.heading = Math.atan2(t.x, t.z);
    }
    const o = u.obj;
    o.position.set(u.pos.x, this.yFor(u, u.pos.x, u.pos.z, time, idx), u.pos.z);
    o.rotation.set(0, u.heading, 0);
    if (u.kind === 'dronebus') o.rotation.z = Math.sin(time * 0.9 + idx) * 0.04;
    if (u.kind === 'boat') {
      u.wakeT -= dt;
      if (u.wakeT <= 0) { u.wakeT = 0.12; this.ctx.water.sim.disturb(u.pos.x - t.x * 0.2, u.pos.z - t.z * 0.2, 0.25, 0.012); }
    }
  }

  update(dt: number, time: number, wind: number): void {
    this.food = this.food.filter((f) => (f.life -= dt) > 0);
    this.units.forEach((u, i) => {
      const sp = (u.def.speed * dt) / u.length;
      u.u = (u.u + sp) % 1;
      this.place(u, u.u, time, i, dt);
      this.animateParts(u, time, wind);
    });
    if (this.launchUnit) this.updateLaunch(dt, time, wind);
  }

  private animateParts(u: Unit, time: number, wind: number): void {
    for (const s of u.spin) {
      if (u.kind === 'bird') s.rotation.z = Math.sin(time * 9) * 0.6 * (s.userData.wing as number);
      else if (u.kind === 'fish') s.rotation.y = Math.sin(time * 10) * 0.5;
      else s.rotation.y += 0.9 + wind * 0.002;
    }
  }

  private parkLaunch(): void {
    const u = this.launchUnit!;
    const pad = this.ctx.pad;
    if (u.kind === 'dronebus' && pad) {
      u.obj.position.copy(pad).add(new THREE.Vector3(0, 0.14, 0));
      u.obj.rotation.set(0, 0.6, 0);
    } else {
      u.u = this.launchU0;
      this.place(u, u.u, 0, 99, 0);
    }
  }

  /** 지정한 탈것 1대가 출발해 경로를 한 바퀴 돌고 돌아온다. 이미 운항 중이면 false */
  launch(): boolean {
    if (!this.launchUnit || this.launchState !== 'idle') return false;
    this.launchState = this.launchUnit.kind === 'dronebus' && this.ctx.pad ? 'up' : 'lap';
    this.launchT = 0;
    this.launchFrom.copy(this.launchUnit.obj.position);
    this.launchUnit.u = this.launchU0;
    return true;
  }

  get launching(): boolean { return this.launchState !== 'idle'; }

  private updateLaunch(dt: number, time: number, wind: number): void {
    const u = this.launchUnit!;
    this.animateParts(u, time, this.launchState === 'idle' ? 0 : wind + 60);
    if (this.launchState === 'idle') {
      if (u.kind === 'dronebus') for (const s of u.spin) s.rotation.y += 0.02;
      return;
    }
    const T = 1.6;
    if (this.launchState === 'up' || this.launchState === 'down') {
      this.launchT += dt / T;
      const k = Math.min(1, this.launchT);
      const e = k * k * (3 - 2 * k);
      const target = u.curve.getPointAt(this.launchU0);
      target.y = this.yFor(u, target.x, target.z, time, 99);
      const pad = this.ctx.pad!.clone().add(new THREE.Vector3(0, 0.14, 0));
      const [a, b] = this.launchState === 'up' ? [pad, target] : [this.launchFrom, pad];
      u.obj.position.lerpVectors(a, b, e);
      u.obj.position.y = a.y + (b.y - a.y) * (this.launchState === 'up' ? Math.sqrt(e) : e * e);
      const tan = u.curve.getTangentAt(this.launchU0);
      u.obj.rotation.set(0, THREE.MathUtils.lerp(0.6, Math.atan2(tan.x, tan.z), this.launchState === 'up' ? e : 1 - e), 0);
      if (k >= 1) {
        if (this.launchState === 'up') { this.launchState = 'lap'; this.launchT = 0; }
        else { this.launchState = 'idle'; this.ctx.onArrive?.(); }
      }
      return;
    }
    // lap
    this.launchT += (u.def.speed * 1.6 * dt) / u.length;
    const k = Math.min(1, this.launchT);
    this.place(u, this.launchU0 + k, time, 99, dt);
    if (k >= 1) {
      if (u.kind === 'dronebus' && this.ctx.pad) { this.launchState = 'down'; this.launchT = 0; this.launchFrom.copy(u.obj.position); }
      else { this.launchState = 'idle'; this.ctx.onArrive?.(); }
    }
  }

  feed(points: { x: number; z: number }[]): void {
    for (const p of points) this.food.push({ x: p.x, z: p.z, life: 7 });
  }

  /** 라벨 등 외부에서 쓸 수 있도록 모든 표시 객체 */
  objects(): THREE.Object3D[] {
    return [...this.units.flatMap((u) => u.parts), ...(this.launchUnit ? this.launchUnit.parts : [])];
  }

  reset(): void {
    this.food = [];
    if (this.launchUnit) { this.launchState = 'idle'; this.parkLaunch(); }
  }
}
