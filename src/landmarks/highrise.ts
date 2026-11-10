// 고층 건물 무리 (count, maxHeight) — 밤에는 창문이 켜진다
import * as THREE from 'three';
import { accent, box, group, mat, num, sph, windowMaterial } from './kit';
import { rng } from '../terrain';
import { patchMaterial } from '../jelly';
import type { KitBuilder } from './types';

const build: KitBuilder = (p, ctx) => {
  const count = Math.max(1, Math.min(9, Math.round(num(p.count, 4))));
  const maxH = num(p.maxHeight, 4);
  const r = rng(ctx.seed);
  const g = group(maxH + 0.5);
  const roof = mat('#d8dde4', { rough: 0.5 });
  const neon = accent(0.5, 2.0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.5;
    const d = i === 0 ? 0 : 0.75 + r() * 0.45;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = i === 0 ? maxH : maxH * (0.4 + r() * 0.5);
    const w = 0.42 + r() * 0.25, dd = 0.42 + r() * 0.25;
    const facade = windowMaterial(Math.max(1, Math.round(w * 3)), Math.max(1, Math.round(h * 1.4)), i % 2 ? '#ffffff' : '#dfeaf5');
    const y0 = ctx.ground(x, z) - 0.05;
    g.add(box(w, h, dd, facade, x, y0, z));
    g.add(box(w + 0.04, 0.05, dd + 0.04, roof, x, y0 + h, z));
    if (i % 2 === 0) g.add(box(0.03, 0.4, 0.03, roof, x, y0 + h + 0.05, z), sph(0.03, neon, x, y0 + h + 0.47, z, 6));
  }
  // 휴머노이드 연구 돔
  const dome = sph(0.45, patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#cfe9ff', roughness: 0.1, transmission: 0.3, transparent: true, opacity: 0.85 })), 0.2, ctx.ground(0.2, 1.25) + 0.05, 1.25, 20);
  dome.scale.y = 0.6;
  g.add(dome, box(1.0, 0.06, 1.0, roof, 0.2, ctx.ground(0.2, 1.25) - 0.02, 1.25));
  return g;
};
export default build;
