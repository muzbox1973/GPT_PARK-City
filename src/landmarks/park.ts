// 공원: 잔디 + 나무 + 분수(물줄기 애니메이션)
import * as THREE from 'three';
import { animators, box, cone, cyl, glow, group, mat, sph } from './kit';
import { patchMaterial } from '../jelly';
import type { KitBuilder } from './types';

const build: KitBuilder = (_p, ctx) => {
  const g = group(1.3);
  const lawn = cyl(1.25, 1.3, 0.06, mat('#79bf5f'), 0, ctx.ground(0, 0) - 0.03, 0, 28);
  const path = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 4, 36), mat('#e6dcc3'));
  path.rotation.x = Math.PI / 2; path.position.y = 0.05;
  g.add(lawn, path);
  // 분수
  g.add(cyl(0.3, 0.32, 0.08, mat('#cfd6dd'), 0, 0.03));
  const pool = cyl(0.26, 0.26, 0.02, mat('#6cc3f2', { rough: 0.1 }), 0, 0.09);
  g.add(pool, cyl(0.04, 0.05, 0.16, mat('#cfd6dd'), 0, 0.09));
  const jetMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.75, roughness: 0.1 }));
  const jet = cone(0.06, 0.35, jetMat, 0, 0.24, 0, 8);
  g.add(jet);
  animators.push((e) => { jet.scale.y = 0.75 + Math.sin(e.time * 5) * 0.25; jet.position.y = 0.24 + (jet.scale.y * 0.35) / 2 - 0.17; });
  // 나무
  const leaf = mat('#3f8c46'), leaf2 = mat('#5fae4c'), trunk = mat('#7a5537');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, d = 1.02;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    g.add(cyl(0.025, 0.03, 0.12, trunk, x, 0.02, z, 5));
    if (i % 2) g.add(cone(0.14, 0.34, leaf, x, 0.12, z, 7)); else g.add(sph(0.15, leaf2, x, 0.26, z, 8));
  }
  // 벤치 · 가로등
  const wood = mat('#a3784f');
  const lamp = glow('#ffe7a8', 0.1, 2.2);
  for (const a of [0.6, 2.2, 3.8, 5.4]) {
    const x = Math.cos(a) * 0.52, z = Math.sin(a) * 0.52;
    const b = box(0.2, 0.05, 0.07, wood, x, 0.06, z);
    b.rotation.y = -a;
    g.add(b, cyl(0.012, 0.012, 0.3, mat('#555c66'), x * 1.42, 0.03, z * 1.42, 5), sph(0.03, lamp, x * 1.42, 0.35, z * 1.42, 6));
  }
  return g;
};
export default build;
