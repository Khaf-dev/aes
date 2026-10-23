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

/**
 * Safety wire antara dua mur satu part. `positive` = lilitan cenderung mengencangkan
 * (aturan FAA: kawat harus selalu cenderung mengencangkan pengencang). Tidak diperiksa sistem, baru ketahuan saat tes.
 */
export interface Wire {
  readonly a: number;
  readonly b: number;
  readonly positive: boolean;
}

/** Checklist task card: dicentang sendiri oleh engineer dan tidak memverifikasi apa pun. */
export interface Signoff {
  readonly checks: readonly boolean[];
  readonly signed: boolean;
}

export interface RakitState {
  readonly parts: Readonly<Record<string, PartStatus>>;
  readonly nuts: Readonly<Record<string, readonly NutState[]>>;
  readonly wires: Readonly<Record<string, readonly Wire[]>>;
  /** Kabel tersambung ke terminal part (P-lead magneto, kabel output alternator). */
  readonly cables: Readonly<Record<string, boolean>>;
  /** Per id langkah (task card). */
  readonly signoff: Readonly<Record<string, Signoff>>;
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
    wires: Object.fromEntries(PARTS.map((p) => [p.assetId, []])),
    cables: Object.fromEntries(PARTS.filter((p) => p.cable).map((p) => [p.assetId, false])),
    signoff: {},
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
  if (s.cables[partId]) {
    return { state: s, toast: { text: `${def.cable!.name} ${def.label} masih tersambung. Lepas dulu dari terminalnya.`, bad: true } };
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
    const other = partDef(padFor);
    // Part dengan model sama (magneto kiri/kanan) secara fisik muat; aturan pad mengikuti task card, bukan flange
    const sameFlange = (other.model ?? other.assetId) === (held.model ?? held.assetId);
    const text = sameFlange
      ? `Pad ini untuk ${other.name.toLowerCase()}. Cek kode di tag: ${other.pad.code}.`
      : `Flange ${held.name.toLowerCase()} tidak cocok dengan pad ini. Cek kode di tag: ${other.pad.code}.`;
    return { state: s, toast: { text, bad: true } };
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

export const isWired = (s: RakitState, partId: string, index: number) =>
  (s.wires[partId] ?? []).some((w) => w.a === index || w.b === index);

/** Klik mur (di luar mode torsi): kendurkan lalu lepas. */
export function removeNut(s: RakitState, partId: string, index: number): Outcome {
  const nut = nutsOf(s, partId)[index];
  if (!nut?.installed) return { state: s };
  if (isWired(s, partId, index)) {
    return { state: s, toast: { text: `Mur #${index + 1} masih diikat safety wire. Potong kawatnya dulu (K: tang safety wire).`, bad: true } };
  }
  return {
    state: withNut(s, partId, index, EMPTY_NUT),
    toast: { text: nut.torque === null ? `Mur #${index + 1} dilepas.` : `Mur #${index + 1} dikendurkan lalu dilepas.` },
  };
}

/** Pasang safety wire antara mur `a` dan `b` dengan arah lilitan pilihan engineer. */
export function installWire(s: RakitState, partId: string, a: number, b: number, positive: boolean): Outcome {
  const nuts = nutsOf(s, partId);
  if (a === b) return { state: s };
  const missing = [a, b].filter((i) => !nuts[i]?.installed);
  if (missing.length) {
    return { state: s, toast: { text: `Pasang mur ${missing.map((i) => `#${i + 1}`).join(" & ")} dulu sebelum safety wire.`, bad: true } };
  }
  if (isWired(s, partId, a) || isWired(s, partId, b)) {
    return { state: s, toast: { text: "Mur itu sudah diikat safety wire. Potong dulu kalau mau dipasang ulang.", bad: true } };
  }
  return {
    state: { ...s, wires: { ...s.wires, [partId]: [...(s.wires[partId] ?? []), { a, b, positive }] } },
    toast: { text: `Safety wire terpasang antara mur #${a + 1} dan #${b + 1}. Sistem tidak memeriksa arah lilitan.` },
  };
}

/** Potong safety wire yang mengikat mur `index`. Kawat bekas tidak dipakai ulang (AC 43.13-1B par. 7-38). */
export function cutWire(s: RakitState, partId: string, index: number): Outcome {
  if (!isWired(s, partId, index)) return { state: s };
  return {
    state: { ...s, wires: { ...s.wires, [partId]: (s.wires[partId] ?? []).filter((w) => w.a !== index && w.b !== index) } },
    toast: { text: "Safety wire dipotong. Kawat bekas dibuang, tidak dipakai ulang." },
  };
}

/** Centang/hapus centang satu baris checklist. Task card yang sudah ditandatangani tidak bisa diubah. */
export function toggleCheck(s: RakitState, stepId: string, index: number, count: number): RakitState {
  const card = s.signoff[stepId] ?? { checks: Array<boolean>(count).fill(false), signed: false };
  if (card.signed) return s;
  return { ...s, signoff: { ...s.signoff, [stepId]: { ...card, checks: card.checks.map((c, i) => (i === index ? !c : c)) } } };
}

/** Tanda tangan task card. Tidak memeriksa apa pun: kalau ada yang salah, baru ketahuan saat tes. */
export function signOff(s: RakitState, stepId: string, count: number): RakitState {
  const card = s.signoff[stepId] ?? { checks: Array<boolean>(count).fill(false), signed: false };
  return { ...s, signoff: { ...s.signoff, [stepId]: { ...card, signed: true } } };
}

export function torqueNut(s: RakitState, partId: string, index: number, value: number, log: TorqueLog): RakitState {
  const nut = nutsOf(s, partId)[index];
  if (!nut?.installed) return s;
  return withNut(s, partId, index, { installed: true, torque: value, log });
}

/** Klik terminal kabel di part: sambung atau lepas. Hanya bisa saat part duduk di pad. */
export function toggleCable(s: RakitState, partId: string): Outcome {
  const def = partDef(partId);
  if (!def.cable) return { state: s };
  if (s.parts[partId] !== "installed") {
    return { state: s, toast: { text: `Pasang ${def.label} di pad dulu, baru sambungkan ${def.cable.name.toLowerCase()}.`, bad: true } };
  }
  const connected = !s.cables[partId];
  return {
    state: { ...s, cables: { ...s.cables, [partId]: connected } },
    toast: { text: connected ? `${def.cable.name} ${def.label} tersambung ke terminalnya.` : `${def.cable.name} ${def.label} dilepas.` },
  };
}

export type Stage = "install" | "nuts" | "torque" | "wire" | "cable" | "signoff" | "done";

/**
 * Petunjuk strip task card berdasarkan keadaan fisik. Hanya penunjuk arah, bukan validasi:
 * sign-off tetap bisa dilakukan kapan saja. `needsWire` dari data konten langkahnya.
 */
export function stage(s: RakitState, partId: string, needsWire: boolean): Stage {
  const def = partDef(partId);
  const cards = [def.stepId, ...(def.cable ? [def.cable.stepId] : [])];
  if (cards.every((id) => s.signoff[id]?.signed)) return "done";
  const nuts = nutsOf(s, partId);
  if (s.parts[partId] !== "installed") return "install";
  if (!nuts.every((n) => n.installed)) return "nuts";
  if (!nuts.every((n) => n.torque !== null)) return "torque";
  if (needsWire && (s.wires[partId] ?? []).length === 0) return "wire";
  if (def.cable && !s.cables[partId]) return "cable";
  return "signoff";
}
