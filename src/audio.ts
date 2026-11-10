// Web Audio 합성 효과음 (오디오 파일 0개). 첫 사용자 입력 전에는 AudioContext 를 만들지 않는다.
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private last = new Map<string, number>();
  enabled = false;

  /** 소리 켜기. 브라우저가 막으면 false */
  async enable(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      if (this.ctx.state !== 'running') return false;
      this.enabled = true;
      this.startWaves();
      return true;
    } catch {
      return false;
    }
  }

  disable(): void {
    this.enabled = false;
    if (this.waves) { try { this.waves.src.stop(); } catch { /* 이미 멈춤 */ } this.waves = null; }
    void this.ctx?.suspend();
  }

  private ok(name: string, gap = 0.05): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master) return null;
    const t = this.ctx.currentTime;
    if (t - (this.last.get(name) ?? -1) < gap) return null;
    this.last.set(name, t);
    return this.ctx;
  }

  private env(g: GainNode, t: number, a: number, peak: number, r: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  }

  /** 배경 파도: 필터 노이즈 + 느린 LFO */
  private startWaves(): void {
    if (!this.ctx || !this.noise || !this.master || this.waves) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const gain = this.ctx.createGain(); gain.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain(); lg.gain.value = 0.035;
    lfo.connect(lg).connect(gain.gain);
    const lf2 = this.ctx.createGain(); lf2.gain.value = 260;
    lfo.connect(lf2).connect(f.frequency);
    src.connect(f).connect(gain).connect(this.master);
    src.start(); lfo.start();
    this.waves = { src, gain };
  }

  /** 경적 · 뱃고동: 저음 사각파 2개 */
  horn(): void {
    const c = this.ok('horn', 0.3); if (!c) return;
    const t = c.currentTime;
    const g = c.createGain(); this.env(g, t, 0.05, 0.16, 1.1);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    for (const hz of [110, 138.6]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + 1.3); }
    f.connect(g).connect(this.master!);
  }

  /** 물 튀김: 짧은 밴드패스 노이즈 */
  splash(power = 1): void {
    const c = this.ok('splash', 0.06); if (!c || !this.noise) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.35); f.Q.value = 0.8;
    const g = c.createGain(); this.env(g, t, 0.01, 0.25 * power, 0.4);
    s.connect(f).connect(g).connect(this.master!); s.start(t, Math.random()); s.stop(t + 0.5);
  }

  /** 퐁 (먹이 · 불꽃) */
  pop(pitch = 1): void {
    const c = this.ok('pop', 0.03); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700 * pitch, t); o.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.12);
    const g = c.createGain(); this.env(g, t, 0.005, 0.22, 0.15);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + 0.2);
  }

  /** 휘익 (드래그) */
  whoosh(): void {
    const c = this.ok('whoosh', 0.35); if (!c || !this.noise) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
    const g = c.createGain(); this.env(g, t, 0.08, 0.08, 0.25);
    s.connect(f).connect(g).connect(this.master!); s.start(t, Math.random()); s.stop(t + 0.4);
  }

  /** 차임 (운항 완료) */
  chime(): void {
    const c = this.ok('chime', 0.3); if (!c) return;
    const t = c.currentTime;
    [784, 988, 1175].forEach((hz, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
      const g = c.createGain(); this.env(g, t + i * 0.12, 0.01, 0.14, 0.9);
      o.connect(g).connect(this.master!); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 1.0);
    });
  }

  /** 젤리 출렁임: 피치가 흔들리는 사인 */
  wobble(): void {
    const c = this.ok('wobble', 0.25); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 180;
    const l = c.createOscillator(); l.frequency.value = 9;
    const lg = c.createGain(); lg.gain.value = 40;
    l.connect(lg).connect(o.frequency);
    const g = c.createGain(); this.env(g, t, 0.02, 0.16, 0.6);
    o.connect(g).connect(this.master!); o.start(t); l.start(t); o.stop(t + 0.7); l.stop(t + 0.7);
  }

  /** 빗소리: 5초 고역 노이즈 */
  rain(seconds = 5): void {
    const c = this.ok('rain', 1); if (!c || !this.noise) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.6);
    g.gain.setValueAtTime(0.09, t + seconds - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    s.connect(f).connect(g).connect(this.master!); s.start(t); s.stop(t + seconds + 0.1);
  }

  /** 펑 (불꽃놀이) */
  boom(): void {
    const c = this.ok('boom', 0.1); if (!c || !this.noise) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.8);
    const g = c.createGain(); this.env(g, t, 0.005, 0.35, 0.9);
    s.connect(f).connect(g).connect(this.master!); s.start(t, Math.random()); s.stop(t + 1);
  }

  /** 밤 모드 전환 */
  switchOn(on: boolean): void {
    const c = this.ok('switch', 0.2); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(on ? 440 : 660, t); o.frequency.exponentialRampToValueAtTime(on ? 880 : 330, t + 0.25);
    const g = c.createGain(); this.env(g, t, 0.01, 0.12, 0.3);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + 0.35);
  }
}
