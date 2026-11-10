// 풍차 — 능선 위 풍력 발전기 3기. 바람 0 이면 멈추고 100 이면 빠르게 돈다.
import * as THREE from 'three';
import { animators, box, cyl, glow, group, mat, sph } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (_p, ctx) => {
  const white = mat('#f4f6f8', { rough: 0.4 });
  const blink = glow('#ff5b5b', 0.4, 2.2);
  const g = group(3.2);
  const rotors: THREE.Group[] = [];
  const spots: [number, number, number][] = [[-1.2, 0.5, 1.6], [0, -0.2, 1.9], [1.25, 0.35, 1.7]];
  for (const [x, z, h] of spots) {
    const t = new THREE.Group();
    t.position.set(x, ctx.ground(x, z) - 0.04, z);
    t.add(cyl(0.035, 0.07, h, white));
    t.add(box(0.12, 0.1, 0.26, white, 0, h - 0.02, 0.02));
    const rotor = new THREE.Group();
    rotor.position.set(0, h + 0.03, 0.17);
    rotor.add(sph(0.05, white, 0, 0, 0, 8));
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.015), white);
      blade.geometry.translate(0, 0.39, 0);
      blade.rotation.z = (b * Math.PI * 2) / 3;
      blade.castShadow = true;
      rotor.add(blade);
    }
    t.add(rotor);
    t.add(sph(0.025, blink, 0, h + 0.06, -0.05, 6));
    rotors.push(rotor);
    g.add(t);
  }
  g.userData.rotors = rotors;
  animators.push((e) => {
    const speed = (e.wind / 100) * 7; // rad/s, 바람 0 → 정지
    rotors.forEach((r, i) => { r.rotation.z -= speed * e.dt * (1 + i * 0.07); });
  });
  return g;
};
export default build;
