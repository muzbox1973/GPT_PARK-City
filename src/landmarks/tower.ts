// 전망탑 · 방송탑 — 드론버스 정거장 원반과 네온 띠를 가진 탑
import * as THREE from 'three';
import { accent, animators, box, cone, cyl, glow, group, mat, num, sph, str } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (p) => {
  const H = num(p.height, 5);
  const body = mat(str(p.color, '#e9edf2'), { rough: 0.35, metal: 0.25, flat: false });
  const dark = mat('#39404c', { rough: 0.4, metal: 0.4 });
  const neon = accent(0.6, 2.2);
  const win = glow('#bfe9ff', 0.2, 1.8, { base: '#2f3a4a' });
  const g = group(H + 0.5);
  g.add(cyl(0.8, 0.95, 0.28, dark));
  g.add(cyl(0.18, 0.4, H * 0.86, body, 0, 0.28));
  // 드론버스 정거장 원반
  const padY = H * 0.45;
  g.add(cyl(0.78, 0.7, 0.07, body, 0, padY));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.025, 6, 40), neon);
  ring.rotation.x = Math.PI / 2; ring.position.y = padY + 0.07;
  g.add(ring);
  g.userData.pad = new THREE.Vector3(0.5, padY + 0.07, 0.12);
  // 전망대
  const podY = H * 0.74;
  const pod = sph(0.42, body, 0, podY, 0, 20);
  pod.scale.y = 0.75;
  g.add(pod);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 24, 1, true), win);
  band.position.y = podY;
  g.add(band);
  // 네온 띠
  for (const f of [0.18, 0.3, 0.6]) {
    const r = 0.4 - (0.22 * f) / 0.86 + 0.01;
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 24), neon);
    t.rotation.x = Math.PI / 2; t.position.y = 0.28 + H * 0.86 * f;
    g.add(t);
  }
  g.add(cone(0.07, H * 0.2, dark, 0, podY + 0.25));
  const tip = sph(0.06, neon, 0, podY + 0.25 + H * 0.2, 0, 8);
  g.add(tip);
  animators.push((e) => { tip.visible = Math.sin(e.time * 3) > -0.3; });
  g.add(box(0.5, 0.06, 0.5, dark, 0, 0.28));
  return g;
};
export default build;
