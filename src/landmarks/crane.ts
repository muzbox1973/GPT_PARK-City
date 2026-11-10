// 항만 크레인 (count) — 트롤리가 천천히 오간다
import * as THREE from 'three';
import { animators, box, group, mat, num } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (p) => {
  const count = Math.max(1, Math.min(4, Math.round(num(p.count, 2))));
  const orange = mat('#ef7d32', { rough: 0.5 });
  const dark = mat('#3b3f46');
  const g = group(2.6);
  const trolleys: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const c = new THREE.Group();
    c.position.x = (i - (count - 1) / 2) * 0.9;
    for (const [x, z] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.3], [0.25, 0.3]]) c.add(box(0.06, 1.6, 0.06, orange, x, 0, z));
    c.add(box(0.6, 0.08, 0.7, orange, 0, 0.75), box(0.6, 0.1, 0.7, orange, 0, 1.6));
    c.add(box(0.12, 0.08, 2.4, orange, 0, 1.7, 0.6));
    c.add(box(0.2, 0.18, 0.22, dark, 0, 1.78, -0.2));
    const t = box(0.16, 0.08, 0.16, dark, 0, 1.6, 0.8);
    trolleys.push(t);
    c.add(t);
    g.add(c);
  }
  animators.push((e) => trolleys.forEach((t, i) => { t.position.z = 0.6 + Math.sin(e.time * 0.4 + i) * 0.9; }));
  return g;
};
export default build;
