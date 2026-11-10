// 높이 함수 · 지형 메시 · 단면 지층
import * as THREE from 'three';
import type { ShapeDef, TerrainDef } from './config';
import { patchMaterial } from './jelly';

export const FLOOR = -1.4; // 물 밑바닥 높이
export const BLOCK_BOTTOM = -3; // 블록 바닥
export const TUNNEL = { bottom: -2.5, top: -1.85 }; // 지하철 터널 띠

/** 시드 고정 난수 (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D 값 노이즈 + fBm */
export function makeNoise(seed: number): (x: number, z: number) => number {
  const r = rng(seed);
  const P = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const V = new Float32Array(256).map(() => r() * 2 - 1);
  const fade = (t: number) => t * t * (3 - 2 * t);
  const val = (x: number, z: number) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const X = xi & 255, Z = zi & 255;
    const a = V[P[P[X] + Z]], b = V[P[P[X + 1] + Z]], c = V[P[P[X] + Z + 1]], d = V[P[P[X + 1] + Z + 1]];
    const u = fade(xf), v = fade(zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, z) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < 4; o++) { s += val(x * f + o * 17.3, z * f - o * 9.1) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

const smooth = (sd: number) => {
  // 경계 폭 0.6: sd=+0.3 → 0, sd=-0.3 → 1
  const t = Math.min(1, Math.max(0, (0.3 - sd) / 0.6));
  return t * t * (3 - 2 * t);
};

function sdShape(s: ShapeDef, x: number, z: number): { sd: number; profile: number } {
  if (s.shape === 'circle') {
    const r = s.r ?? 1;
    const d = Math.hypot(x - s.x, z - s.z);
    const q = Math.min(1, d / r);
    return { sd: d - r, profile: 1 - 0.72 * q * q };
  }
  if (s.shape === 'capsule') {
    const ax = s.x, az = s.z, bx = s.x2 ?? s.x, bz = s.z2 ?? s.z;
    const px = x - ax, pz = z - az, vx = bx - ax, vz = bz - az;
    const h = Math.min(1, Math.max(0, (px * vx + pz * vz) / (vx * vx + vz * vz || 1)));
    return { sd: Math.hypot(px - vx * h, pz - vz * h) - (s.r ?? 1), profile: 1 };
  }
  const hx = (s.w ?? 1) / 2, hz = (s.d ?? 1) / 2;
  const dx = Math.abs(x - s.x) - hx, dz = Math.abs(z - s.z) - hz;
  const out = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return { sd: out + Math.min(Math.max(dx, dz), 0), profile: 1 };
}

/** shapes 가 비어 있을 때 terrain_type 별 기본 배치 */
export function defaultShapes(type: TerrainDef['type'], size: number): ShapeDef[] {
  const h = size / 2, big = size + 1;
  switch (type) {
    case 'coast': // 북쪽 60% 가 땅
      return [{ op: 'add', shape: 'box', x: 0, z: -h + size * 0.3, w: big, d: size * 0.6, h: 0.8 }];
    case 'river': // 가운데를 가로지르는 폭 3 강
      return [
        { op: 'add', shape: 'box', x: 0, z: 0, w: big, d: big, h: 0.7 },
        { op: 'sub', shape: 'capsule', x: -h - 1, z: 0.6, x2: h + 1, z2: -0.6, r: 1.5 },
      ];
    case 'basin': // 가운데 호수 + 사방 산
      return [
        { op: 'add', shape: 'box', x: 0, z: 0, w: big, d: big, h: 0.7 },
        { op: 'sub', shape: 'circle', x: 0, z: 0, r: size * 0.22 },
        ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ op: 'add' as const, shape: 'circle' as const, x: sx * h * 0.8, z: sz * h * 0.8, r: size * 0.15, h: 2.4 })),
      ];
    case 'island': // 가운데 섬 + 사방 바다
    default:
      return [{ op: 'add', shape: 'circle', x: 0, z: 0, r: size * 0.3, h: 1.6 }];
  }
}

export type HeightFn = (x: number, z: number) => number;

