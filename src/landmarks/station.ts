// 기차역 + 승강장 (+ 지하철 입구)
import * as THREE from 'three';
import { accent, box, glow, group, mat } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = () => {
  const g = group(1.5);
  const white = mat('#eef1f4', { rough: 0.5 });
  const grey = mat('#8d949e');
  const glass = glow('#bfe9ff', 0.15, 1.6, { base: '#7fa8c9' });
  const neon = accent(0.6, 2.0);
  g.add(box(2.4, 0.1, 1.3, grey));
  g.add(box(1.4, 0.5, 0.55, white, 0, 0.1, -0.3));
  g.add(box(1.3, 0.3, 0.02, glass, 0, 0.18, -0.02));
  // 곡면 지붕
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 16, 1, true, -Math.PI / 2, Math.PI), white);
  canopy.rotation.z = Math.PI / 2;
  canopy.scale.set(1, 1, 0.45);
  canopy.position.set(0, 0.62, 0.3);
  canopy.castShadow = true;
  (canopy.material as THREE.Material).side = THREE.DoubleSide;
  g.add(canopy);
  for (const x of [-1, -0.33, 0.33, 1]) g.add(box(0.04, 0.6, 0.04, grey, x, 0.1, 0.5));
  g.add(box(2.2, 0.03, 0.3, grey, 0, 0.1, 0.35));
  // 지하철 입구
  g.add(box(0.35, 0.22, 0.3, mat('#2b2f38'), 0.95, 0.1, -0.35));
  g.add(box(0.36, 0.04, 0.31, neon, 0.95, 0.32, -0.35));
  g.add(box(0.05, 0.4, 0.05, grey, -1.0, 0.1, -0.55), box(0.16, 0.16, 0.03, neon, -1.0, 0.5, -0.55));
  return g;
};
export default build;
