// 포인터 · 더블클릭 · 휠 · 터치. 물 / 땅 / 빈 곳을 구분한다.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Jelly } from './jelly';
import type { Sound } from './audio';
import type { Water } from './water';

export interface InputCtx {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  water: Water;
  jelly: Jelly;
  sound: Sound;
  size: number;
  landTargets: () => THREE.Object3D[];
  onDouble: (x: number, z: number) => void;
  onInteract: () => void;
}

type Mode = 'none' | 'water' | 'jelly' | 'pinch' | 'orbit';

export class Input {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private mode: Mode = 'none';
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private last = new THREE.Vector3();
  private downAt = { x: 0, y: 0, t: 0 };
  private lastTap = { x: 0, y: 0, t: 0 };
  private pinchDist = 0;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private c: InputCtx) {
    const host = c.canvas.parentElement ?? c.canvas;
    host.addEventListener('pointerdown', this.down, { capture: true });
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    c.canvas.addEventListener('dblclick', this.dbl);
    c.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setRay(x: number, y: number): void {
    const r = this.c.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.c.camera);
  }

  /** 수면과 땅 중 더 가까운 쪽 */
  pick(x: number, y: number): { kind: 'water' | 'land' | 'none'; point: THREE.Vector3 } {
    this.setRay(x, y);
    const half = this.c.size / 2;
    this.plane.constant = -this.c.water.level;
    const wp = new THREE.Vector3();
    let wDist = Infinity;
    if (this.ray.ray.intersectPlane(this.plane, wp) && Math.abs(wp.x) < half && Math.abs(wp.z) < half && this.c.water.isWater(wp.x, wp.z)) {
      wDist = wp.distanceTo(this.ray.ray.origin);
    }
    const hits = this.ray.intersectObjects(this.c.landTargets(), true);
    const land = hits.find((h) => h.object.visible);
    if (land && land.distance < wDist) return { kind: 'land', point: land.point };
    if (wDist < Infinity) return { kind: 'water', point: wp };
    return { kind: 'none', point: wp };
  }

  private waterPoint(x: number, y: number): THREE.Vector3 | null {
    this.setRay(x, y);
    this.plane.constant = -this.c.water.level;
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return this.c.water.isWater(p.x, p.z) ? p : null;
  }

  private down = (e: PointerEvent): void => {
    if (!(e.target instanceof HTMLCanvasElement) && !(e.target as HTMLElement).classList?.contains('label') && !(e.target as HTMLElement).closest?.('.label')) return;
    this.c.onInteract();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (this.pointers.size >= 2) {
      if (this.mode === 'water' || this.mode === 'jelly') {
        // 직접 조작 중 두 번째 손가락 → 핀치 확대로 전환
        this.mode = 'pinch';
        this.pinchDist = this.spread();
        e.stopPropagation();
      }
      return;
    }
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.button === 2 || e.button === 1) { this.mode = 'orbit'; return; }
    const hit = this.pick(e.clientX, e.clientY);
    if (hit.kind === 'water') {
      this.mode = 'water';
      this.c.controls.enabled = false;
      this.last.copy(hit.point);
      this.c.water.sim.disturb(hit.point.x, hit.point.z, 0.4, 0.09);
    } else if (hit.kind === 'land' && e.pointerType === 'mouse') {
      this.mode = 'jelly';
      this.c.controls.enabled = false;
      this.c.jelly.poke(0, 0, 0.6);
    } else {
      this.mode = 'orbit';
    }
  };

  private spread(): number {
    const p = [...this.pointers.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  private move = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (this.mode === 'pinch') {
      const d = this.spread();
      if (this.pinchDist > 0 && d > 0) {
        const cam = this.c.camera, t = this.c.controls.target;
        const off = cam.position.clone().sub(t).multiplyScalar(this.pinchDist / d);
        const len = THREE.MathUtils.clamp(off.length(), this.c.controls.minDistance, this.c.controls.maxDistance);
        cam.position.copy(t).add(off.setLength(len));
      }
      this.pinchDist = d;
      return;
    }
    if (this.mode === 'water') {
      const p = this.waterPoint(e.clientX, e.clientY);
      if (!p) return;
      const seg = p.distanceTo(this.last);
      const steps = Math.min(12, Math.ceil(seg / 0.15));
      const strength = THREE.MathUtils.clamp(0.025 + seg * 0.05, 0.025, 0.08);
      for (let i = 1; i <= steps; i++) {
        const q = this.last.clone().lerp(p, i / steps);
        this.c.water.sim.disturb(q.x, q.z, 0.32, strength);
      }
      if (seg > 0.6) this.c.sound.whoosh();
      this.last.copy(p);
    } else if (this.mode === 'jelly') {
      // 화면 드래그 방향을 카메라 기준 수평 방향으로
      const cam = this.c.camera;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).setY(0).normalize().negate();
      const k = 0.03;
      this.c.jelly.poke((right.x * dx - fwd.x * dy) * k, (right.z * dx - fwd.z * dy) * k, 0);
    }
  };

  private up = (e: PointerEvent): void => {
    const had = this.pointers.delete(e.pointerId);
    if (!had) return;
    const now = performance.now();
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    const quick = now - this.downAt.t < 260 && moved < 8;
    if (this.mode === 'jelly') this.c.sound.wobble();
    // 터치: 땅을 짧게 탭하면 출렁, 물을 두 번 탭하면 풍덩
    if (e.pointerType !== 'mouse' && quick && this.pointers.size === 0) {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit.kind === 'land') { this.c.jelly.poke((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.5); this.c.sound.wobble(); }
      if (now - this.lastTap.t < 330 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 30 && hit.kind === 'water') {
        this.c.onDouble(hit.point.x, hit.point.z);
        this.lastTap.t = 0;
      } else this.lastTap = { x: e.clientX, y: e.clientY, t: now };
    }
    if (this.pointers.size === 0) {
      this.mode = 'none';
      this.c.controls.enabled = true;
    }
  };

  private dbl = (e: MouseEvent): void => {
    const hit = this.pick(e.clientX, e.clientY);
    if (hit.kind === 'water') this.c.onDouble(hit.point.x, hit.point.z);
  };
}