/** 도형 합집합(부드러운 경계) × 높이 + fBm 노이즈 */
export function makeHeightFn(t: TerrainDef): HeightFn {
  const noise = makeNoise(t.noise.seed);
  const { scale, amp } = t.noise;
  const shapes = t.shapes.length ? t.shapes : defaultShapes(t.type, t.size);
  return (x, z) => {
    let H = FLOOR;
    for (const s of shapes) {
      const { sd, profile } = sdShape(s, x, z);
      if (sd > 0.31) continue;
      const m = smooth(sd);
      if (s.op === 'add') H = Math.max(H, FLOOR + ((s.h ?? 1.2) * profile - FLOOR) * m);
      else H = H + (FLOOR - H) * m;
    }
    const n = noise(x * scale, z * scale);
    const land = Math.min(1, Math.max(0, (H - FLOOR) / 0.8));
    H += n * amp * (0.35 + land * (0.65 + Math.max(0, H - 1) * 0.6));
    return H;
  };
}

export function slopeAt(h: HeightFn, x: number, z: number, e = 0.15): number {
  const dx = (h(x + e, z) - h(x - e, z)) / (2 * e);
  const dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

const C = {
  sand: new THREE.Color('#e9d9a6'), wetSand: new THREE.Color('#cdbb8a'), grass: new THREE.Color('#8fc46b'),
  grass2: new THREE.Color('#a4cf72'), forest: new THREE.Color('#4f8a47'), rock: new THREE.Color('#9a958c'),
  floor: new THREE.Color('#c2b48a'), soil: new THREE.Color('#8a6748'), strataSand: new THREE.Color('#d9c08a'),
  stone: new THREE.Color('#6c6862'), stone2: new THREE.Color('#5d5955'),
};

export function terrainColor(h: HeightFn, x: number, z: number, sea: number, out: THREE.Color, wobble: number): THREE.Color {
  const y = h(x, z);
  const sl = slopeAt(h, x, z);
  if (y < sea - 0.25) out.copy(C.floor).lerp(C.wetSand, Math.min(1, (y - FLOOR) / 1.2));
  else if (y < sea + 0.15) out.copy(C.sand);
  else if (sl > 0.7 && y > 0.9) out.copy(C.rock);
  else if (y > 1.25) out.copy(C.forest).lerp(C.rock, Math.min(1, Math.max(0, (y - 2.2) / 0.8)));
  else out.copy(C.grass).lerp(C.grass2, wobble);
  return out;
}

export interface TerrainBuild {
  group: THREE.Group;
  mesh: THREE.Mesh;
  walls: THREE.Mesh;
  height: HeightFn;
}

export function buildTerrain(t: TerrainDef, res = 160): TerrainBuild {
  const height = makeHeightFn(t);
  const size = t.size;
  const half = size / 2;
  const noise = makeNoise(t.noise.seed + 101);
  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, height(x, z));
    terrainColor(height, x, z, t.seaLevel, col, noise(x * 0.9, z * 0.9) * 0.5 + 0.5);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: false }), { underwaterCaustics: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';

  const walls = buildStrataWalls(height, half, t.noise.seed);
  const group = new THREE.Group();
  group.add(mesh, walls, buildTunnel(half), buildBottom(size));
  return { group, mesh, walls, height };
}

