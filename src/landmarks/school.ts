// 학교 건물 + 운동장 (+ 바람에 나부끼는 깃발)
import * as THREE from 'three';
import { animators, box, cyl, group, mat, windowMaterial } from './kit';
import type { KitBuilder } from './types';

const build: KitBuilder = (_p, ctx) => {
  const g = group(1.7);
  const facade = windowMaterial(5, 2, '#fff3e3');
  const roof = mat('#d26a4c');
  const y0 = Math.min(0, ctx.ground(0, -0.4)) - 0.05;
  g.add(box(1.9, 0.62, 0.5, facade, 0, y0, -0.45));
  g.add(box(1.96, 0.06, 0.56, roof, 0, y0 + 0.62, -0.45));
  g.add(box(0.5, 0.62, 0.9, facade, -0.95, y0, -0.05), box(0.56, 0.06, 0.96, roof, -0.95, y0 + 0.62, -0.05));
  // 시계탑
  g.add(box(0.28, 0.95, 0.28, mat('#fff6ea'), 0, y0, -0.45), box(0.32, 0.06, 0.32, roof, 0, y0 + 0.95, -0.45));
  // 운동장 트랙
  const track = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 4, 30), mat('#c46b4b'));
  track.rotation.x = Math.PI / 2; track.scale.set(1.5, 1, 1); track.position.set(0.35, 0.03, 0.55);
  const lawn = cyl(0.42, 0.42, 0.03, mat('#6fb35a'), 0.35, 0.0, 0.55, 24);
  lawn.scale.x = 1.55;
  g.add(track, lawn);
  // 깃발
  g.add(cyl(0.012, 0.012, 0.8, mat('#cfd3d8'), 1.15, 0, -0.05, 5));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.15, 6, 1), mat('#14a9ae'));
  (flag.material as THREE.Material).side = THREE.DoubleSide;
  flag.geometry.translate(0.12, 0, 0);
  flag.position.set(1.15, 0.72, -0.05);
  g.add(flag);
  const base = (flag.geometry.attributes.position.array as Float32Array).slice();
  animators.push((e) => {
    const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
    const w = e.wind / 100;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(e.time * (2 + w * 8) + x * 25) * x * 0.35 * (0.15 + w));
    }
    pos.needsUpdate = true;
    flag.rotation.y = -0.4 + Math.sin(e.time * 0.3) * 0.2 * w;
  });
  return g;
};
export default build;
