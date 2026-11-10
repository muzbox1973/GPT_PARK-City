// 집 · 나무 · 가로등 · 사람과 휴머노이드를 InstancedMesh 로 채운다
import * as THREE from 'three';
import type { TownConfig } from './config';
import { accent, glow, mat, windowMaterial } from './landmarks/kit';
import { patchMaterial } from './jelly';
import { rng, slopeAt, type HeightFn } from './terrain';

export interface FillerCtx {
  height: HeightFn;
  sea: number;
  size: number;
  landmarks: { x: number; z: number; r: number }[];
  roadDist: (x: number, z: number) => number;
  anchors: { x: number; z: number; r: number }[];
}

const HOUSE_COLORS = ['#f6efe3', '#f3d9c4', '#e9e4f2', '#dbeee6', '#f6e3a8', '#e3eef8'];
const ROOF_COLORS = ['#d9654f', '#4f6d8f', '#6a8f5b', '#c98a47', '#7c6aa6'];
const PEOPLE_COLORS = ['#f26b5b', '#ffd166', '#4f86f7', '#5ec2b7', '#f497c4', '#8a6748', '#ffffff'];

interface Walker { x: number; z: number; tx: number; tz: number; speed: number; ax: number; az: number; ar: number; phase: number }

export class Fillers {
  group = new THREE.Group();
  private walkers: Walker[] = [];
  private bodyMesh?: THREE.InstancedMesh;
  private headMesh?: THREE.InstancedMesh;
  private visorMesh?: THREE.InstancedMesh;
  private humanoidCount = 0;
  private r: () => number;
  private dummy = new THREE.Object3D();

  constructor(private cfg: TownConfig, private ctx: FillerCtx) {
    this.r = rng(cfg.fillers.seed);
    this.buildHouses();
    this.buildTrees();
    this.buildStreetLights();
    this.buildWalkers();
  }

  private free(x: number, z: number, clearance: number, roadGap = 0.42): boolean {
    const { height, sea, size, landmarks, roadDist } = this.ctx;
    const h = size / 2 - 0.35;
    if (Math.abs(x) > h || Math.abs(z) > h) return false;
    if (height(x, z) < sea + 0.12) return false;
    for (const l of landmarks) if (Math.hypot(x - l.x, z - l.z) < l.r + clearance) return false;
    if (roadDist(x, z) < roadGap) return false;
    return true;
  }

