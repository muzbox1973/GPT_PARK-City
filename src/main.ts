// 장면 조립 · 렌더 루프 · 리사이즈
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { loadConfig, type TownConfig, type Kind } from './config';
import { buildTerrain, BLOCK_BOTTOM } from './terrain';
import { Water, calmToDamping } from './water';
import { Jelly, jellyUniforms, patchMaterial } from './jelly';
import { placeLandmarks } from './landmarks';
import { animators, accentMats, nightables, type Env } from './landmarks/kit';
import { Fillers } from './fillers';
import { Movers } from './movers';
import { makeCurve, makeDistanceFn } from './paths';
import { Actions } from './actions';
import { Input } from './input';
import { UI, VIEWS, makeLabel, resolveOverlaps, showNoWebGL, type Label, type SliderName, type ViewName } from './ui';
import { Sound } from './audio';
import { Quality, TIERS } from './quality';

const FILL_RADIUS: Partial<Record<Kind, number>> = { highrise: 1.9, windmill: 1.9, park: 1.5, market: 1.6, school: 1.6, station: 1.5, stadium: 1.6, crane: 1.7 };

function webglOK(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const record = params.get('record') === '1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { config, errors } = await loadConfig();
  if (!config) {
    showNoWebGL(null);
    const box = document.querySelector('.nowebgl h2');
    if (box) box.textContent = 'town.config.json 을 읽을 수 없어요';
    const d = document.querySelector('.nowebgl .d');
    if (d) d.textContent = errors.join(' / ');
    return;
  }
  if (!webglOK()) { showNoWebGL(config); return; }
  start(config, errors, { record, reduced });
}

