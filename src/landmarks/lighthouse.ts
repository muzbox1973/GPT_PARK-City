// 등대 (color: red / white) + 회전 불빛
import * as THREE from 'three';
import { animators, cyl, glow, group, mat, str } from './kit';
import type { KitBuilder } from './types';
import { patchMaterial } from '../jelly';

const build: KitBuilder = (p) => {
  const stripe = str(p.color, 'red') === 'white' ? mat('#e8edf2') : mat('#d9463b');
  const white = mat('#f6f6f2');
  const g = group(2.6);
  for (let i = 0; i < 5; i++) {
    const r0 = 0.32 - i * 0.035, r1 = 0.32 - (i + 1) * 0.035;
    g.add(cyl(r1, r0, 0.36, i % 2 ? white : stripe, 0, i * 0.36));
  }
  g.add(cyl(0.3, 0.3, 0.05, mat('#333a44'), 0, 1.8));
  g.add(cyl(0.12, 0.12, 0.2, glow('#fff1b8', 1.0, 2.6), 0, 1.85));
  g.add(cyl(0.02, 0.16, 0.18, mat('#333a44'), 0, 2.05));
  const beamMat = patchMaterial(new THREE.MeshBasicMaterial({ color: '#fff4c2', transparent: true, opacity: 0, depthWrite: false }));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3, 12, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(1.5, 1.95, 0);
  const pivot = new THREE.Group();
  pivot.add(beam);
  g.add(pivot);
  animators.push((e) => { pivot.rotation.y += e.dt * 1.2; beamMat.opacity = 0.04 + e.night * 0.3; });
  return g;
};
export default build;
