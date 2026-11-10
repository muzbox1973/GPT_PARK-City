// 랜드마크 키트 공용 도구: 기본 도형 · 재질 캐시 · 애니메이션/밤 조명 등록
import * as THREE from 'three';
import { patchMaterial } from '../jelly';

export interface Env { time: number; dt: number; wind: number; night: number }
export type Animator = (env: Env) => void;
export interface Nightable { mat: THREE.MeshStandardMaterial; day: number; night: number }

export const animators: Animator[] = [];
export const nightables: Nightable[] = [];
/** 선택된 맛의 강조색을 따라가는 재질 */
export const accentMats: THREE.MeshStandardMaterial[] = [];

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: THREE.ColorRepresentation, opts: { rough?: number; metal?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.flat ?? true}`;
  let m = cache.get(key);
  if (!m) {
    m = patchMaterial(new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, flatShading: opts.flat ?? true }));
    cache.set(key, m);
  }
  return m;
}

/** 밤이 되면 빛나는 재질 (창문 · 네온 · 가로등) */
export function glow(color: THREE.ColorRepresentation, day = 0.15, night = 1.6, opts: { base?: THREE.ColorRepresentation } = {}): THREE.MeshStandardMaterial {
  const m = patchMaterial(new THREE.MeshStandardMaterial({
    color: opts.base ?? color, emissive: color, emissiveIntensity: day, roughness: 0.5, flatShading: true,
  }));
  nightables.push({ mat: m, day, night });
  return m;
}

export function accent(day = 0.4, night = 1.8): THREE.MeshStandardMaterial {
  const m = glow('#14a9ae', day, night);
  accentMats.push(m);
  return m;
}

type M = THREE.Material;
export function box(w: number, h: number, d: number, m: M, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function cyl(rt: number, rb: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function cone(r: number, h: number, m: M, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
}
export function sph(r: number, m: M, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
/** 두 점 사이 가는 막대 (케이블 · 트러스) */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: M): THREE.Mesh {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

let winTex: { day: THREE.CanvasTexture; night: THREE.CanvasTexture } | null = null;
/** 창문 격자 텍스처 2장: 낮(밝은 유리) map + 밤(켜진 창) emissiveMap */
function baseWindowTextures(): { day: THREE.CanvasTexture; night: THREE.CanvasTexture } {
  if (winTex) return winTex;
  const mk = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; return c; };
  const dc = mk(), nc = mk();
  const d = dc.getContext('2d')!, n = nc.getContext('2d')!;
  d.fillStyle = '#e9eef3'; d.fillRect(0, 0, 64, 128);
  n.fillStyle = '#000000'; n.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10) {
    d.fillStyle = Math.random() < 0.5 ? '#9fb8cf' : '#b7cadb';
    d.fillRect(x, y, 6, 6);
    if (Math.random() < 0.65) { n.fillStyle = Math.random() < 0.25 ? '#bfe9ff' : '#ffd98a'; n.fillRect(x, y, 6, 6); }
  }
  const t = (c: HTMLCanvasElement) => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx; };
  winTex = { day: t(dc), night: t(nc) };
  return winTex;
}

/** 반복 횟수를 정한 창문 재질 (낮엔 유리, 밤엔 창이 켜짐) */
export function windowMaterial(rx: number, ry: number, tint: THREE.ColorRepresentation = '#ffffff'): THREE.MeshStandardMaterial {
  const b = baseWindowTextures();
  const day = b.day.clone(), night = b.night.clone();
  for (const tx of [day, night]) { tx.repeat.set(rx, ry); tx.needsUpdate = true; }
  const m = patchMaterial(new THREE.MeshStandardMaterial({ color: tint, map: day, emissive: '#ffffff', emissiveMap: night, emissiveIntensity: 0, roughness: 0.35, metalness: 0.1, flatShading: true }));
  nightables.push({ mat: m, day: 0, night: 1.3 });
  return m;
}

export function group(labelY: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (children.length) g.add(...children);
  g.userData.labelY = labelY;
  return g;
}

export const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
export const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