/** 블록 옆면 4개 — 흙 · 모래 · 암석 3색 띠, 지하철 터널 띠는 비운다 */
function buildStrataWalls(height: HeightFn, half: number, seed: number): THREE.Mesh {
  const noise = makeNoise(seed + 33);
  const segs = 140;
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const sides = [
    { n: [0, 0, 1], at: (u: number) => [u, half] },   // 남
    { n: [0, 0, -1], at: (u: number) => [-u, -half] }, // 북
    { n: [1, 0, 0], at: (u: number) => [half, -u] },   // 동
    { n: [-1, 0, 0], at: (u: number) => [-half, u] },  // 서
  ];
  const quad = (ax: number, az: number, bx: number, bz: number, ya0: number, ya1: number, yb0: number, yb1: number, c: THREE.Color, n: number[]) => {
    if (ya1 - ya0 < 1e-4 && yb1 - yb0 < 1e-4) return;
    positions.push(ax, ya0, az, bx, yb0, bz, bx, yb1, bz, ax, ya0, az, bx, yb1, bz, ax, ya1, az);
    for (let k = 0; k < 6; k++) { colors.push(c.r, c.g, c.b); normals.push(n[0], n[1], n[2]); }
  };
  for (const s of sides) {
    for (let i = 0; i < segs; i++) {
      const u0 = -half + (i / segs) * half * 2, u1 = -half + ((i + 1) / segs) * half * 2;
      const [ax, az] = s.at(u0), [bx, bz] = s.at(u1);
      const levels = (x: number, z: number) => {
        const H = height(x, z);
        const rockTop = Math.min(H, Math.max(TUNNEL.top, -0.95 + noise(x * 0.5, z * 0.5) * 0.35));
        const soilBot = Math.min(H, Math.max(rockTop, H - 0.42 - noise(x * 1.3 + 4, z * 1.3) * 0.12));
        const midRock = BLOCK_BOTTOM + 0.22 + noise(x * 0.7 - 3, z * 0.7) * 0.08;
        return { H, rockTop, soilBot, midRock };
      };
      const A = levels(ax, az), B = levels(bx, bz);
      quad(ax, az, bx, bz, BLOCK_BOTTOM, A.midRock, BLOCK_BOTTOM, B.midRock, C.stone2, s.n);
      quad(ax, az, bx, bz, A.midRock, TUNNEL.bottom, B.midRock, TUNNEL.bottom, C.stone, s.n);
      quad(ax, az, bx, bz, TUNNEL.top, A.rockTop, TUNNEL.top, B.rockTop, C.stone, s.n);
      quad(ax, az, bx, bz, A.rockTop, A.soilBot, B.rockTop, B.soilBot, C.strataSand, s.n);
      quad(ax, az, bx, bz, A.soilBot, A.H, B.soilBot, B.H, C.soil, s.n);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  const m = new THREE.Mesh(geo, mat);
  m.name = 'walls';
  m.receiveShadow = true;
  return m;
}

/** 블록 안쪽 둘레의 지하철 터널(바닥 · 안쪽 벽 · 천장) + 바깥 유리 */
function buildTunnel(half: number): THREE.Group {
  const g = new THREE.Group();
  const inner = half - 0.95;
  const h = TUNNEL.top - TUNNEL.bottom;
  const dark = patchMaterial(new THREE.MeshStandardMaterial({ color: '#2b2f38', roughness: 0.8, side: THREE.DoubleSide }));
  const floorMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#4a4f5a', roughness: 0.9, side: THREE.DoubleSide }));
  const glass = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide }));
  const lampMat = patchMaterial(new THREE.MeshBasicMaterial({ color: '#ffe7a8' }));
  for (let k = 0; k < 4; k++) {
    const rot = (k * Math.PI) / 2;
    const side = new THREE.Group();
    side.rotation.y = rot;
    // 안쪽 벽 (z = inner 면)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(inner * 2, h), dark);
    wall.position.set(0, (TUNNEL.top + TUNNEL.bottom) / 2, inner);
    // 바닥 / 천장
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half - inner), floorMat);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, TUNNEL.bottom, (half + inner) / 2);
    const ce = fl.clone();
    ce.material = dark;
    ce.position.y = TUNNEL.top;
    // 바깥 유리
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, h), glass);
    gl.position.set(0, (TUNNEL.top + TUNNEL.bottom) / 2, half);
    gl.renderOrder = 3;
    // 레일
    const rail = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.03, 0.18), floorMat);
    rail.position.set(0, TUNNEL.bottom + 0.015, half - 0.45);
    side.add(wall, fl, ce, gl, rail);
    // 터널 조명
    for (let i = -4; i <= 4; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.06), lampMat);
      lamp.position.set(i * 2.1, TUNNEL.top - 0.03, inner + 0.08);
      side.add(lamp);
    }
    g.add(side);
  }
  g.name = 'tunnel';
  return g;
}

function buildBottom(size: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.12, size),
    patchMaterial(new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 1 })),
  );
  m.position.y = BLOCK_BOTTOM - 0.06;
  m.receiveShadow = true;
  return m;
}
