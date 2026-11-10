// 패널 · 카운터 · 슬라이더 · 토스트 · 제목 젤리 글자 · 이름표
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { FlavorDef, LandmarkDef, TownConfig } from './config';

export type SliderName = 'bounce' | 'calm' | 'tide' | 'wind';
export const VIEWS = ['기본', '위에서', '옆에서'] as const;
export type ViewName = (typeof VIEWS)[number];

export interface UIHandlers {
  onAction: (i: number) => void;
  onFlavor: (i: number) => void;
  onSlider: (name: SliderName, v: number) => void;
  onReset: () => void;
  onPause: () => void;
  onSound: () => void;
  onView: () => void;
  onLabels: () => void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

const SLIDERS: { name: SliderName; label: string; lo: string; hi: string }[] = [
  { name: 'bounce', label: '탱탱함', lo: '말랑', hi: '탱글' },
  { name: 'calm', label: '파도 잔잔함', lo: '출렁', hi: '잔잔' },
  { name: 'tide', label: '물때', lo: '썰물', hi: '밀물' },
  { name: 'wind', label: '바람', lo: '고요', hi: '강풍' },
];

export class UI {
  root: HTMLElement;
  panel: HTMLElement;
  private counters: HTMLElement[] = [];
  private actionBtns: HTMLButtonElement[] = [];
  private flavorBtns: HTMLButtonElement[] = [];
  private sliders = new Map<SliderName, { input: HTMLInputElement; out: HTMLElement }>();
  private btn: Record<'reset' | 'pause' | 'sound' | 'view' | 'labels', HTMLButtonElement>;
  private toastBox: HTMLElement;

  constructor(cfg: TownConfig, hd: UIHandlers, opts: { reducedMotion: boolean; record: boolean }) {
    this.root = document.getElementById('ui')!;
    const { meta } = cfg;

    // 상단 왼쪽: 연구소 표기 + 제목 + 소개
    const head = h('header', 'head');
    const lab = h('div', 'lab');
    lab.innerHTML = `<span class="dot"></span>젤리 지도 연구 <b></b>`;
    lab.querySelector('b')!.textContent = meta.seriesNo;
    const title = h('h1', 'title');
    title.setAttribute('aria-label', meta.nameEn);
    for (const ch of meta.nameEn) {
      const s = h('span', ch === ' ' ? 'sp' : 'ch', ch === ' ' ? ' ' : ch);
      s.setAttribute('aria-hidden', 'true');
      if (!opts.reducedMotion) s.addEventListener('pointerenter', () => { s.classList.remove('boing'); void s.offsetWidth; s.classList.add('boing'); });
      s.addEventListener('animationend', () => s.classList.remove('boing'));
      title.append(s);
    }
    const tag = h('p', 'tagline', meta.tagline);
    head.append(lab, title, tag);

    const badge = h('div', 'badge');
    badge.innerHTML = '<span class="dot live"></span>WebGL · 실시간';

    // 패널
    this.panel = h('aside', 'panel');
    this.panel.setAttribute('aria-label', '조작 패널');
    const ph = h('div', 'p-head');
    const pname = h('div', 'p-name', meta.nameKo);
    const collapse = h('button', 'p-collapse');
    collapse.setAttribute('aria-label', '패널 접기');
    collapse.innerHTML = '<span></span>';
    collapse.addEventListener('click', () => this.panel.classList.toggle('collapsed'));
    ph.append(pname, collapse);
    ph.addEventListener('click', (e) => { if (e.target === ph || e.target === pname) { if (window.innerWidth < 900) this.panel.classList.toggle('collapsed'); } });
    const body = h('div', 'p-body');

    const acts = h('div', 'acts');
    cfg.actions.forEach((a, i) => {
      const b = h('button', 'act', a.label);
      b.dataset.effect = a.effect;
      b.addEventListener('click', () => { hd.onAction(i); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); });
      this.actionBtns.push(b);
      acts.append(b);
    });
    const counts = h('div', 'counts');
    cfg.actions.forEach((a) => {
      const c = h('div', 'count');
      const n = h('b', 'n', '0');
      c.append(n, h('span', '', a.counterLabel));
      this.counters.push(n);
      counts.append(c);
    });

    const flv = h('div', 'flavors');
    flv.append(h('div', 'sec', '젤리 맛'));
    const row = h('div', 'f-row');
    cfg.flavors.forEach((f, i) => {
      const b = h('button', 'flavor');
      b.style.setProperty('--fw', f.water); b.style.setProperty('--fj', f.jelly);
      b.innerHTML = '<i></i><span></span>';
      b.querySelector('span')!.textContent = f.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => hd.onFlavor(i));
      this.flavorBtns.push(b);
      row.append(b);
    });
    flv.append(row);

    const sl = h('div', 'sliders');
    for (const s of SLIDERS) {
      const wrap = h('label', 'slider');
      const top = h('div', 's-top');
      const out = h('output', '', String(cfg.defaults[s.name]));
      top.append(h('span', '', s.label), out);
      const input = h('input');
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
      input.value = String(cfg.defaults[s.name]);
      input.dataset.name = s.name;
      input.addEventListener('input', () => { out.textContent = input.value; hd.onSlider(s.name, Number(input.value)); this.fill(input); });
      const ends = h('div', 's-ends');
      ends.append(h('span', '', s.lo), h('span', '', s.hi));
      wrap.append(top, input, ends);
      this.sliders.set(s.name, { input, out });
      this.fill(input);
      sl.append(wrap);
    }

