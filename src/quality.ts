// 프레임 측정 + 자동 품질 단계 (최근 2초 평균 FPS < 40 → 한 단계 낮춤)
export interface Tier { name: '높음' | '중간' | '낮음'; pixelRatio: number; grid: number; shadows: boolean }

export const TIERS: Tier[] = [
  { name: '높음', pixelRatio: 2, grid: 128, shadows: true },
  { name: '중간', pixelRatio: 1.5, grid: 96, shadows: true },
  { name: '낮음', pixelRatio: 1, grid: 64, shadows: false },
];

export class Quality {
  tier = 0;
  private frames: number[] = [];
  private cooldown = 3; // 시작 직후·단계 변경 직후 3초는 측정 안 함
  constructor(private onChange: (t: Tier) => void, start = 0) { this.tier = start; }
  get current(): Tier { return TIERS[this.tier]; }
  /** realDt: 실제 경과 시간(초) */
  sample(realDt: number): void {
    if (this.cooldown > 0) { this.cooldown -= realDt; return; }
    this.frames.push(realDt);
    let sum = 0;
    for (const f of this.frames) sum += f;
    while (sum > 2 && this.frames.length > 1) sum -= this.frames.shift()!;
    if (sum >= 1.9) {
      const fps = this.frames.length / sum;
      if (fps < 40 && this.tier < TIERS.length - 1) {
        this.tier++;
        this.frames = [];
        this.cooldown = 3;
        this.onChange(this.current);
      }
    }
  }
  reset(): void { this.frames = []; this.cooldown = 2; }
}
