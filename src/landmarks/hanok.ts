// 기와지붕 한옥 · 사찰 (wings 1~3 → ㅡ / ㄱ / ㄷ 배치)
import * as THREE from 'three';
import { box, group, mat, num } from './kit';
import type { KitBuilder } from './types';

function roof(len: number, depth: number, m: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  const w = depth / 2 + 0.18;
  s.moveTo(-w, 0);
  s.quadraticCurveTo(-w * 0.55, 0.08, -0.06, 0.42);
  s.lineTo(0.06, 0.42);
  s.quadraticCurveTo(w * 0.55, 0.08, w, 0);
  s.lineTo(w - 0.05, -0.05);
  s.lineTo(-w + 0.05, -0.05);
  const geo = new THREE.ExtrudeGeometry(s, { depth: len + 0.3, bevelEnabled: false });
  geo.translate(0, 0, -(len + 0.3) / 2);
  geo.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

const build: KitBuilder = (p) => {
  const wings = Math.max(1, Math.min(3, Math.round(num(p.wings, 1))));
  const stone = mat('#c9c2b4'), wall = mat('#f4efe4'), wood = mat('#7a4b2e'), tile = mat('#4a4f57', { rough: 0.6 });
  const g = group(1.6);
  const wing = (len: number, x: number, z: number, rot: number) => {
    const w = new THREE.Group();
    w.add(box(len + 0.2, 0.12, 0.8, stone));
    w.add(box(len, 0.42, 0.56, wall, 0, 0.12));
    const cols = Math.round(len / 0.35);
    for (let i = 0; i <= cols; i++) w.add(box(0.05, 0.42, 0.6, wood, -len / 2 + i * (len / cols), 0.12));
    const r = roof(len, 0.6, tile);
    r.position.y = 0.56;
    w.add(r);
    w.position.set(x, 0, z);
    w.rotation.y = rot;
    g.add(w);
  };
  wing(1.6, 0, 0, 0);
  if (wings >= 2) wing(1.1, 0.95, 0.75, Math.PI / 2);
  if (wings >= 3) wing(1.1, -0.95, 0.75, Math.PI / 2);
  return g;
};
export default build;
