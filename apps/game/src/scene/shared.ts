/** Material PBR, referensi objek bersama, tween, dan kotak tabrakan kamera untuk scene hanggar. */
import * as THREE from "three";

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);

/** Satuan meter. Kamera tidak boleh keluar dari ruangan ini. */
export const ROOM = { minX: -5.2, maxX: 5.6, minZ: -4.2, maxZ: 5.6, height: 7 } as const;
export const ENGINE_POS = V(0, 1.02, 0);
export const PART_TABLE = { x: 0.33, z: 0.88, top: 0.78, w: 0.62, d: 0.34 } as const;
export const LAMP_POS = V(-1.15, 2.25, 1.35);
export const LAMP_AIM = V(0.15, 1.0, -0.15);

/** Close-up torsi hanya merender layer ini: kunci, mur, stud, pad, dan lampu. */
export const CLOSEUP_LAYER = 1;

const std = (color: number, metalness: number, roughness: number) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

/** Material sesuai bahan aslinya (dicat = dielektrik, logam telanjang = metalness tinggi). */
export const M = {
  castAlu: std(0x7d8288, 0.05, 0.5),
  cylinder: std(0x34383d, 0.05, 0.55),
  head: std(0xa8acb1, 0.6, 0.45),
  steel: std(0xc0c4ca, 1.0, 0.26),
  darkSteel: std(0x34383e, 0.9, 0.35),
  exhaust: std(0x6b5a4a, 0.9, 0.55),
  standPaint: std(0xc9a227, 0.25, 0.55),
  plate: std(0x5d636b, 0.6, 0.45),
  rubber: std(0x141414, 0.0, 0.85),
  propBlade: std(0x2c2f33, 0.6, 0.4),
  oil: std(0x120d06, 0.0, 0.04),
  cloth: std(0xd8d0bf, 0.0, 0.95),
} as const;

/** Data interaksi yang dibaca handler klik/hover di akar scene. */
export type Pick =
  | { readonly kind: "decor"; readonly code: string; readonly name: string }
  | { readonly kind: "part"; readonly part: string; readonly code: string; readonly name: string }
  | { readonly kind: "pad"; readonly part: string; readonly code: string; readonly name: string }
  | { readonly kind: "stud"; readonly part: string; readonly index: number; readonly code: string; readonly name: string }
  | { readonly kind: "nut"; readonly part: string; readonly index: number; readonly code: string; readonly name: string }
  | { readonly kind: "tool"; readonly code: string; readonly name: string };

/** Data pick milik objek atau induk terdekatnya. */
export function pickOf(o: THREE.Object3D): Pick | undefined {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n.userData.pick) return n.userData.pick as Pick;
  return undefined;
}

/** Objek yang dipakai lintas komponen (diisi saat mount). */
export const rig = {
  engine: null as THREE.Group | null,
  wrench: null as THREE.Group | null,
  /** Titik tepi skala mikrometer di barrel (lokal kunci), dari metadata alat. */
  wrenchScaleEdge: V(0, -0.18, 0),
  nuts: new Map<string, THREE.Mesh>(),
  studs: new Map<string, THREE.Mesh>(),
  pads: new Map<string, THREE.Mesh>(),
  /** Bayangan pemasangan per part (tampil saat part dipegang). */
  ghosts: new Map<string, THREE.Group>(),
  /** Induk part yang diam di meja; berada di dalam grup interaksi supaya bisa diklik. */
  staging: null as THREE.Group | null,
  /** Raycast ke kunci torsi dari koordinat layar (dipakai overlay close-up untuk menarik gagang). */
  hitWrench: (_x: number, _y: number): boolean => false,
};

/** Elemen overlay close-up yang diperbarui tiap frame tanpa render ulang React. */
export const closeupDom = {
  lead: null as SVGLineElement | null,
  dot: null as SVGCircleElement | null,
  klik: null as HTMLElement | null,
  loupe: null as HTMLElement | null,
};

/** Raycaster three.js tidak melewati objek tersembunyi, jadi cek sendiri (termasuk induknya). */
export function isShown(o: THREE.Object3D) {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
export const nutKey = (part: string, index: number) => `${part}#${index}`;

// ---------- Tween transform lokal ----------
interface TweenStep { readonly p: THREE.Vector3; readonly q: THREE.Quaternion; readonly dur: number }
interface Tween {
  readonly obj: THREE.Object3D;
  steps: TweenStep[];
  t: number;
  from: { p: THREE.Vector3; q: THREE.Quaternion } | null;
  onDone?: () => void;
}
const tweens: Tween[] = [];
const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animasikan transform lokal `obj` melewati pose-pose berurutan (ease-out kubik). */
export function animate(obj: THREE.Object3D, steps: TweenStep[], onDone?: () => void) {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i]!.obj === obj) tweens.splice(i, 1);
  tweens.push({ obj, steps: steps.slice(), t: 0, from: null, onDone });
}
export function runTweens(dt: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]!;
    const step = tw.steps[0]!;
    tw.from ??= { p: tw.obj.position.clone(), q: tw.obj.quaternion.clone() };
    tw.t = Math.min(1, tw.t + (reduceMotion ? 1 : dt / step.dur));
    const k = 1 - Math.pow(1 - tw.t, 3);
    tw.obj.position.lerpVectors(tw.from.p, step.p, k);
    tw.obj.quaternion.slerpQuaternions(tw.from.q, step.q, k);
    if (tw.t >= 1) {
      tw.steps.shift();
      tw.t = 0;
      tw.from = null;
      if (tw.steps.length === 0) { tweens.splice(i, 1); tw.onDone?.(); }
    }
  }
}

// ---------- Benda padat untuk tabrakan kamera ----------
export const solids = new Set<THREE.Object3D>();
/** Ref callback: daftarkan objek sebagai benda padat selama ter-mount. */
export const solid = (o: THREE.Object3D | null) => {
  if (o) solids.add(o);
};

/** Sorot biru untuk benda yang bisa di-action. Material asli disimpan dan dipulihkan. */
const HIGHLIGHT = new THREE.Color(0x3d8bff);
export function setHighlight(obj: THREE.Object3D, on: boolean, exposure: number) {
  const mesh = obj as THREE.Mesh;
  const base = (mesh.userData.baseMaterial ??= mesh.material) as THREE.Material;
  if (!(base instanceof THREE.MeshStandardMaterial)) return;
  if (!on) { mesh.material = base; return; }
  const hl = (mesh.userData.highlight ??= Object.assign(base.clone(), { emissive: HIGHLIGHT.clone() })) as THREE.MeshStandardMaterial;
  hl.emissiveIntensity = 0.3 / exposure; // sorot tetap terlihat di eksposur malam yang rendah
  mesh.material = hl;
}

/** Eksposur kamera dari posisi slider 0–1 (skala log, malam ↔ terang). */
export const exposureFromSlider = (v: number) => 0.0025 * Math.pow(40, v);
