import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../../src/config';

const raw = () => JSON.parse(readFileSync(new URL('../../public/town.config.json', import.meta.url), 'utf-8'));

describe('config', () => {
  it('정상 config 는 오류 없이 통과한다', () => {
    const { config, errors } = validateConfig(raw());
    expect(errors).toEqual([]);
    expect(config).not.toBeNull();
    expect(config!.landmarks).toHaveLength(8);
    expect(config!.actions).toHaveLength(3);
  });

  it('필수 항목이 빠지면 항목 이름이 담긴 오류를 돌려준다', () => {
    const c = raw();
    delete c.meta.nameKo;
    const { config, errors } = validateConfig(c);
    expect(config).toBeNull();
    expect(errors.some((e) => e.includes('meta.nameKo'))).toBe(true);
  });

  it('잘못된 kind 는 거부하고 그 랜드마크만 뺀다', () => {
    const c = raw();
    c.landmarks[2].kind = 'spaceship';
    const { config, errors } = validateConfig(c);
    expect(errors.some((e) => e.startsWith('landmarks[2].kind'))).toBe(true);
    expect(config!.landmarks).toHaveLength(7);
    expect(config!.landmarks.find((l) => l.kind === ('spaceship' as never))).toBeUndefined();
  });

  it('잘못된 색과 효과 이름도 항목 이름과 함께 알린다', () => {
    const c = raw();
    c.flavors[0].water = 'blue';
    c.actions[1].effect = 'teleport';
    const { errors } = validateConfig(c);
    expect(errors.some((e) => e.startsWith('flavors[0].water'))).toBe(true);
    expect(errors.some((e) => e.startsWith('actions[1].effect'))).toBe(true);
  });
});
