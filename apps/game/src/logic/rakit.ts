/**
 * Aturan fisik mode rakit, fungsi murni. Sistem tidak memvalidasi kebenaran rakitan (itu tugas tes),
 * tapi batasan fisik tetap berlaku: part yang masih diikat mur tidak bisa diangkat, flange yang tidak
 * cocok tidak bisa duduk di pad, mur hanya bisa dipasang setelah part duduk di pad.
 */
import type { Feel } from "./clickWrench.ts";
import { PARTS, partDef } from "../data/parts.ts";

export type PartStatus = "staged" | "held" | "installed";

/** Yang diketahui engineer dari satu tarikan: setelan kunci + rasa klik. */
export interface TorqueLog {
  readonly setting: number;
  readonly feel: Feel;
}

export interface NutState {
  readonly installed: boolean;
  /** Torsi sebenarnya (kebenaran simulasi, tersembunyi dari pemain). null = kencang tangan / belum dipasang. */
  readonly torque: number | null;
  readonly log: TorqueLog | null;
}

export interface RakitState {
  readonly parts: Readonly<Record<string, PartStatus>>;
  readonly nuts: Readonly<Record<string, readonly NutState[]>>;
  readonly held: string | null;
}

export interface Outcome {
  readonly state: RakitState;
  readonly toast?: { readonly text: string; readonly bad?: boolean };
}

const EMPTY_NUT: NutState = { installed: false, torque: null, log: null };

export function initialRakit(): RakitState {
  return {
    parts: Object.fromEntries(PARTS.map((p) => [p.assetId, "staged" as const])),
    nuts: Object.fromEntries(PARTS.map((p) => [p.assetId, p.pad.studs.map(() => EMPTY_NUT)])),
    held: null,
  };
}

const nutsOf = (s: RakitState, partId: string): readonly NutState[] => s.nuts[partId] ?? [];
const withNut = (s: RakitState, partId: string, index: number, nut: NutState): RakitState => ({
  ...s,
  nuts: { ...s.nuts, [partId]: nutsOf(s, partId).map((n, i) => (i === index ? nut : n)) },
});

export function pickUp(s: RakitState, partId: string): Outcome {
  if (s.held !== null) return { state: s };
  const def = partDef(partId);
  const fastened = nutsOf(s, partId).filter((n) => n.installed).length;
  if (s.parts[partId] === "installed" && fastened > 0) {
    return {
      state: s,
      toast: { text: `${def.name} masih diikat ${fastened} mur. Kendurkan & lepas murnya dulu (klik mur).`, bad: true },
    };
  }
  const wasInstalled = s.parts[partId] === "installed";
  return {
    state: { ...s, parts: { ...s.parts, [partId]: "held" }, held: partId },
    ...(wasInstalled ? { toast: { text: `${def.name} dilepas dari pad.` } } : {}),
  };
}

export function putBack(s: RakitState): Outcome {
  if (s.held === null) return { state: s };
  return { state: { ...s, parts: { ...s.parts, [s.held]: "staged" }, held: null } };
}

/** Pemain mengklik pad (atau bayangan pemasangan) milik `padFor` sambil memegang part. */
export function install(s: RakitState, padFor: string): Outcome {
  if (s.held === null) return { state: s };
  const held = partDef(s.held);
  if (padFor !== s.held) {
    const pad = partDef(padFor).pad;
    return {
      state: s,
      toast: { text: `Flange ${held.name.toLowerCase()} tidak cocok dengan pad ini. Cek kode di tag: ${pad.code}.`, bad: true },
    };
  }
  return {
    state: { ...s, parts: { ...s.parts, [s.held]: "installed" }, held: null },
    toast: { text: `${held.name} duduk di pad. Sistem tidak memeriksa pemasangan: cek sendiri sesuai task card.` },
  };
}

/** Klik stud: pasang ring + mur, kencang tangan. */
export function installNut(s: RakitState, partId: string, index: number): Outcome {
  const def = partDef(partId);
  if (s.parts[partId] !== "installed") {
    return { state: s, toast: { text: `Pasang ${def.label} di pad dulu, baru ring & mur.`, bad: true } };
  }
  if (nutsOf(s, partId)[index]?.installed) return { state: s };
  return {
    state: withNut(s, partId, index, { installed: true, torque: null, log: null }),
    toast: { text: `Ring & mur #${index + 1} terpasang, masih kencang tangan.` },
  };
}

/** Klik mur (di luar mode torsi): kendurkan lalu lepas. */
export function removeNut(s: RakitState, partId: string, index: number): Outcome {
  const nut = nutsOf(s, partId)[index];
  if (!nut?.installed) return { state: s };
  return {
    state: withNut(s, partId, index, EMPTY_NUT),
    toast: { text: nut.torque === null ? `Mur #${index + 1} dilepas.` : `Mur #${index + 1} dikendurkan lalu dilepas.` },
  };
}

export function torqueNut(s: RakitState, partId: string, index: number, value: number, log: TorqueLog): RakitState {
  const nut = nutsOf(s, partId)[index];
  if (!nut?.installed) return s;
  return withNut(s, partId, index, { installed: true, torque: value, log });
}

/** Tahap task card: 0 pasang part, 1 pasang mur, 2 kencangkan, 3 lanjut. */
export function stage(s: RakitState, partId: string): 0 | 1 | 2 | 3 {
  const nuts = nutsOf(s, partId);
  if (s.parts[partId] !== "installed") return 0;
  if (!nuts.every((n) => n.installed)) return 1;
  if (!nuts.every((n) => n.torque !== null)) return 2;
  return 3;
}