    const bottom = h('div', 'p-bottom');
    const mk = (key: keyof UI['btn'], label: string, fn: () => void) => { const b = h('button', `pb pb-${key}`, label); b.addEventListener('click', fn); bottom.append(b); return b; };
    this.btn = {
      reset: mk('reset', '초기화', hd.onReset),
      pause: mk('pause', '멈춤', hd.onPause),
      sound: mk('sound', '소리 켜기', hd.onSound),
      view: mk('view', '시점: 기본', hd.onView),
      labels: mk('labels', '이름표 끄기', hd.onLabels),
    };
    body.append(acts, counts, flv, sl, bottom);
    this.panel.append(ph, body);
    if (window.innerWidth < 900) this.panel.classList.add('collapsed');

    // 하단
    const how = h('div', 'how');
    how.innerHTML = '<b>HOW TO PLAY</b><span class="how-d">물 드래그 → 물결 · 땅 드래그 → 젤리 출렁 · 물 더블클릭 → 풍덩 · 빈 곳/오른쪽 드래그 → 회전 · 휠 → 확대</span><span class="how-m">물 드래그 → 물결 · 땅 탭 → 출렁 · 한 손가락 → 회전 · 두 손가락 → 확대</span>';
    const foot = h('div', 'foot');
    const short = meta.tagline.split(',')[0];
    foot.append(h('div', 'f-tag', short), h('div', 'f-coord', meta.coord));

    this.toastBox = h('div', 'toasts');
    this.toastBox.setAttribute('role', 'status');
    this.root.append(head, badge, how, foot, this.panel, this.toastBox);
    if (opts.record) document.body.classList.add('record');
  }

  private fill(input: HTMLInputElement): void { input.style.setProperty('--v', `${input.value}%`); }

  setCounter(i: number, n: number): void { if (this.counters[i]) this.counters[i].textContent = String(n); }
  setFlavor(i: number, f: FlavorDef): void {
    this.flavorBtns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', String(k === i)); });
    const r = document.documentElement.style;
    r.setProperty('--accent', f.accent); r.setProperty('--label', f.water); r.setProperty('--jelly', f.jelly);
  }
  setSlider(name: SliderName, v: number): void {
    const s = this.sliders.get(name); if (!s) return;
    s.input.value = String(v); s.out.textContent = String(v); this.fill(s.input);
  }
  setPaused(p: boolean): void { this.btn.pause.textContent = p ? '재생' : '멈춤'; this.btn.pause.classList.toggle('on', p); }
  setSound(on: boolean): void { this.btn.sound.textContent = on ? '소리 끄기' : '소리 켜기'; this.btn.sound.classList.toggle('on', on); }
  setView(v: ViewName): void { this.btn.view.textContent = `시점: ${v}`; }
  setLabels(on: boolean): void { this.btn.labels.textContent = on ? '이름표 끄기' : '이름표 켜기'; this.btn.labels.classList.toggle('on', !on); }
  setActionBusy(i: number, busy: boolean): void { this.actionBtns[i]?.classList.toggle('busy', busy); }

  toast(msg: string, kind: 'info' | 'error' = 'info', ms = 4200): void {
    const t = h('div', `toast ${kind}`, msg);
    this.toastBox.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, ms);
  }
}

/** WebGL 미지원 안내 카드 */
export function showNoWebGL(cfg: TownConfig | null): void {
  const card = h('div', 'nowebgl');
  card.innerHTML = '<h2>이 브라우저에서는 3D를 볼 수 없어요</h2><p class="t"></p><p class="d"></p><p class="s">최신 크롬·사파리·엣지에서 다시 열어 주세요.</p>';
  card.querySelector('.t')!.textContent = cfg ? `${cfg.meta.nameEn} · ${cfg.meta.nameKo}` : '우리 동네 젤리 지도';
  card.querySelector('.d')!.textContent = cfg?.meta.tagline ?? '';
  document.body.append(card);
}

// ───────── 이름표 ─────────
export interface Label { obj: CSS2DObject; el: HTMLElement; anchor: THREE.Vector3; def: LandmarkDef }

export function makeLabel(def: LandmarkDef, anchor: THREE.Vector3): Label {
  const el = h('div', 'label');
  const name = [...def.name];
  const shortName = name.length > 12 ? `${name.slice(0, 11).join('')}…` : def.name;
  const n = h('span', 'l-name', shortName);
  el.dataset.full = def.name;
  el.dataset.short = shortName;
  el.title = def.name;
  el.dataset.id = def.id;
  el.append(n);
  if (def.sub) el.append(h('span', 'l-sub', def.sub));
  el.addEventListener('pointerenter', () => { n.textContent = def.name; el.classList.add('hover'); });
  el.addEventListener('pointerleave', () => { n.textContent = shortName; el.classList.remove('hover'); });
  const obj = new CSS2DObject(el);
  obj.position.copy(anchor);
  obj.center.set(0.5, 1);
  return { obj, el, anchor: anchor.clone(), def };
}

/** 화면에서 겹치는 이름표 중 카메라에서 먼 쪽을 투명도 0.25 로 */
export function resolveOverlaps(labels: Label[], camera: THREE.Camera): void {
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const items = labels
    .filter((l) => l.obj.visible && l.el.style.display !== 'none')
    .map((l) => ({ l, d: l.obj.getWorldPosition(new THREE.Vector3()).distanceTo(camPos), r: l.el.getBoundingClientRect() }))
    .sort((a, b) => a.d - b.d);
  const kept: DOMRect[] = [];
  for (const it of items) {
    const r = it.r;
    const hit = kept.some((k) => r.left < k.right - 2 && r.right > k.left + 2 && r.top < k.bottom - 2 && r.bottom > k.top + 2);
    it.l.el.classList.toggle('dim', hit);
    it.l.el.style.zIndex = String(1000 - Math.round(it.d * 10));
    if (!hit) kept.push(r);
  }
}
