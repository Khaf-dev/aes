import type { Defect } from "../assembly/types.ts";

/**
 * Pasokan bahan bakar ke mesin, dinilai sebagai jalur langkah perakitan: karburator dulu, lalu ke hulu
 * (selang ke karburator, dst.). Satu langkah yang tidak dikerjakan = bahan bakar tidak sampai, mesin tidak hidup.
 * Kebocoran dan tekanan bahan bakar belum dimodelkan.
 */
export interface FuelSupplySpec {
  /** Urut dari karburator ke hulu. */
  readonly steps: readonly string[];
}

export interface FuelCheck {
  readonly delivered: boolean;
  /** Langkah paling hilir yang memutus pasokan (karburator tidak terpasang lebih dulu dari selangnya). */
  readonly cause: Defect | null;
}

export function fuelCheck(supply: FuelSupplySpec, defects: readonly Defect[]): FuelCheck {
  for (const stepId of supply.steps) {
    const cause = defects.find((d) => d.stepId === stepId && (d.kind === "missing" || d.kind === "wrongPart"));
    if (cause) return { delivered: false, cause };
  }
  return { delivered: true, cause: null };
}