function start(cfg: TownConfig, errors: string[], opt: { record: boolean; reduced: boolean }): void {
  const size = cfg.terrain.size;
  const sea = cfg.terrain.seaLevel;
  const stage = document.getElementById('stage')!;

  // ── 렌더러 · 장면 ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: opt.record });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  stage.append(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  stage.append(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const hemi = new THREE.HemisphereLight('#fdfbf5', '#b5a68a', 1.15);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.5);
  sun.position.set(9, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = 110;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.target.set(0, -0.6, 0);
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // ── 월드 ──
  const world = new THREE.Group();
  scene.add(world);
  const terrain = buildTerrain(cfg.terrain);
  world.add(terrain.group);
  const height = terrain.height;

  const startTier = 0;
  const water = new Water(size, height, TIERS[startTier].grid);
  const tideLevel = (t: number) => sea + ((t - 50) / 50) * 0.4;
  water.setLevel(tideLevel(cfg.defaults.tide));
  water.sim.damping = calmToDamping(cfg.defaults.calm);
  world.add(water.group);

  // 젤리 틀: 옆면 4장 + 윗테두리
  const shellTop = 0.98;
  const shellMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#3fa9f5', transparent: true, opacity: 0.16, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  const shell = new THREE.Group();
  const sh = shellTop - (BLOCK_BOTTOM - 0.12);
  for (let k = 0; k < 4; k++) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(size + 0.24, sh), shellMat);
    const ang = (k * Math.PI) / 2;
    pl.position.set(Math.sin(ang) * (size / 2 + 0.12), (shellTop + BLOCK_BOTTOM - 0.12) / 2, Math.cos(ang) * (size / 2 + 0.12));
    pl.rotation.y = ang;
    pl.renderOrder = 5;
    shell.add(pl);
  }
  const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size + 0.24, sh, size + 0.24));
  const rimMat = patchMaterial(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
  const rim = new THREE.LineSegments(rimGeo, rimMat);
  rim.position.y = (shellTop + BLOCK_BOTTOM - 0.12) / 2;
  shell.add(rim);
  world.add(shell);

  // ── 랜드마크 ──
  const placed = placeLandmarks(cfg.landmarks, height, sea, size);
  for (const p of placed) world.add(p.object);
  world.updateMatrixWorld(true);
  const towerLm = placed.find((p) => p.object.userData.pad);
  const pad = towerLm ? towerLm.object.localToWorld((towerLm.object.userData.pad as THREE.Vector3).clone()) : undefined;

  // ── 탈것 (도로 먼저: 채움이 도로를 피해야 함) ──
  const actionsWithLaunch = cfg.actions.find((a) => a.effect === 'launch');
  const sound = new Sound();
  const ui = { ref: null as UI | null };
  const movers = new Movers(cfg.movers, {
    height, water, sea, pad,
    onArrive: () => { sound.chime(); ui.ref?.toast('운항을 마치고 돌아왔어요 ✓'); const i = cfg.actions.findIndex((a) => a.effect === 'launch'); if (i >= 0) ui.ref?.setActionBusy(i, false); },
  }, actionsWithLaunch?.target ?? cfg.movers[0]?.variant ?? cfg.movers[0]?.type);
  world.add(movers.group);
  const roadCurves = cfg.movers.filter((m) => m.type === 'car' || m.type === 'bike').map((m) => makeCurve(m.path, m.loop));
  const roadDist = roadCurves.length ? makeDistanceFn(roadCurves) : () => Infinity;

  // ── 채움 ──
  const lmZones: { x: number; z: number; r: number }[] = [];
  for (const p of placed) {
    if (p.object.userData.onWater) {
      const L = Number(p.def.params.length ?? 8) * p.def.scale;
      for (let s = -L / 2; s <= L / 2; s += 0.8) lmZones.push({ x: p.def.x + Math.cos(p.def.rotY) * s, z: p.def.z - Math.sin(p.def.rotY) * s, r: 0.5 });
    } else lmZones.push({ x: p.def.x, z: p.def.z, r: (FILL_RADIUS[p.def.kind] ?? 1.5) * p.def.scale });
  }
  const anchors = placed.filter((p) => ['park', 'market', 'school', 'station', 'tower'].includes(p.def.kind)).map((p) => ({ x: p.def.x, z: p.def.z, r: p.def.kind === 'park' ? 1.25 : 1.45 }));
  const fillers = new Fillers(cfg, { height, sea, size, landmarks: lmZones, roadDist, anchors });
  world.add(fillers.group);

  // ── 이름표 ──
  const labels: Label[] = placed.map((p) => {
    const anchor = new THREE.Vector3(p.def.x, p.object.position.y + p.labelY, p.def.z);
    const l = makeLabel(p.def, anchor);
    scene.add(l.obj);
    return l;
  });

  // ── 상태 ──
  const jelly = new Jelly();
  jelly.setBounce(cfg.defaults.bounce);
  const state = {
    paused: false, labels: true, view: 0, flavor: cfg.defaults.flavor, wind: cfg.defaults.wind,
    tide: cfg.defaults.tide, night: false, nightT: 0, counts: cfg.actions.map(() => 0),
  };
  let flavorFrom = cfg.flavors[state.flavor], flavorTo = flavorFrom, flavorK = 1;

  const actions = new Actions({
    world, water, movers, jelly, sound, size,
    setNight: (on) => { state.night = on; document.body.classList.toggle('night', on); },
    isNight: () => state.night,
    palette: () => [cfg.flavors[state.flavor].water, cfg.flavors[state.flavor].jelly, cfg.flavors[state.flavor].accent],
  });

  // ── 카메라 시점 ──
  const VIEW_SPH: Record<ViewName, { polar: number; az: number }> = {
    기본: { polar: 55, az: -35 }, 위에서: { polar: 4, az: -35 }, 옆에서: { polar: 83, az: -35 },
  };
  const layout = { vw: 1, vh: 1, aw: 1, ah: 1, offX: 0, offY: 0 };
  const corners: THREE.Vector3[] = [];
  for (const x of [-size / 2, size / 2]) for (const y of [BLOCK_BOTTOM, 1.0]) for (const z of [-size / 2, size / 2]) corners.push(new THREE.Vector3(x, y, z));
  const tmpCam = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const sphToPos = (d: number, polarDeg: number, azDeg: number, out: THREE.Vector3) => {
    const s = new THREE.Spherical(d, THREE.MathUtils.degToRad(Math.max(0.5, polarDeg)), THREE.MathUtils.degToRad(azDeg));
    return out.setFromSpherical(s).add(controls.target);
  };
  /** 블록이 사용 가능 영역 높이의 70% 를 차지하는 거리 */
  const fitDistance = (polar: number, az: number): number => {
    tmpCam.aspect = layout.vw / layout.vh;
    tmpCam.updateProjectionMatrix();
    let lo = 4, hi = 200;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2;
      sphToPos(d, polar, az, tmpCam.position);
      tmpCam.lookAt(controls.target);
      tmpCam.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, behind = false;
      for (const c of corners) {
        const p = c.clone().project(tmpCam);
        if (p.z > 1) behind = true;
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const pxW = ((maxX - minX) / 2) * layout.vw, pxH = ((maxY - minY) / 2) * layout.vh;
      const fits = !behind && pxH <= layout.ah * 0.7 && pxW <= layout.aw * 0.92;
      if (fits) hi = d; else lo = d;
    }
    return hi;
  };
  let camAnim: { from: THREE.Spherical; to: THREE.Spherical; t: number } | null = null;
  const goView = (i: number, instant = false) => {
    state.view = i;
    const v = VIEW_SPH[VIEWS[i]];
    const d = fitDistance(v.polar, v.az);
    const to = new THREE.Spherical(d, THREE.MathUtils.degToRad(Math.max(0.5, v.polar)), THREE.MathUtils.degToRad(v.az));
    if (instant) { camera.position.setFromSpherical(to).add(controls.target); camera.lookAt(controls.target); camAnim = null; }
    else camAnim = { from: new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)), to, t: 0 };
    ui.ref?.setView(VIEWS[i]);
  };

  const resize = () => {
    const W = window.innerWidth, H = window.innerHeight;
    const mobile = W < 900;
    // 사용 가능 영역: 오른쪽 패널 · 위쪽 제목 · 아래쪽 안내/시트를 뺀 사각형. 그 중심에 블록을 둔다.
    const record = document.body.classList.contains('record');
    const panelW = mobile || record ? 0 : 240 + 24;
    const topPad = mobile ? 118 : Math.min(170, H * 0.2);
    const botPad = mobile ? 64 + 46 : 48;
    const aw = W - panelW, ah = H - topPad - botPad;
    const cx = aw / 2, cy = topPad + ah / 2;
    const vw = W + 2 * Math.abs(W / 2 - cx), vh = H + 2 * Math.abs(H / 2 - cy);
    const ox = cx < W / 2 ? vw - W : 0, oy = cy < H / 2 ? vh - H : 0;
    renderer.setSize(W, H);
    labelRenderer.setSize(W, H);
    layout.vw = vw; layout.vh = vh; layout.aw = aw; layout.ah = ah;
    camera.aspect = vw / vh;
    camera.setViewOffset(vw, vh, ox, oy, W, H);
    camera.updateProjectionMatrix();
    controls.minDistance = fitDistance(55, -35) * 0.35;
    controls.maxDistance = fitDistance(55, -35) * 2.4;
  };
  window.addEventListener('resize', () => { resize(); goView(state.view, true); });
  resize();
  goView(0, true);

  // ── 품질 ──
  const quality = new Quality((t) => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, t.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    water.setResolution(t.grid);
    sun.castShadow = t.shadows;
    ui.ref?.toast(`프레임이 떨어져 품질을 '${t.name}'(으)로 낮췄어요`);
  }, startTier);

  // ── UI ──
  const applyFlavor = (i: number) => {
    flavorFrom = currentFlavor();
    flavorTo = cfg.flavors[i];
    flavorK = 0;
    state.flavor = i;
    ui.ref?.setFlavor(i, cfg.flavors[i]);
  };
  const cur = { water: new THREE.Color(), jelly: new THREE.Color(), accent: new THREE.Color() };
  const currentFlavor = () => ({ name: '', water: `#${cur.water.getHexString()}`, jelly: `#${cur.jelly.getHexString()}`, accent: `#${cur.accent.getHexString()}` });
  const paintFlavor = () => {
    const k = flavorK * flavorK * (3 - 2 * flavorK);
    cur.water.set(flavorFrom.water).lerp(new THREE.Color(flavorTo.water), k);
    cur.jelly.set(flavorFrom.jelly).lerp(new THREE.Color(flavorTo.jelly), k);
    cur.accent.set(flavorFrom.accent).lerp(new THREE.Color(flavorTo.accent), k);
    water.setColors(`#${cur.water.getHexString()}`, `#${cur.jelly.getHexString()}`);
    shellMat.color.copy(cur.jelly);
    jellyUniforms.uCausticColor.value.copy(cur.jelly).lerp(new THREE.Color('#ffffff'), 0.55);
    for (const m of accentMats) { m.color.copy(cur.accent); m.emissive.copy(cur.accent); }
  };
  cur.water.set(flavorTo.water); cur.jelly.set(flavorTo.jelly); cur.accent.set(flavorTo.accent);

  const sliderSet = (name: SliderName, v: number) => {
    if (name === 'bounce') jelly.setBounce(v);
    if (name === 'calm') water.sim.damping = calmToDamping(v);
    if (name === 'tide') { state.tide = v; water.setLevel(tideLevel(v)); }
    if (name === 'wind') state.wind = v;
  };

  const doAction = (i: number) => {
    const a = cfg.actions[i];
    if (!a) return;
    const ok = actions.run(a.effect);
    if (ok) {
      state.counts[i]++;
      ui.ref?.setCounter(i, state.counts[i]);
      if (a.effect === 'launch') { ui.ref?.setActionBusy(i, true); ui.ref?.toast(`${a.label}! 한 바퀴 돌고 올게요`); }
    } else if (a.effect === 'launch' && movers.launching) ui.ref?.toast('지금 운항 중이에요');
  };

  const resetAll = () => {
    for (const k of ['bounce', 'calm', 'tide', 'wind'] as SliderName[]) { ui.ref?.setSlider(k, cfg.defaults[k]); sliderSet(k, cfg.defaults[k]); }
    applyFlavor(cfg.defaults.flavor);
    water.sim.clear();
    actions.clear();
    movers.reset();
    jelly.reset();
    state.night = false; document.body.classList.remove('night');
    state.counts = state.counts.map(() => 0);
    state.counts.forEach((_, i) => { ui.ref?.setCounter(i, 0); ui.ref?.setActionBusy(i, false); });
    state.paused = false; ui.ref?.setPaused(false);
    state.labels = true; labels.forEach((l) => (l.obj.visible = true)); ui.ref?.setLabels(true);
    goView(0);
  };

  ui.ref = new UI(cfg, {
    onAction: doAction,
    onFlavor: applyFlavor,
    onSlider: sliderSet,
    onReset: resetAll,
    onPause: () => { state.paused = !state.paused; ui.ref?.setPaused(state.paused); },
    onSound: async () => {
      if (sound.enabled) { sound.disable(); ui.ref?.setSound(false); return; }
      const ok = await sound.enable();
      ui.ref?.setSound(ok);
      if (!ok) ui.ref?.toast('브라우저가 소리를 막았어요. 한 번 더 눌러 주세요');
    },
    onView: () => goView((state.view + 1) % VIEWS.length),
    onLabels: () => { state.labels = !state.labels; labels.forEach((l) => (l.obj.visible = state.labels)); ui.ref?.setLabels(state.labels); },
  }, { reducedMotion: opt.reduced, record: opt.record });
  ui.ref.setFlavor(state.flavor, cfg.flavors[state.flavor]);
  errors.forEach((e, i) => setTimeout(() => ui.ref?.toast(`설정 오류 · ${e}`, 'error', 7000), 300 + i * 250));

  // ── 입력 ──
  new Input({
    canvas: renderer.domElement, camera, controls, water, jelly, sound, size,
    landTargets: () => [terrain.mesh, terrain.walls, fillers.group, ...placed.map((p) => p.object), ...movers.roads],
    onDouble: (x, z) => actions.dropAt(x, z, 'drop'),
    onInteract: () => { camAnim = null; },
  });

  // ── 루프 ──
  const env: Env = { time: 0, dt: 0, wind: state.wind, night: 0 };
  const tmpV = new THREE.Vector3();
  let last = performance.now();
  let acc = 0;
  let overlapT = 0;
  let ambientT = 0;
  let running = true;
  const STEP = 1 / 60;

  const frame = (now: number) => {
    if (!running) return;
    const real = Math.min(0.25, (now - last) / 1000);
    last = now;
    const dt = opt.record ? STEP : Math.min(real, 1 / 30);
    if (!opt.record) quality.sample(real);

    if (!state.paused) {
      env.time += dt;
      env.dt = dt;
      jellyUniforms.uTime.value = env.time;
      // 물: 60Hz 고정 스텝
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 2) { water.sim.step(); acc -= STEP; steps++; }
      if (steps === 2) acc = 0;
      // 잔잔한 자동 물결 (동작 줄이기 설정이면 끔)
      if (!opt.reduced) {
        ambientT -= dt;
        if (ambientT <= 0) {
          ambientT = 0.5 / (0.6 + state.wind * 0.05);
          const p = actions.randomWater();
          if (p) water.sim.disturb(p.x, p.z, 0.25 + Math.random() * 0.2, 0.006 + state.wind * 0.00028);
        }
      }
      water.update(dt, false);
      jelly.update(dt);
      movers.update(dt, env.time, state.wind);
      fillers.updateWalkers(dt, env.time);
      actions.update(dt);
      env.wind = state.wind;
      for (const a of animators) a(env);
    } else {
      env.dt = 0;
    }
    jellyUniforms.uWaterLevel.value = water.level;

    // 밤 · 맛 전환
    const nt = state.night ? 1 : 0;
    state.nightT += Math.sign(nt - state.nightT) * Math.min(Math.abs(nt - state.nightT), real * 1.4);
    const n = state.nightT;
    env.night = n;
    hemi.intensity = THREE.MathUtils.lerp(1.15, 0.16, n);
    sun.intensity = THREE.MathUtils.lerp(2.5, 0.22, n);
    sun.color.set('#fff1dc').lerp(new THREE.Color('#9db4ff'), n);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.1, n);
    for (const nm of nightables) nm.mat.emissiveIntensity = THREE.MathUtils.lerp(nm.day, nm.night, n);
    if (flavorK < 1) { flavorK = Math.min(1, flavorK + real / 0.6); paintFlavor(); }

    // 카메라
    if (camAnim) {
      camAnim.t = Math.min(1, camAnim.t + real / 0.9);
      const k = 1 - Math.pow(1 - camAnim.t, 3);
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(camAnim.from.radius, camAnim.to.radius, k),
        THREE.MathUtils.lerp(camAnim.from.phi, camAnim.to.phi, k),
        camAnim.from.theta + (((camAnim.to.theta - camAnim.from.theta + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k,
      );
      camera.position.setFromSpherical(s).add(controls.target);
      if (camAnim.t >= 1) camAnim = null;
    }
    controls.update();

    // 이름표: 젤리 변형을 따라 이동 + 겹침 처리
    for (const l of labels) l.obj.position.copy(Jelly.deform(l.anchor, tmpV));
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    overlapT -= real;
    if (overlapT <= 0 && state.labels) { overlapT = 0.15; resolveOverlaps(labels, camera); }
    requestAnimationFrame(frame);
  };
  paintFlavor();
  requestAnimationFrame(frame);

  // 탭이 숨겨지면 루프 정지, 돌아오면 시간 누적 없이 이어서
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); quality.reset(); requestAnimationFrame(frame); }
  });

  (window as unknown as { __town: unknown }).__town = { state, jelly, water, movers, camera, controls, quality, labels, renderer, scene };
  document.body.classList.add('ready');
}

void boot();
