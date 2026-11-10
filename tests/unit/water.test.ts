import { describe, expect, it } from 'vitest';
import { WaterSim, calmToDamping } from '../../src/water';

describe('water', () => {
  it('물결을 1번 일으키고 감쇠 최대값으로 600스텝 진행하면 최대 진폭이 0.01 미만', () => {
    const sim = new WaterSim(128, 20);
    sim.fillAll();
    sim.damping = calmToDamping(100);
    sim.disturb(0, 0, 1, 0.5);
    expect(sim.maxAbs()).toBeGreaterThan(0.3);
    for (let i = 0; i < 600; i++) sim.step();
    expect(sim.maxAbs()).toBeLessThan(0.01);
  });

  it('물결이 퍼진다 (중심에서 떨어진 칸도 움직인다)', () => {
    const sim = new WaterSim(64, 20);
    sim.fillAll();
    sim.damping = calmToDamping(0);
    sim.disturb(0, 0, 0.6, 0.5);
    for (let i = 0; i < 20; i++) sim.step();
    expect(Math.abs(sim.sample(3, 0))).toBeGreaterThan(1e-4);
  });

  it('땅 칸은 벽이라 값이 0 으로 유지된다', () => {
    const sim = new WaterSim(64, 20);
    sim.setMask((x) => (x > 2 ? 1 : -1), 0);
    sim.disturb(1.5, 0, 1.5, 0.5);
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.sample(6, 0)).toBe(0);
  });
});