  private buildHouses(): void {
    const { height } = this.ctx;
    const N = this.cfg.fillers.houses;
    const bodies: THREE.Matrix4[] = [], roofs: THREE.Matrix4[] = [], towers: THREE.Matrix4[] = [];
    const bodyCols: THREE.Color[] = [], roofCols: THREE.Color[] = [];
    const placed: [number, number][] = [];
    let tries = 0;
    while (bodies.length + towers.length < N && tries++ < N * 60) {
      const x = (this.r() - 0.5) * this.ctx.size, z = (this.r() - 0.5) * this.ctx.size;
      if (!this.free(x, z, 0.15)) continue;
      const y = height(x, z);
      if (y > 1.25 || slopeAt(height, x, z) > 0.5) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.42)) continue;
      placed.push([x, z]);
      const rot = Math.round(this.r() * 4) * (Math.PI / 2) + (this.r() - 0.5) * 0.3;
      const nearLake = Math.hypot(x, z - 0.5) < 7.6;
      if (nearLake && this.r() < 0.45) {
        // 호숫가 중층 건물
        const h = 0.5 + this.r() * 0.7;
        towers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.03 + h / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(0.32, h, 0.32)));
      } else {
        const w = 0.22 + this.r() * 0.1, hh = 0.16 + this.r() * 0.1;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        bodies.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.03 + hh / 2, z), q, new THREE.Vector3(w, hh, w * 1.2)));
        roofs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.03 + hh + 0.07, z), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4)), new THREE.Vector3(w * 0.95, 0.14, w * 1.1)));
        bodyCols.push(new THREE.Color(HOUSE_COLORS[Math.floor(this.r() * HOUSE_COLORS.length)]));
        roofCols.push(new THREE.Color(ROOF_COLORS[Math.floor(this.r() * ROOF_COLORS.length)]));
      }
    }
    const body = this.instanced(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { rough: 0.8 }), bodies, bodyCols);
    const roofGeo = new THREE.ConeGeometry(0.75, 1, 4);
    const roof = this.instanced(roofGeo, mat('#ffffff', { rough: 0.7 }), roofs, roofCols);
    const tw = this.instanced(new THREE.BoxGeometry(1, 1, 1), windowMaterial(2, 3), towers);
    this.group.add(body, roof, tw);
  }

  private buildTrees(): void {
    const { height } = this.ctx;
    const N = this.cfg.fillers.trees;
    const pines: THREE.Matrix4[] = [], rounds: THREE.Matrix4[] = [];
    const pc: THREE.Color[] = [], rc: THREE.Color[] = [];
    let tries = 0;
    const base = [new THREE.Color('#3f7f45'), new THREE.Color('#4d9a4c'), new THREE.Color('#6cae52'), new THREE.Color('#2f6b3d')];
    while (pines.length + rounds.length < N && tries++ < N * 40) {
      const x = (this.r() - 0.5) * this.ctx.size, z = (this.r() - 0.5) * this.ctx.size;
      const y = height(x, z);
      // 산 쪽에 더 많이
      if (y < 1.0 && this.r() < 0.55) continue;
      if (!this.free(x, z, 0.0, 0.32)) continue;
      if (slopeAt(height, x, z) > 1.3) continue;
      const s = 0.7 + this.r() * 0.6;
      const c = base[Math.floor(this.r() * base.length)].clone().offsetHSL(0, 0, (this.r() - 0.5) * 0.06);
      if (y > 1.0 || this.r() < 0.4) {
        pines.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.02 + 0.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(0.18 * s, 0.4 * s, 0.18 * s)));
        pc.push(c);
      } else {
        rounds.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.16 * s, z), new THREE.Quaternion(), new THREE.Vector3(0.16 * s, 0.17 * s, 0.16 * s)));
        rc.push(c);
      }
    }
    this.group.add(
      this.instanced(new THREE.ConeGeometry(1, 1, 7), mat('#ffffff', { rough: 0.9 }), pines, pc),
      this.instanced(new THREE.IcosahedronGeometry(1, 0), mat('#ffffff', { rough: 0.9 }), rounds, rc),
    );
  }

  private buildStreetLights(): void {
    // 도로 곁 일정 간격 가로등 (도로 거리 함수가 0.3~0.45 인 땅 위)
    const { height } = this.ctx;
    const poles: THREE.Matrix4[] = [], bulbs: THREE.Matrix4[] = [];
    let tries = 0;
    const pts: [number, number][] = [];
    while (poles.length < 34 && tries++ < 4000) {
      const x = (this.r() - 0.5) * this.ctx.size, z = (this.r() - 0.5) * this.ctx.size;
      const d = this.ctx.roadDist(x, z);
      if (d < 0.3 || d > 0.4) continue;
      if (height(x, z) < this.ctx.sea + 0.12) continue;
      if (pts.some(([a, b]) => Math.hypot(a - x, b - z) < 0.9)) continue;
      pts.push([x, z]);
      const y = height(x, z);
      poles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.17, z), new THREE.Quaternion(), new THREE.Vector3(0.012, 0.34, 0.012)));
      bulbs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.35, z), new THREE.Quaternion(), new THREE.Vector3(0.035, 0.035, 0.035)));
    }
    this.group.add(
      this.instanced(new THREE.CylinderGeometry(1, 1, 1, 5), mat('#5b616b'), poles),
      this.instanced(new THREE.SphereGeometry(1, 6, 4), glow('#ffe2a0', 0.05, 2.6), bulbs),
    );
  }

  private buildWalkers(): void {
    const { people, humanoids } = this.cfg.fillers;
    const total = people + humanoids;
    if (total === 0) return;
    this.humanoidCount = humanoids;
    const anchors = this.ctx.anchors.length ? this.ctx.anchors : [{ x: 0, z: 0, r: 3 }];
    for (let i = 0; i < total; i++) {
      const a = anchors[i % anchors.length];
      let x = a.x, z = a.z;
      for (let t = 0; t < 30; t++) {
        const ang = this.r() * Math.PI * 2, d = this.r() * a.r;
        const px = a.x + Math.cos(ang) * d, pz = a.z + Math.sin(ang) * d;
        if (this.ctx.height(px, pz) > this.ctx.sea + 0.1) { x = px; z = pz; break; }
      }
      this.walkers.push({ x, z, tx: x, tz: z, speed: 0.12 + this.r() * 0.12, ax: a.x, az: a.z, ar: a.r, phase: this.r() * 10 });
    }
    // 앞쪽 humanoids 개는 휴머노이드(은색 몸 + 빛나는 눈), 나머지는 사람
    const bodyGeo = new THREE.CapsuleGeometry(0.028, 0.07, 2, 6);
    const headGeo = new THREE.SphereGeometry(0.03, 8, 6);
    const bodyMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.1 }));
    const headMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.2 }));
    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, total);
    this.headMesh = new THREE.InstancedMesh(headGeo, headMat, total);
    const visorMat = accent(1.4, 2.6);
    this.visorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.012, 0.03), visorMat, Math.max(1, humanoids));
    const skin = ['#f1c9a5', '#d9a77f', '#a8714c', '#f6dcc3'];
    for (let i = 0; i < total; i++) {
      const isBot = i < humanoids;
      this.bodyMesh.setColorAt(i, new THREE.Color(isBot ? '#dfe5ec' : PEOPLE_COLORS[i % PEOPLE_COLORS.length]));
      this.headMesh.setColorAt(i, new THREE.Color(isBot ? '#f4f7fa' : skin[i % skin.length]));
    }
    for (const m of [this.bodyMesh, this.headMesh, this.visorMesh]) { m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.updateWalkers(0, 0);
  }

  updateWalkers(dt: number, time: number): void {
    if (!this.bodyMesh || !this.headMesh || !this.visorMesh) return;
    const d = this.dummy;
    const { height, sea } = this.ctx;
    this.walkers.forEach((w, i) => {
      const dx = w.tx - w.x, dz = w.tz - w.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        for (let t = 0; t < 8; t++) {
          const ang = Math.random() * Math.PI * 2, rr = Math.random() * w.ar;
          const px = w.ax + Math.cos(ang) * rr, pz = w.az + Math.sin(ang) * rr;
          if (height(px, pz) > sea + 0.1) { w.tx = px; w.tz = pz; break; }
        }
      } else {
        const step = Math.min(dist, w.speed * dt);
        const nx = w.x + (dx / dist) * step, nz = w.z + (dz / dist) * step;
        if (height(nx, nz) > sea + 0.08) { w.x = nx; w.z = nz; } else { w.tx = w.x; w.tz = w.z; }
      }
      const y = height(w.x, w.z);
      const bob = Math.abs(Math.sin(time * 8 + w.phase)) * 0.012;
      const yaw = Math.atan2(dx, dz);
      const isBot = i < this.humanoidCount;
      const s = isBot ? 1.08 : 1;
      d.position.set(w.x, y + 0.063 * s + bob, w.z); d.rotation.set(0, yaw, 0); d.scale.setScalar(s); d.updateMatrix();
      this.bodyMesh!.setMatrixAt(i, d.matrix);
      d.position.y = y + 0.15 * s + bob; d.updateMatrix();
      this.headMesh!.setMatrixAt(i, d.matrix);
      if (isBot) {
        d.position.set(w.x + Math.sin(yaw) * 0.022, y + 0.155 * s + bob, w.z + Math.cos(yaw) * 0.022); d.updateMatrix();
        this.visorMesh!.setMatrixAt(i, d.matrix);
      }
    });
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.visorMesh.instanceMatrix.needsUpdate = true;
  }

  private instanced(geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], cols?: THREE.Color[]): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, mats.length));
    im.count = mats.length;
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); if (cols) im.setColorAt(i, cols[i]); });
    im.castShadow = true; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return im;
  }
}

