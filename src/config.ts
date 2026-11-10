// town.config.json 로드 · 검증 · 타입
export const KINDS = [
  'tower', 'bridge-cable', 'bridge-arch', 'hanok', 'lighthouse', 'windmill', 'mountain-rock',
  'highrise', 'market', 'station', 'stadium', 'park', 'crane', 'school',
] as const;
export type Kind = (typeof KINDS)[number];

export const MOVER_TYPES = ['boat', 'car', 'train', 'bike', 'bird', 'fish'] as const;
export type MoverType = (typeof MOVER_TYPES)[number];

export const EFFECTS = ['launch', 'horn', 'feed', 'drop', 'fireworks', 'rain', 'lights'] as const;
export type Effect = (typeof EFFECTS)[number];

export const TERRAIN_TYPES = ['coast', 'river', 'basin', 'island'] as const;
export type TerrainType = (typeof TERRAIN_TYPES)[number];

export const ZONES = ['water', 'shore', 'inland', 'mountain'] as const;
export type Zone = (typeof ZONES)[number];

export interface ShapeDef {
  op: 'add' | 'sub';
  shape: 'circle' | 'capsule' | 'box';
  x: number; z: number;
  r?: number; x2?: number; z2?: number; w?: number; d?: number; h?: number;
}

export interface TerrainDef {
  type: TerrainType;
  size: number;
  seaLevel: number;
  shapes: ShapeDef[];
  noise: { scale: number; amp: number; seed: number };
}

export interface LandmarkDef {
  id: string; name: string; sub: string; kind: Kind; zone?: Zone;
  x: number; z: number; rotY: number; scale: number;
  params: Record<string, unknown>;
}

export interface MoverDef {
  type: MoverType; variant?: string; count: number;
  path: [number, number][]; speed: number; loop: boolean;
  altitude?: number; depth?: number;
}

export interface ActionDef { label: string; effect: Effect; counterLabel: string; target?: string }
export interface FlavorDef { name: string; water: string; jelly: string; accent: string }

export interface TownConfig {
  meta: { nameKo: string; nameEn: string; coord: string; tagline: string; seriesNo: string };
  terrain: TerrainDef;
  landmarks: LandmarkDef[];
  fillers: { houses: number; trees: number; people: number; humanoids: number; seed: number };
  movers: MoverDef[];
  actions: ActionDef[];
  flavors: FlavorDef[];
  defaults: { bounce: number; calm: number; tide: number; wind: number; flavor: number };
}

