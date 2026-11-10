// 경기장: 타원 관중석 + 잔디 + 조명탑
import * as THREE from 'three';
import { box, glow, group, mat } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = () => {
  const g = group(1.5);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.05, 0.38, 32, 1, true), mat('#e7e9ee', { rough: 0.6 }));
  (stand.material as THREE.Material).side = THREE.DoubleSide;
  stand.scale.z = 0.72; stand.position.y = 0.19; stand.castShadow = true;
  const field = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.04, 32), mat('#5cae4f'));
  field.scale.z = 0.7; field.position.y = 0.04;
  const roofRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 40), mat('#c94f4f'));
  roofRing.rotation.x = Math.PI / 2; roofRing.scale.y = 0.72; roofRing.position.y = 0.4;
  g.add(stand, field, roofRing);
  const lamp = glow('#fff6d8', 0.1, 2.4);
  for (const [x, z] of [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]]) g.add(box(0.04, 0.9, 0.04, mat('#888'), x, 0, z), box(0.18, 0.08, 0.05, lamp, x, 0.9, z));
  return g;
};
export default build;
