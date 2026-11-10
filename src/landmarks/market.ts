// 시장 천막 줄 (rows)
import * as THREE from 'three';
import { box, glow, group, mat, num } from './kit';
import type { KitBuilder } from './types';

const COLORS = ['#f26b5b', '#ffd166', '#5ec2b7', '#f7f3ea', '#8ab6f9', '#f497c4'];

const build: KitBuilder = (p) => {
  const rows = Math.max(1, Math.min(4, Math.round(num(p.rows, 2))));
  const g = group(1.15);
  const wood = mat('#a3784f');
  const bulb = glow('#ffd98a', 0.1, 2.2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 5; c++) {
      const x = -1.0 + c * 0.5, z = -((rows - 1) * 0.55) / 2 + r * 0.55;
      g.add(box(0.38, 0.16, 0.3, wood, x, 0, z));
      const tent = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.24, 4), mat(COLORS[(r * 5 + c) % COLORS.length], { rough: 0.8 }));
      tent.rotation.y = Math.PI / 4;
      tent.position.set(x, 0.38, z);
      tent.castShadow = true;
      g.add(tent);
      for (const sx of [-0.17, 0.17]) g.add(box(0.025, 0.28, 0.025, wood, x + sx, 0, z + 0.13));
      g.add(box(0.05, 0.05, 0.05, bulb, x, 0.24, z + 0.17));
    }
  }
  return g;
};
export default build;
