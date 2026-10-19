import type { NetworkFault } from "../network/faults.ts";

/** Rentang nilai yang diterima [min, max], inklusif. */
export type Range = readonly [min: number, max: number];

/** Aksi yang seharusnya dilakukan di satu langkah perakitan (dari data konten). */
export type ActionSpec =
  | { readonly kind: "install" }
  | { readonly kind: "torque"; readonly unit: "in-lb"; readonly range: Range | null }
  | { readonly kind: "safetyWire" }
  | {
      readonly kind: "adjust";
      readonly what: string;
      readonly unit: "in-lb" | "deg";
      readonly range: Range | null;
    }
  | { readonly kind: "connect"; readonly to: string }
  | { readonly kind: "inspect" };

export const DEFECT_KINDS = [
  "missing",
  "wrongOrder",
  "underTorque",
  "overTorque",
  "noLock",
  "wrongPart",
  "misadjusted",
] as const;

export type DefectKind = (typeof DEFECT_KINDS)[number];

/**
 * Efek fisik tiap jenis defect pada resource network. Ini parameter gameplay
 * (seberapa parah akibatnya), bukan data teknis pabrikan.
 */
export type StepEffects = { readonly [K in DefectKind]?: readonly NetworkFault[] };

export interface StepSpec {
  readonly id: string;
  readonly title: string;
  readonly partId: string;
  readonly requires: readonly string[];
  readonly actions: readonly ActionSpec[];
  readonly effects?: StepEffects;
}

/** Aksi yang benar-benar dilakukan engineer. */
export type PerformedAction =
  | { readonly kind: "install"; readonly partId: string }
  | { readonly kind: "torque"; readonly value: number }
  | { readonly kind: "safetyWire" }
  | { readonly kind: "adjust"; readonly value: number }
  | { readonly kind: "connect" }
  | { readonly kind: "inspect" };

export interface StepRecord {
  readonly stepId: string;
  readonly performed: readonly PerformedAction[];
  /** Engineer menandatangani checklist. Tidak memverifikasi apa pun. */
  readonly signedOff: boolean;
}

export interface AssemblyLog {
  /** Urut kronologis. Record terakhir untuk langkah yang sama dianggap hasil akhir (rework). */
  readonly records: readonly StepRecord[];
}

export interface Defect {
  readonly stepId: string;
  readonly kind: DefectKind;
  readonly detail: string;
  /** true bila langkahnya sudah di-sign-off padahal defect ini ada. */
  readonly signedOff: boolean;
}
