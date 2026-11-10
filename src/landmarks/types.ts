import type * as THREE from 'three';

export interface KitCtx {
  /** 랜드마크 기준점에서 (lx, lz) 만큼 떨어진 곳의 땅 높이 (기준점 높이를 뺀 값) */
  ground: (lx: number, lz: number) => number;
  seed: number;
}
export type KitParams = Record<string, unknown>;
export type KitBuilder = (p: KitParams, ctx: KitCtx) => THREE.Group;
