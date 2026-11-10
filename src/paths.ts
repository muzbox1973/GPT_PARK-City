// 경로 곡선 공용 도구
import * as THREE from 'three';

export function makeCurve(path: [number, number][], closed: boolean): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal', 0.5);
}

/** 여러 곡선에서 가장 가까운 거리 (도로 피하기용) */
export function makeDistanceFn(curves: THREE.Curve<THREE.Vector3>[], samples = 240): (x: number, z: number) => number {
  const pts: number[] = [];
  for (const c of curves) for (const p of c.getSpacedPoints(samples)) pts.push(p.x, p.z);
  return (x, z) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const d = (pts[i] - x) ** 2 + (pts[i + 1] - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}
