/**
 * Kamera badan engineer (first person), fungsi murni tanpa three.js: gerak di bidang lantai dengan tabrakan
 * badan (silinder tegak) terhadap kotak benda padat, lalu meluncur di sepanjang dinding benda.
 * Semua angka di sini parameter gameplay, bukan data antropometri bersumber.
 */
export interface Box {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Tinggi mata (m): berdiri, jongkok, dan batas jongkok rendah / jinjit. */
export const EYE = { stand: 1.6, crouch: 1.0, min: 0.55, max: 1.8 } as const;
export const SPEED = { walk: 1.4, run: 2.6, eye: 0.8 } as const; // m/s
const BODY_RADIUS = 0.2;
/** Benda lebih rendah dari ini dilangkahi (kabel, rel lantai). */
const STEP_OVER = 0.12;

export const clampEye = (y: number) => Math.min(EYE.max, Math.max(EYE.min, y));

/** Badan berdiri di (x, z) dengan mata setinggi `eye` menabrak salah satu kotak? */
export function blocked(x: number, z: number, eye: number, boxes: readonly Box[]): boolean {
  return boxes.some((b) =>
    b.max[1] > STEP_OVER && b.min[1] < eye + 0.1 &&
    x > b.min[0] - BODY_RADIUS && x < b.max[0] + BODY_RADIUS &&
    z > b.min[2] - BODY_RADIUS && z < b.max[2] + BODY_RADIUS,
  );
}

/**
 * Geser badan sejauh (dx, dz). Kalau menabrak, coba tiap sumbu sendiri supaya badan meluncur di sepanjang benda.
 * Badan yang sudah terlanjur di dalam benda (mis. kamera dipindah dari luar) tetap boleh bergerak keluar.
 */
export function move(x: number, z: number, dx: number, dz: number, eye: number, boxes: readonly Box[]): [number, number] {
  if (blocked(x, z, eye, boxes)) return [x + dx, z + dz];
  if (!blocked(x + dx, z + dz, eye, boxes)) return [x + dx, z + dz];
  if (!blocked(x + dx, z, eye, boxes)) return [x + dx, z];
  if (!blocked(x, z + dz, eye, boxes)) return [x, z + dz];
  return [x, z];
}
