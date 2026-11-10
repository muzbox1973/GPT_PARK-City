import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeHeightFn } from '../../src/terrain';
import { validateConfig, type TerrainDef } from '../../src/config';

const base = (type: TerrainDef['type'], shapes: TerrainDef['shapes'] = []): TerrainDef => ({
  type, size: 20, seaLevel: 0, shapes, noise: { scale: 0.35, amp: 0.25, seed: 7 },
});
const corners: [number, number][] = [[-9.8, -9.8], [9.8, -9.8], [9.8, 9.8], [-9.8, 9.8]];

describe('terrain', () => {
  it('도형 중심 높이는 해수면보다 높다', () => {
    const h = makeHeightFn(base('island', [{ op: 'add', shape: 'circle', x: 2, z: -1, r: 3, h: 1.2 }]));
    expect(h(2, -1)).toBeGreaterThan(0);
  });

  it('island: 블록 모서리 바다 칸은 해수면보다 낮다', () => {
    const h = makeHeightFn(base('island'));
    for (const [x, z] of corners) expect(h(x, z)).toBeLessThan(0);
    expect(h(0, 0)).toBeGreaterThan(0);
  });

  it('coast: 남쪽 모서리 바다 칸은 해수면보다 낮고 북쪽은 땅이다', () => {
    const h = makeHeightFn(base('coast'));
    expect(h(-9.8, 9.8)).toBeLessThan(0);
    expect(h(9.8, 9.8)).toBeLessThan(0);
    expect(h(0, -8)).toBeGreaterThan(0);
  });

  it('GPT_PARK 시티: 호수 가운데는 물, 랜드마크 자리는 땅', () => {
    const { config } = validateConfig(JSON.parse(readFileSync(new URL('../../public/town.config.json', import.meta.url), 'utf-8')));
    const h = makeHeightFn(config!.terrain);
    expect(h(0, 0.5)).toBeLessThan(-0.5);
    for (const l of config!.landmarks.filter((l) => l.zone !== 'water')) expect(h(l.x, l.z)).toBeGreaterThan(0.2);
  });
});
