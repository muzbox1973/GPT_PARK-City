// 블록 스프링 흔들림 + 모든 재질에 주입되는 젤리 정점 변형
import * as THREE from 'three';

/** 감쇠 스프링 1축. a = -k·x - c·v */
export class JellySpring {
  x = 0;
  v = 0;
  constructor(public k = 70, public c = 3) {}
  step(dt: number): void {
    // 반암시적 오일러, 큰 dt 는 쪼갠다
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * this.x - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
  }
  impulse(dv: number): void { this.v += dv; }
  energy(): number { return Math.abs(this.x) + Math.abs(this.v) / Math.sqrt(this.k); }
  reset(): void { this.x = 0; this.v = 0; }
}

/** 탱탱함 0~100 → 감쇠 계수 6.0~1.2 (선형) */
export function bounceToDamping(bounce: number): number {
  const b = Math.max(0, Math.min(100, bounce)) / 100;
  return 6.0 + (1.2 - 6.0) * b;
}

/** 모든 재질이 공유하는 유니폼 */
export const jellyUniforms = {
  uShear: { value: new THREE.Vector2() },
  uSquash: { value: 0 },
  uJellyBase: { value: -3 },
  uJellyH: { value: 4 },
  uTime: { value: 0 },
  uWaterLevel: { value: 0 },
  uCausticColor: { value: new THREE.Color('#ffffff') },
  uCaustic: { value: 1 },
};

export class Jelly {
  shearX = new JellySpring(70, 3);
  shearZ = new JellySpring(70, 3);
  squash = new JellySpring(110, 3);
  setBounce(bounce: number): void {
    const c = bounceToDamping(bounce);
    this.shearX.c = c; this.shearZ.c = c; this.squash.c = c * 1.1;
  }
  /** 수평 방향 충격 (월드 단위 속도) */
  poke(dx: number, dz: number, down = 0): void {
    this.shearX.impulse(dx);
    this.shearZ.impulse(dz);
    this.squash.impulse(down);
  }
  update(dt: number): void {
    this.shearX.step(dt); this.shearZ.step(dt); this.squash.step(dt);
    const lim = 1.2;
    this.shearX.x = THREE.MathUtils.clamp(this.shearX.x, -lim, lim);
    this.shearZ.x = THREE.MathUtils.clamp(this.shearZ.x, -lim, lim);
    this.squash.x = THREE.MathUtils.clamp(this.squash.x, -0.25, 0.25);
    jellyUniforms.uShear.value.set(this.shearX.x, this.shearZ.x);
    jellyUniforms.uSquash.value = this.squash.x;
  }
  moving(): boolean { return this.shearX.energy() + this.shearZ.energy() + this.squash.energy() > 1e-3; }
  reset(): void { this.shearX.reset(); this.shearZ.reset(); this.squash.reset(); }

  /** CSS2D 이름표 등 JS 쪽 위치에 같은 변형 적용 */
  static deform(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const base = jellyUniforms.uJellyBase.value;
    const hy = THREE.MathUtils.clamp((p.y - base) / jellyUniforms.uJellyH.value, 0, 2.5);
    const sq = jellyUniforms.uSquash.value;
    out.set(
      p.x * (1 + sq * 0.5 * hy) + jellyUniforms.uShear.value.x * hy,
      base + (p.y - base) * (1 - sq),
      p.z * (1 + sq * 0.5 * hy) + jellyUniforms.uShear.value.y * hy,
    );
    return out;
  }
}

export const CAUSTIC_GLSL = /* glsl */ `
float jCaustic(vec2 uv, float t) {
  // 타일 공간에서 삼각함수 반복으로 얽힌 빛 그물
  vec2 p = mod(uv * 6.2831853 * 0.16, 6.2831853) - 250.0;
  vec2 q = p;
  float acc = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    q = p + vec2(cos(tt - q.x) + sin(tt + q.y), sin(tt - q.y) + cos(tt + q.x));
    acc += 1.0 / length(vec2(p.x / (sin(q.x + tt) / 0.005), p.y / (cos(q.y + tt) / 0.005)));
  }
  acc /= 4.0;
  acc = 1.17 - pow(acc, 1.4);
  return clamp(pow(abs(acc), 8.0), 0.0, 1.0);
}
`;

const VERT_HEAD = /* glsl */ `
uniform vec2 uShear;
uniform float uSquash;
uniform float uJellyBase;
uniform float uJellyH;
varying vec3 vJWorld;
`;

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 jwp = modelMatrix * mvPosition;
vJWorld = jwp.xyz;
float jhy = clamp((jwp.y - uJellyBase) / uJellyH, 0.0, 2.5);
jwp.xz = jwp.xz * (1.0 + uSquash * 0.5 * jhy) + uShear * jhy;
jwp.y = uJellyBase + (jwp.y - uJellyBase) * (1.0 - uSquash);
mvPosition = viewMatrix * jwp;
gl_Position = projectionMatrix * mvPosition;
`;

export interface PatchOptions {
  /** 물 아래 지형에 빛 그물 무늬 */
  underwaterCaustics?: boolean;
  /** 수면 자체의 빛 그물 무늬 */
  surfaceCaustics?: boolean;
}

/** 재질에 젤리 정점 변형(+선택적 caustics)을 주입한다. */
export function patchMaterial<T extends THREE.Material>(mat: T, opts: PatchOptions = {}): T {
  const key = `jelly${opts.underwaterCaustics ? 'U' : ''}${opts.surfaceCaustics ? 'S' : ''}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, jellyUniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', PROJECT);
    let fragHead = 'varying vec3 vJWorld;\nuniform float uTime;\nuniform float uWaterLevel;\nuniform vec3 uCausticColor;\nuniform float uCaustic;\n';
    if (opts.underwaterCaustics || opts.surfaceCaustics) fragHead += CAUSTIC_GLSL;
    let frag = fragHead + shader.fragmentShader;
    if (opts.underwaterCaustics) {
      frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float jDepth = uWaterLevel - vJWorld.y;
        if (jDepth > 0.0) {
          float jc = jCaustic(vJWorld.xz * 1.4, uTime * 0.9);
          float fade = clamp(jDepth * 3.0, 0.0, 1.0) * clamp(1.6 - jDepth * 0.6, 0.2, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.78, 0.92), clamp(jDepth * 0.9, 0.0, 0.75));
          totalEmissiveRadiance += uCausticColor * jc * fade * 0.55 * uCaustic;
        }`);
    }
    if (opts.surfaceCaustics) {
      frag = frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float js = jCaustic(vJWorld.xz * 0.9 + vec2(3.0), uTime * 0.6);
        totalEmissiveRadiance += uCausticColor * js * 0.22 * uCaustic;`);
    }
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
