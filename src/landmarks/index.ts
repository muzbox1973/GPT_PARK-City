// kind → 생성 함수
import * as THREE from 'three';
import type { Kind, LandmarkDef } from '../config';
import type { HeightFn } from '../terrain';
import type { KitBuilder } from './types';
import tower from './tower';
import bridgeCable from './bridge-cable';
import bridgeArch from './bridge-arch';
import hanok from './hanok';
import lighthouse from './lighthouse';
import windmill from './windmill';
import mountainRock from './mountain-rock';
import highrise from './highrise';
import market from './market';
import station from './station';
import stadium from './stadium';
import park from './park';
import crane from './crane';
import school from './school';

export const KITS: Record<Kind, KitBuilder> = {
  tower, 'bridge-cable': bridgeCable, 'bridge-arch': bridgeArch, hanok, lighthouse, windmill,
  'mountain-rock': mountainRock, highrise, market, station, stadium, park, crane, school,
};

export interface PlacedLandmark { def: LandmarkDef; object: THREE.Group; labelY: number }

/**
 * 랜드마크 배치. 엣지 케이스:
 *  - 물 위인데 zone 이 물이 아닌 경우 → 가장 가까운 땅 칸으로 이동 (콘솔 경고 1회)
 *  - 서로 반경 1.0 안에 겹치면 → 뒤에 나온 항목을 바깥쪽으로 1.2 밀어냄
 */
export function placeLandmarks(defs: LandmarkDef[], height: HeightFn, sea: number, size: number): PlacedLandmark[] {
  const out: PlacedLandmark[] = [];
  const half = size / 2 - 0.6;
  let warned = false;
  const placed: { x: number; z: number }[] = [];
  for (const [idx, src] of defs.entries()) {
    const d = { ...src };
    const onWaterKit = d.kind === 'bridge-cable' || d.kind === 'bridge-arch';
    if (!onWaterKit && d.zone !== 'water' && height(d.x, d.z) < sea + 0.05) {
      const best = nearestLand(height, sea, d.x, d.z, half);
      if (!warned) { console.warn(`[town] '${d.name}' 좌표가 물 위라서 가장 가까운 땅 (${best[0].toFixed(1)}, ${best[1].toFixed(1)}) 으로 옮겼습니다.`); warned = true; }
      d.x = best[0]; d.z = best[1];
    }
    for (const q of placed) {
      const dist = Math.hypot(d.x - q.x, d.z - q.z);
      if (dist < 1.0) {
        const ang = dist > 1e-3 ? Math.atan2(d.z - q.z, d.x - q.x) : Math.atan2(d.z, d.x) || 0;
        d.x = THREE.MathUtils.clamp(d.x + Math.cos(ang) * 1.2, -half, half);
        d.z = THREE.MathUtils.clamp(d.z + Math.sin(ang) * 1.2, -half, half);
      }
    }
    placed.push({ x: d.x, z: d.z });
    const baseY = onWaterKit ? sea : height(d.x, d.z);
    const cos = Math.cos(d.rotY), sin = Math.sin(d.rotY);
    const obj = KITS[d.kind](d.params, {
      seed: 1000 + idx * 17,
      ground: (lx, lz) => {
        const wx = d.x + (lx * cos + lz * sin) * d.scale;
        const wz = d.z + (-lx * sin + lz * cos) * d.scale;
        return (height(wx, wz) - baseY) / d.scale;
      },
    });
    obj.position.set(d.x, baseY, d.z);
    obj.rotation.y = d.rotY;
    obj.scale.setScalar(d.scale);
    obj.name = d.id;
    obj.userData.landmark = d.id;
    obj.traverse((o) => { o.userData.landmark = d.id; });
    out.push({ def: d, object: obj, labelY: (obj.userData.labelY as number) * d.scale });
  }
  return out;
}

function nearestLand(height: HeightFn, sea: number, x: number, z: number, half: number): [number, number] {
  for (let r = 0.25; r < 20; r += 0.25) {
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Math.abs(px) > half || Math.abs(pz) > half) continue;
      if (height(px, pz) > sea + 0.2) return [px, pz];
    }
  }
  return [x, z];
}
