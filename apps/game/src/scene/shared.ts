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
/** Dinding belakang hanggar (meja kerja, shadow board, papan tulis menempel di sini). */
export const BACK = ROOM.minZ;

/** Shadow board: ukuran (m) dan konversi koordinat gambar papan (px, 1 px = 1 mm) ke dunia. */
export const BOARD = { W: 1.6, H: 0.9, cx: -1.4, cy: 1.68, z: BACK + 0.02 } as const;
export const toBoard = (u: number, v: number) => V(BOARD.cx - BOARD.W / 2 + u / 1000, BOARD.cy + BOARD.H / 2 - v / 1000, BOARD.z + 0.016);

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
  redPaint: std(0xa3201a, 0.2, 0.32),
  bluePaint: std(0x24456e, 0.3, 0.45),
  wood: std(0x6b4a2e, 0.0, 0.7),
  benchTop: std(0x8a6a45, 0.0, 0.55),
  ceramic: std(0xe8e4dc, 0.0, 0.35),
} as const;

/** Data interaksi yang dibaca handler klik/hover di akar scene. */
export type Pick =
  | { readonly kind: "decor"; readonly code: string; readonly name: string }
  | { readonly kind: "part"; readonly part: string; readonly code: string; readonly name: string }
  | { readonly kind: "pad"; readonly part: string; readonly code: string; readonly name: string }
  | { readonly kind: "stud"; readonly part: string; readonly index: number; readonly code: string; readonly name: string }
  | { readonly kind: "nut"; readonly part: string; readonly index: number; readonly code: string; readonly name: string }
  | { readonly kind: "tool"; readonly code: string; readonly name: string }
  /** Terminal kabel di part (P-lead magneto, output alternator): sambung/lepas. */
  | { readonly kind: "terminal"; readonly part: string; readonly code: string; readonly name: string }
  /** Meja kerja: membuka mode dokumen di task card yang paling relevan. */
  | { readonly kind: "bench"; readonly code: string; readonly name: string }
  /** Task card di meja kerja: membuka mode dokumen. */
  | { readonly kind: "taskcard"; readonly stepId: string; readonly code: string; readonly name: string }
  /** Komponen dalam mesin: hanya bisa dipilih lewat lensa x-ray. */
  | { readonly kind: "internal"; readonly code: string; readonly name: string };

/** Untuk garis bantu: threshold raycast garis three.js 1 m, jadi garis harus dikecualikan dari klik/hover. */
export const NO_RAYCAST = () => {};

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
  /** Benda yang sedang di-hover (untuk fokus kamera, tombol F). */
  hoveredObject: null as THREE.Object3D | null,
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
export function stopTween(obj: THREE.Object3D) {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i]!.obj === obj) tweens.splice(i, 1);
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
/**
 * Benda yang dibuat tembus pandang saat menghalangi pandangan kamera ke titik fokus
 * (firewall, engine mount, stand). Kamera tetap tidak menembusnya; hanya tampilannya yang memudar.
 */
export const fadeables = new Set<THREE.Object3D>();
export const fadeable = (o: THREE.Object3D | null) => {
  if (o) fadeables.add(o);
};
export function setFaded(mesh: THREE.Mesh, on: boolean) {
  if (Boolean(mesh.userData.faded) === on) return;
  const base = (mesh.userData.fadeBase ??= mesh.material) as THREE.Material;
  mesh.userData.faded = on;
  mesh.material = on
    ? (mesh.userData.fadeMaterial ??= Object.assign(base.clone(), { transparent: true, opacity: 0.15, depthWrite: false }))
    : base;
}

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
  // clone() tidak membawa patch shader (lensa x-ray), jadi disalin manual
  const hl = (mesh.userData.highlight ??= Object.assign(base.clone(), {
    emissive: HIGHLIGHT.clone(),
    onBeforeCompile: base.onBeforeCompile,
    customProgramCacheKey: base.customProgramCacheKey,
  })) as THREE.MeshStandardMaterial;
  hl.emissiveIntensity = 0.3 / exposure; // sorot tetap terlihat di eksposur malam yang rendah
  mesh.material = hl;
}

/** Eksposur kamera dari posisi slider 0–1 (skala log, malam ↔ terang). */
export const exposureFromSlider = (v: number) => 0.0025 * Math.pow(40, v);

// ---------- Lensa x-ray: fragmen kulit mesin dibuang di dalam lingkaran kursor ----------
/** (x, y, radius) dalam piksel framebuffer, w = 1 bila aktif. */
export const lensUniform = { value: new THREE.Vector4(0, 0, 0, 0) };
export const LENS_RADIUS = 110;
for (const mat of [M.castAlu, M.cylinder, M.head]) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLens = lensUniform;
    shader.fragmentShader = "uniform vec4 uLens;\n" + shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\n if (uLens.w > 0.5 && distance(gl_FragCoord.xy, uLens.xy) < uLens.z) discard;",
    );
  };
  mat.customProgramCacheKey = () => "aes-lens";
}
/** Dinding dalam mesin yang terlihat lewat lensa (gaya cutaway), tidak terpengaruh eksposur. */
export const INTERIOR = new THREE.MeshBasicMaterial({ color: 0x0c1d22, side: THREE.BackSide, toneMapped: false });
export const XRAY_LINE = new THREE.LineBasicMaterial({ color: 0x5cc8d7, toneMapped: false });

// ---------- Font untuk tekstur kanvas (tag, task card, papan) ----------
let fontsReady: Promise<unknown> | null = null;
/** Selesai saat font tulisan cetak dan tangan siap dipakai di canvas 2D (gagal = lanjut dengan font cadangan). */
export function loadCanvasFonts() {
  fontsReady ??= typeof document === "undefined"
    ? Promise.resolve()
    : Promise.all([
      document.fonts.load('700 40px "Courier Prime"'),
      document.fonts.load('400 40px "Courier Prime"'),
      document.fonts.load('700 60px "Caveat"'),
    ]).catch(() => undefined);
  return fontsReady;
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
export function rand(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
