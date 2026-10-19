/**
 * Mekanik kunci torsi tipe klik, fungsi murni (tanpa three.js / DOM).
 *
 * Mur diputar dulu sampai duduk (run-down), lalu torsi naik selama gagang ditarik. Saat mencapai setelan,
 * kepala kunci "patah" (klik) dan torsi tertahan di setelan selama sudut patah itu. Kalau gagang terus
 * ditarik melewatinya, torsi naik lagi (over-torque), seperti kunci tipe klik sungguhan.
 * Engineer hanya tahu setelan + rasa klik; torsi sebenarnya disimpan di mur dan baru berpengaruh saat tes.
 */

/** Rentang alat: kunci klik 3/8 in, 40–200 in-lb (tools/asset-pipeline/specs/tools/torque-wrench-40-200.json). */
export const WRENCH_MIN = 40;
export const WRENCH_MAX = 200;
export const WRENCH_STEP = 5;

// Parameter gameplay (tempo animasi), bukan data teknis.
const RATE = 40; // in-lb per detik saat ditarik
const RUNDOWN_S = 1.2; // lama memutar mur sampai duduk
const BREAK_S = 0.35; // lama sudut patah kepala kunci setelah klik

export type Feel = "klik" | "tanpa klik" | "lewat klik";

export interface PullState {
  readonly seated: boolean;
  readonly rundown: number;
  /** Torsi yang sedang diterapkan tarikan ini (in-lb). */
  readonly applied: number;
  readonly peak: number;
  /** Torsi yang sudah ada di mur sebelum tarikan ini. */
  readonly preload: number;
  readonly clicked: boolean;
  readonly breakT: number;
  /** Untuk animasi: sudut ayun gagang dan putaran mur (derajat), intensitas cap KLIK (0–1). */
  readonly wrenchAng: number;
  readonly nutAng: number;
  readonly klik: number;
}

export type ReleaseResult =
  | { readonly kind: "notSeated" }
  | { readonly kind: "noMove" }
  | { readonly kind: "torqued"; readonly value: number; readonly feel: Feel };

export const clampSetting = (value: number): number => Math.max(WRENCH_MIN, Math.min(WRENCH_MAX, value));

/** Sesi baru di satu mur. `torque` = torsi mur saat ini (null = baru kencang tangan). */
export function openSession(torque: number | null): PullState {
  const preload = torque ?? 0;
  return {
    seated: preload > 0, rundown: 0, applied: 0, peak: 0, preload,
    clicked: false, breakT: 0, wrenchAng: 0, nutAng: 0, klik: 0,
  };
}

export const beginPull = (s: PullState): PullState => ({ ...s, applied: 0, peak: 0, clicked: false, breakT: 0 });

export function tick(s: PullState, dt: number, holding: boolean, setting: number): PullState {
  let { seated, rundown, applied, peak, clicked, breakT, wrenchAng, nutAng, klik } = s;
  if (holding) {
    if (!seated) {
      // Run-down: kunci mengayun lalu ratchet kembali, mur ikut berputar
      rundown += dt / RUNDOWN_S;
      applied = 3;
      wrenchAng = (wrenchAng + dt * 90) % 40;
      nutAng += dt * 90;
      if (rundown >= 1) { seated = true; applied = 0; }
    } else if (clicked && breakT < BREAK_S) {
      breakT += dt; // kepala kunci patah: torsi tertahan di setelan
    } else {
      applied = Math.min(WRENCH_MAX, applied + RATE * dt);
      wrenchAng = Math.min(14, wrenchAng + dt * 9);
      if (applied > s.preload) nutAng += dt * 6; // mur bergerak sedikit saat dikencangkan
      if (!clicked && applied >= setting) { applied = setting; clicked = true; klik = 1; wrenchAng += 7; }
    }
    peak = Math.max(peak, applied);
  } else {
    wrenchAng = Math.max(0, wrenchAng - dt * 60);
  }
  klik = Math.max(0, klik - dt * 1.2);
  return { ...s, seated, rundown, applied, peak, clicked, breakT, wrenchAng, nutAng, klik };
}

/** Gagang dilepas: hasil tarikan untuk dicatat di mur dan slip log. */
export function release(s: PullState, setting: number): { state: PullState; result: ReleaseResult } {
  const state = { ...s, applied: 0 };
  if (!s.seated) return { state, result: { kind: "notSeated" } };
  if (s.peak <= s.preload) return { state, result: { kind: "noMove" } };
  const value = Math.round(s.peak * 10) / 10;
  const feel: Feel = !s.clicked ? "tanpa klik" : value > setting + 0.5 ? "lewat klik" : "klik";
  return { state: { ...state, preload: value }, result: { kind: "torqued", value, feel } };
}
