import { describe, expect, it } from 'vitest';
import { Jelly, bounceToDamping } from '../../src/jelly';

function simulate(bounce: number, seconds: number): Jelly {
  const j = new Jelly();
  j.setBounce(bounce);
  j.poke(1, 0.5, 0.3);
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) j.update(dt);
  return j;
}

describe('jelly', () => {
  it('탱탱함 0~100 → 감쇠 6.0~1.2 선형', () => {
    expect(bounceToDamping(0)).toBeCloseTo(6.0);
    expect(bounceToDamping(100)).toBeCloseTo(1.2);
    expect(bounceToDamping(50)).toBeCloseTo(3.6);
  });

  it('충격 후 탱탱함 0 에서는 2초 안에 정지한다', () => {
    expect(simulate(0, 2).moving()).toBe(false);
  });

  it('탱탱함 100 에서는 2초 시점에도 움직임이 남는다', () => {
    expect(simulate(100, 2).moving()).toBe(true);
  });
});
