// 물결 높이장 시뮬 · 젤리 수면 · 단면 물벽 · 물보라
import * as THREE from 'three';
import { patchMaterial } from './jelly';
import type { HeightFn } from './terrain';

/** 파도 잔잔함 0~100 → 프레임당 감쇠 (0.998 ~ 0.95) */
export function calmToDamping(calm: number): number {
  const c = Math.max(0, Math.min(100, calm)) / 100;
  return 0.998 + (0.95 - 0.998) * c;
}

/** CPU 2차 파동 방정식 높이장. 땅 칸은 벽(값 0 고정)이라 물결이 반사된다. */
export class WaterSim {
  cur: Float32Array;
  prev: Float32Array;
  wet: Uint8Array;
  active: Int32Array = new Int32Array(0);
  damping = 0.985;
  readonly cell: number;
  constructor(public n: number, public size: number) {
    this.cur = new Float32Array(n * n);
    this.prev = new Float32Array(n * n);
    this.wet = new Uint8Array(n * n);
    this.cell = size / (n - 1);
  }
  xOf(i: number): number { return -this.size / 2 + i * this.cell; }
  /** 수위보다 낮은 칸만 물로 시뮬레이션 */
  setMask(height: HeightFn, level: number): void {
    const { n } = this;
    const list: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
      const w = !edge && height(this.xOf(i), this.xOf(j)) < level - 0.01;
      this.wet[k] = w ? 1 : 0;
      if (w) list.push(k); else { this.cur[k] = 0; this.prev[k] = 0; }
    }
    this.active = Int32Array.from(list);
  }
  fillAll(): void { // 테스트용: 가장자리 빼고 전부 물
    const { n } = this; const list: number[] = [];
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { const k = j * n + i; this.wet[k] = 1; list.push(k); }
    this.active = Int32Array.from(list);
  }
  hasWater(): boolean { return this.active.length > 0; }
  isWet(x: number, z: number): boolean {
    const i = Math.round((x + this.size / 2) / this.cell), j = Math.round((z + this.size / 2) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return false;
    return this.wet[j * this.n + i] === 1;
  }
  /** (x,z) 에 반경 radius 의 물결을 일으킨다 */
  disturb(x: number, z: number, radius: number, strength: number): void {
    const { n, cell } = this;
    const ci = (x + this.size / 2) / cell, cj = (z + this.size / 2) / cell;
    const rc = Math.max(1, radius / cell);
    const i0 = Math.max(1, Math.floor(ci - rc)), i1 = Math.min(n - 2, Math.ceil(ci + rc));
    const j0 = Math.max(1, Math.floor(cj - rc)), j1 = Math.min(n - 2, Math.ceil(cj + rc));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      if (!this.wet[k]) continue;
      const d = Math.hypot(i - ci, j - cj) / rc;
      if (d >= 1) continue;
      const f = 0.5 + 0.5 * Math.cos(d * Math.PI);
      this.cur[k] -= strength * f;
    }
  }
  step(): void {
    const { n, cur, prev, active, damping } = this;
    for (let a = 0; a < active.length; a++) {
      const k = active[a];
      const v = (cur[k - 1] + cur[k + 1] + cur[k - n] + cur[k + n]) * 0.5 - prev[k];
      prev[k] = v * damping;
    }
    this.cur = prev; this.prev = cur;
  }
  sample(x: number, z: number): number {
    const { n, cell } = this;
    const fx = (x + this.size / 2) / cell, fz = (z + this.size / 2) / cell;
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const c = this.cur;
    const a = c[j * n + i], b = c[j * n + i + 1], d = c[(j + 1) * n + i], e = c[(j + 1) * n + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + d * (1 - u) * v + e * u * v;
  }
  maxAbs(): number {
    let m = 0;
    for (let k = 0; k < this.cur.length; k++) { const v = Math.abs(this.cur[k]); if (v > m) m = v; }
    return m;
  }
  clear(): void { this.cur.fill(0); this.prev.fill(0); }
}

