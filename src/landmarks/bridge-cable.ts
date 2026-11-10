// 사장교: 주탑 + 부채꼴 케이블. 기준점 높이 = 해수면
import * as THREE from 'three';
import { box, glow, group, mat, num, rod } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (p) => {
  const L = num(p.length, 8);
  const pylons = Math.max(1, Math.min(3, Math.round(num(p.pylons, 2))));
  const deckY = 0.86;
  const white = mat('#f2f4f7', { rough: 0.4 });
  const grey = mat('#9aa3ad', { rough: 0.6 });
  const cable = mat('#ffffff', { rough: 0.3 });
  const lamp = glow('#ffe9b0', 0.1, 2.0);
  const g = group(3.6);
  g.userData.onWater = true;
  g.add(box(L, 0.12, 0.62, grey, 0, deckY - 0.12));
  g.add(box(L, 0.03, 0.05, white, 0, deckY, 0.3), box(L, 0.03, 0.05, white, 0, deckY, -0.3));
  const topY = 3.1;
  const xs = pylons === 1 ? [0] : Array.from({ length: pylons }, (_, i) => -L * 0.24 + (i * L * 0.48) / (pylons - 1));
  for (const px of xs) {
    for (const z of [-0.36, 0.36]) {
      const leg = rod(new THREE.Vector3(px, -1.4, z * 1.25), new THREE.Vector3(px, topY, z * 0.35), 0.075, white);
      leg.castShadow = true;
      g.add(leg);
    }
    g.add(box(0.18, 0.12, 0.9, white, px, deckY - 0.3));
    g.add(box(0.16, 0.16, 0.3, white, px, topY - 0.1));
    for (let k = 1; k <= 6; k++) {
      for (const dir of [-1, 1]) {
        const dx = dir * k * ((L * 0.24) / 6.2);
        for (const z of [-0.28, 0.28]) {
          g.add(rod(new THREE.Vector3(px, topY - 0.15 - k * 0.12, z * 0.4), new THREE.Vector3(px + dx, deckY + 0.02, z), 0.012, cable));
        }
      }
    }
  }
  for (let i = -5; i <= 5; i++) {
    g.add(box(0.05, 0.08, 0.05, lamp, (i * L) / 11.5, deckY, 0.32), box(0.05, 0.08, 0.05, lamp, (i * L) / 11.5, deckY, -0.32));
  }
  return g;
};
export default build;