export interface ValidationResult { config: TownConfig | null; errors: string[] }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** 스키마 검사. 치명적이지 않은 오류는 해당 항목만 버리거나 기본값으로 채우고 errors 에 남긴다. */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  if (!isObj(raw)) return { config: null, errors: ['(root): 객체가 아닙니다'] };

  // meta
  const metaRaw = raw.meta;
  let fatal = false;
  const meta = { nameKo: '', nameEn: '', coord: '', tagline: '', seriesNo: '' };
  if (!isObj(metaRaw)) { err('meta', '필수 항목이 없습니다'); fatal = true; }
  else {
    for (const k of Object.keys(meta) as (keyof typeof meta)[]) {
      const v = metaRaw[k];
      if (!isStr(v) || v.length === 0) { err(`meta.${k}`, '문자열이 필요합니다'); if (k === 'nameKo' || k === 'nameEn') fatal = true; }
      else meta[k] = v;
    }
  }

  // terrain
  const tRaw = raw.terrain;
  let terrain: TerrainDef | null = null;
  if (!isObj(tRaw)) { err('terrain', '필수 항목이 없습니다'); fatal = true; }
  else {
    const type = TERRAIN_TYPES.includes(tRaw.type as TerrainType) ? (tRaw.type as TerrainType) : null;
    if (!type) { err('terrain.type', `coast/river/basin/island 중 하나여야 합니다 (받은 값: ${String(tRaw.type)})`); }
    const size = isNum(tRaw.size) && tRaw.size > 4 ? tRaw.size : 20;
    if (!isNum(tRaw.size)) err('terrain.size', '숫자가 필요합니다 (기본값 20 사용)');
    const seaLevel = isNum(tRaw.seaLevel) ? tRaw.seaLevel : 0;
    const shapes: ShapeDef[] = [];
    if (!Array.isArray(tRaw.shapes)) err('terrain.shapes', '배열이 필요합니다');
    else tRaw.shapes.forEach((s, i) => {
      const p = `terrain.shapes[${i}]`;
      if (!isObj(s)) return err(p, '객체가 아닙니다');
      if (s.op !== 'add' && s.op !== 'sub') return err(`${p}.op`, 'add 또는 sub 이어야 합니다');
      if (s.shape !== 'circle' && s.shape !== 'capsule' && s.shape !== 'box') return err(`${p}.shape`, 'circle/capsule/box 중 하나여야 합니다');
      if (!isNum(s.x) || !isNum(s.z)) return err(`${p}.x/z`, '숫자가 필요합니다');
      if ((s.shape === 'circle' || s.shape === 'capsule') && !isNum(s.r)) return err(`${p}.r`, '반지름이 필요합니다');
      if (s.shape === 'capsule' && (!isNum(s.x2) || !isNum(s.z2))) return err(`${p}.x2/z2`, '끝점이 필요합니다');
      if (s.shape === 'box' && (!isNum(s.w) || !isNum(s.d))) return err(`${p}.w/d`, '폭과 깊이가 필요합니다');
      shapes.push({
        op: s.op, shape: s.shape, x: s.x, z: s.z,
        r: isNum(s.r) ? s.r : undefined, x2: isNum(s.x2) ? s.x2 : undefined, z2: isNum(s.z2) ? s.z2 : undefined,
        w: isNum(s.w) ? s.w : undefined, d: isNum(s.d) ? s.d : undefined, h: isNum(s.h) ? s.h : 1.2,
      });
    });
    const n = isObj(tRaw.noise) ? tRaw.noise : {};
    terrain = {
      type: type ?? 'coast', size, seaLevel, shapes,
      noise: { scale: isNum(n.scale) ? n.scale : 0.35, amp: isNum(n.amp) ? n.amp : 0.25, seed: isNum(n.seed) ? n.seed : 7 },
    };
    if (!type) fatal = true;
  }

  // landmarks
  const landmarks: LandmarkDef[] = [];
  if (!Array.isArray(raw.landmarks)) err('landmarks', '배열이 필요합니다');
  else raw.landmarks.forEach((l, i) => {
    const p = `landmarks[${i}]`;
    if (!isObj(l)) return err(p, '객체가 아닙니다');
    if (!isStr(l.name) || !l.name) return err(`${p}.name`, '이름이 필요합니다');
    if (!KINDS.includes(l.kind as Kind)) return err(`${p}.kind`, `알 수 없는 키트 '${String(l.kind)}'`);
    if (!isNum(l.x) || !isNum(l.z)) return err(`${p}.x/z`, '좌표가 필요합니다');
    const zone = ZONES.includes(l.zone as Zone) ? (l.zone as Zone) : undefined;
    if (l.zone !== undefined && !zone) err(`${p}.zone`, `water/shore/inland/mountain 중 하나여야 합니다`);
    landmarks.push({
      id: isStr(l.id) ? l.id : `lm${i + 1}`, name: l.name, sub: isStr(l.sub) ? l.sub : '', kind: l.kind as Kind, zone,
      x: l.x, z: l.z, rotY: isNum(l.rotY) ? l.rotY : 0, scale: isNum(l.scale) ? l.scale : 1,
      params: isObj(l.params) ? l.params : {},
    });
  });

  // fillers
  const f = isObj(raw.fillers) ? raw.fillers : {};
  const fillers = {
    houses: isNum(f.houses) ? f.houses : 120, trees: isNum(f.trees) ? f.trees : 200,
    people: isNum(f.people) ? f.people : 0, humanoids: isNum(f.humanoids) ? f.humanoids : 0,
    seed: isNum(f.seed) ? f.seed : 11,
  };

  // movers
  const movers: MoverDef[] = [];
  if (raw.movers !== undefined && !Array.isArray(raw.movers)) err('movers', '배열이 필요합니다');
  else if (Array.isArray(raw.movers)) raw.movers.forEach((m, i) => {
    const p = `movers[${i}]`;
    if (!isObj(m)) return err(p, '객체가 아닙니다');
    if (!MOVER_TYPES.includes(m.type as MoverType)) return err(`${p}.type`, `알 수 없는 탈것 '${String(m.type)}'`);
    if (!Array.isArray(m.path) || m.path.length < 2 || !m.path.every((q) => Array.isArray(q) && q.length === 2 && isNum(q[0]) && isNum(q[1])))
      return err(`${p}.path`, '[[x,z], ...] 좌표 2개 이상이 필요합니다');
    movers.push({
      type: m.type as MoverType, variant: isStr(m.variant) ? m.variant : undefined,
      count: isNum(m.count) ? Math.max(0, Math.min(20, Math.round(m.count))) : 1,
      path: m.path as [number, number][], speed: isNum(m.speed) ? m.speed : 1, loop: m.loop !== false,
      altitude: isNum(m.altitude) ? m.altitude : undefined, depth: isNum(m.depth) ? m.depth : undefined,
    });
  });

  // actions
  const actions: ActionDef[] = [];
  if (!Array.isArray(raw.actions)) err('actions', '배열이 필요합니다');
  else raw.actions.forEach((a, i) => {
    const p = `actions[${i}]`;
    if (!isObj(a)) return err(p, '객체가 아닙니다');
    if (!EFFECTS.includes(a.effect as Effect)) return err(`${p}.effect`, `알 수 없는 효과 '${String(a.effect)}'`);
    if (!isStr(a.label) || !a.label) return err(`${p}.label`, '버튼 이름이 필요합니다');
    actions.push({ label: a.label, effect: a.effect as Effect, counterLabel: isStr(a.counterLabel) ? a.counterLabel : a.label, target: isStr(a.target) ? a.target : undefined });
  });
  if (actions.length > 3) { err('actions', '3개까지만 사용합니다'); actions.length = 3; }

  // flavors
  const flavors: FlavorDef[] = [];
  if (!Array.isArray(raw.flavors)) err('flavors', '배열이 필요합니다');
  else raw.flavors.forEach((fl, i) => {
    const p = `flavors[${i}]`;
    if (!isObj(fl)) return err(p, '객체가 아닙니다');
    for (const k of ['water', 'jelly', 'accent'] as const) if (!isStr(fl[k]) || !HEX.test(fl[k] as string)) return err(`${p}.${k}`, '#rrggbb 색이 필요합니다');
    flavors.push({ name: isStr(fl.name) ? fl.name : `맛 ${i + 1}`, water: fl.water as string, jelly: fl.jelly as string, accent: fl.accent as string });
  });
  if (flavors.length === 0) flavors.push({ name: '기본', water: '#1e6fd9', jelly: '#3fa9f5', accent: '#14a9ae' });

  const d = isObj(raw.defaults) ? raw.defaults : {};
  const pct = (v: unknown, def: number) => (isNum(v) ? Math.max(0, Math.min(100, v)) : def);
  const defaults = {
    bounce: pct(d.bounce, 50), calm: pct(d.calm, 30), tide: pct(d.tide, 50), wind: pct(d.wind, 40),
    flavor: isNum(d.flavor) ? Math.max(0, Math.min(flavors.length - 1, Math.round(d.flavor))) : 0,
  };

  if (fatal || !terrain) return { config: null, errors };
  return { config: { meta, terrain, landmarks, fillers, movers, actions, flavors, defaults }, errors };
}

export async function loadConfig(url = './town.config.json'): Promise<ValidationResult> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return { config: null, errors: [`town.config.json: 불러오기 실패 (${res.status})`] };
    const json = (await res.json()) as unknown;
    return validateConfig(json);
  } catch (e) {
    return { config: null, errors: [`town.config.json: JSON 형식 오류 — ${(e as Error).message}`] };
  }
}