/** 수면 메시 + 단면 물벽 + 물보라를 묶은 렌더 쪽 */
export class Water {
  sim: WaterSim;
  surface!: THREE.Mesh;
  surfaceMat: THREE.MeshPhysicalMaterial;
  walls: THREE.Mesh;
  wallMat: THREE.MeshStandardMaterial;
  splash: Splash;
  group = new THREE.Group();
  level = 0;
  private wallSegs = 128;
  private topColor = new THREE.Color();
  private botColor = new THREE.Color();
  constructor(private size: number, private height: HeightFn, n: number) {
    this.sim = new WaterSim(n, size);
    this.surfaceMat = patchMaterial(new THREE.MeshPhysicalMaterial({
      color: '#3fa9f5', transmission: 0.6, roughness: 0.08, metalness: 0, ior: 1.33, thickness: 0.8,
      transparent: true, opacity: 0.92, clearcoat: 0.6, clearcoatRoughness: 0.1, attenuationColor: new THREE.Color('#1e6fd9'), attenuationDistance: 2.5,
    }), { surfaceCaustics: true });
    this.buildSurface(n);
    this.wallMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.86, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    this.walls = this.buildWalls();
    this.splash = new Splash(512);
    this.group.add(this.surface, this.walls, this.splash.points);
  }
  private buildSurface(n: number): void {
    const s = this.size - 0.04;
    const geo = new THREE.PlaneGeometry(s, s, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.size);
    if (this.surface) { this.surface.geometry.dispose(); this.surface.geometry = geo; }
    else { this.surface = new THREE.Mesh(geo, this.surfaceMat); this.surface.name = 'water'; this.surface.receiveShadow = true; }
  }
  /** 품질 단계 변경 시 격자 크기 교체 */
  setResolution(n: number): void {
    if (n === this.sim.n) return;
    const damping = this.sim.damping;
    this.sim = new WaterSim(n, this.size);
    this.sim.damping = damping;
    this.sim.setMask(this.height, this.level);
    this.buildSurface(n);
  }
  setLevel(level: number): void {
    this.level = level;
    this.sim.setMask(this.height, level);
  }
  setColors(water: string, jelly: string): void {
    this.surfaceMat.color.set(jelly).lerp(new THREE.Color(water), 0.35);
    this.surfaceMat.attenuationColor.set(water);
    this.topColor.set(jelly);
    this.botColor.set(water).multiplyScalar(0.45);
    this.splash.mat.color.set(jelly).lerp(new THREE.Color('#ffffff'), 0.6);
  }
  private buildWalls(): THREE.Mesh {
    const segs = this.wallSegs;
    const count = 4 * segs * 6;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.size);
    const m = new THREE.Mesh(geo, this.wallMat);
    m.renderOrder = 2;
    m.name = 'waterWalls';
    return m;
  }
  /** 단면 물벽: 안쪽으로 0.02 들이고, 위는 물결 높이를 따라가며 아래로 갈수록 진하다 */
  private updateWalls(): void {
    const half = this.size / 2 - 0.02;
    const segs = this.wallSegs;
    const pos = this.walls.geometry.attributes.position as THREE.BufferAttribute;
    const colA = this.walls.geometry.attributes.color as THREE.BufferAttribute;
    const nor = this.walls.geometry.attributes.normal as THREE.BufferAttribute;
    const P = pos.array as Float32Array, Cc = colA.array as Float32Array, N = nor.array as Float32Array;
    const sides: [number, number, (u: number) => [number, number]][] = [
      [0, 1, (u) => [u, half]], [0, -1, (u) => [-u, -half]], [1, 0, (u) => [half, -u]], [-1, 0, (u) => [-half, u]],
    ];
    let o = 0;
    const tmp = new THREE.Color();
    const span = this.level - (-1.4);
    for (const [nx, nz, at] of sides) {
      for (let i = 0; i < segs; i++) {
        const u0 = -half + (i / segs) * half * 2, u1 = -half + ((i + 1) / segs) * half * 2;
        const [ax, az] = at(u0), [bx, bz] = at(u1);
        const ha = this.height(ax, az), hb = this.height(bx, bz);
        const inset = 0.25; // 시뮬 가장자리 칸은 0 이므로 한 칸 안쪽 값을 읽는다
        const ta = this.level + this.sim.sample(ax - nx * inset, az - nz * inset) * 0.8;
        const tb = this.level + this.sim.sample(bx - nx * inset, bz - nz * inset) * 0.8;
        const ya1 = Math.max(ha, ta), yb1 = Math.max(hb, tb);
        const ya0 = Math.min(ha, ya1), yb0 = Math.min(hb, yb1);
        const verts: [number, number, number, number][] = [
          [ax, ya0, az, 0], [bx, yb0, bz, 0], [bx, yb1, bz, 1], [ax, ya0, az, 0], [bx, yb1, bz, 1], [ax, ya1, az, 1],
        ];
        for (const [x, y, z, top] of verts) {
          P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = z;
          const depth = top ? 0 : Math.min(1, Math.max(0, (this.level - y) / Math.max(0.2, span)));
          tmp.copy(this.topColor).lerp(this.botColor, top ? 0 : 0.35 + depth * 0.65);
          Cc[o * 3] = tmp.r; Cc[o * 3 + 1] = tmp.g; Cc[o * 3 + 2] = tmp.b;
          N[o * 3] = nx; N[o * 3 + 1] = 0; N[o * 3 + 2] = nz;
          o++;
        }
      }
    }
    pos.needsUpdate = true; colA.needsUpdate = true; nor.needsUpdate = true;
  }
  /** 매 프레임: 시뮬 1스텝 + 수면 정점/법선 갱신 */
  update(dt: number, simulate: boolean): void {
    if (simulate) this.sim.step();
    const { n, cur, cell } = this.sim;
    const geo = this.surface.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const P = pos.array as Float32Array, N = nor.array as Float32Array;
    const amp = 0.8;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      P[k * 3 + 1] = this.level + cur[k] * amp;
      const l = cur[i > 0 ? k - 1 : k], r = cur[i < n - 1 ? k + 1 : k];
      const u = cur[j > 0 ? k - n : k], d = cur[j < n - 1 ? k + n : k];
      let nx = (l - r) * amp, nz = (u - d) * amp; const ny = 2 * cell;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; nz *= inv;
      N[k * 3] = nx; N[k * 3 + 1] = ny * inv; N[k * 3 + 2] = nz;
    }
    pos.needsUpdate = true; nor.needsUpdate = true;
    this.updateWalls();
    this.splash.update(dt);
  }
  heightAt(x: number, z: number): number { return this.level + this.sim.sample(x, z) * 0.8; }
  isWater(x: number, z: number): boolean {
    const h = this.size / 2;
    return Math.abs(x) < h && Math.abs(z) < h && this.height(x, z) < this.level - 0.02;
  }
}

/** Points 512개 재사용 풀 */
export class Splash {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  constructor(public max: number) {
    this.pos = new Float32Array(max * 3).fill(-999);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    this.mat = patchMaterial(new THREE.PointsMaterial({ color: '#dff4ff', size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, count: number, power = 1): void {
    for (let c = 0; c < count; c++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2, r = (0.3 + Math.random() * 0.9) * power;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * r; this.vel[i * 3 + 1] = (1.6 + Math.random() * 2.2) * power; this.vel[i * 3 + 2] = Math.sin(a) * r;
      this.life[i] = 0.7 + Math.random() * 0.6;
    }
  }
  update(dt: number): void {
    const { pos, vel, life } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0) pos[i * 3 + 1] = -999;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
