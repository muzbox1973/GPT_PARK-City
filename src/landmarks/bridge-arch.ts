// 아치교: 상판 위로 둥근 아치 + 행어
import * as THREE from 'three';
import { box, group, mat, num, rod } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (p) => {
  const L = num(p.length, 6);
  const deckY = 0.86;
  const red = mat('#d9584a', { rough: 0.5 });
  const grey = mat('#9aa3ad', { rough: 0.6 });
  const g = group(2.4);
  g.userData.onWater = true;
  g.add(box(L, 0.12, 0.6, grey, 0, deckY - 0.12));
  const seg = 16, rise = 1.4;
  for (const z of [-0.3, 0.3]) {
    let prev = new THREE.Vector3(-L / 2, deckY, z);
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const pt = new THREE.Vector3(-L / 2 + t * L, deckY + Math.sin(t * Math.PI) * rise, z);
      g.add(rod(prev, pt, 0.05, red));
      if (i < seg && i % 2 === 0) g.add(rod(pt, new THREE.Vector3(pt.x, deckY, z), 0.012, red));
      prev = pt;
    }
  }
  for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) g.add(box(0.3, deckY + 1.4, 0.7, grey, x, -1.4));
  return g;
};
export default build;
