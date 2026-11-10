// 기암 바위산 (peaks 1~5)
import * as THREE from 'three';
import { group, mat, num } from './kit';
import { rng } from '../terrain';
import type { KitBuilder } from './types';

const build: KitBuilder = (p, ctx) => {
  const peaks = Math.max(1, Math.min(5, Math.round(num(p.peaks, 3))));
  const r = rng(ctx.seed);
  const rock = mat('#8f8a82', { rough: 0.95 });
  const g = group(2.8);
  for (let i = 0; i < peaks; i++) {
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const s = 0.8 + r() * 0.4;
      pos.setXYZ(k, pos.getX(k) * s, pos.getY(k) * s, pos.getZ(k) * s);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rock);
    const a = (i / peaks) * Math.PI * 2, d = peaks === 1 ? 0 : 0.55;
    const h = 1.4 + r() * 1.2;
    m.scale.set(0.7, h, 0.7);
    m.position.set(Math.cos(a) * d, h * 0.35, Math.sin(a) * d);
    m.castShadow = true;
    g.add(m);
  }
  return g;
};
export default build;
