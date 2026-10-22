import type { Defect } from "../assembly/types.ts";

/**
 * Pengapian dua magneto, dinilai kualitatif. Batas penurunan RPM berbeda tiap pesawat (lihat manualnya),
 * jadi tidak ada angka RPM di sini: hanya turun normal / tidak turun / mesin kasar-mati.
 *
 * Dasar perilaku (AOPA, "The Magneto Check"): tiap posisi kunci menjalankan satu magneto dan meng-ground
 * yang lain; tanpa penurunan RPM bisa berarti P-lead putus, sehingga magneto tidak bisa dimatikan.
 */
export interface MagnetoSpec {
  readonly id: string;
  readonly label: string;
  /** Langkah pasang magneto: part tidak terpasang = magneto tidak menyala. */
  readonly installStep: string;
  /** Langkah sambung P-lead: tidak tersambung = magneto tidak bisa di-ground (tetap menyala). */
  readonly pLeadStep: string;
}

export type MagResult = "normal" | "noDrop" | "rough";

export interface IgnitionFinding {
  readonly magnetoId: string;
  readonly problem: "notFiring" | "notGrounded";
  readonly cause: Defect | null;
}

export interface RunUpReport {
  readonly started: boolean;
  /** Per posisi kunci (satu magneto saja yang dimaksudkan menyala). Kosong bila mesin tidak hidup. */
  readonly magCheck: readonly { readonly magnetoId: string; readonly result: MagResult }[];
  /** Kunci OFF saat idle: mesin harus mati. null bila mesin tidak hidup. */
  readonly offCheck: "stops" | "keepsRunning" | null;
  readonly findings: readonly IgnitionFinding[];
}

const defectOf = (defects: readonly Defect[], stepId: string, kinds: readonly Defect["kind"][]) =>
  defects.find((d) => d.stepId === stepId && kinds.includes(d.kind)) ?? null;

/** Fungsi murni: defect perakitan + apakah starter bekerja → hasil start, mag check, dan tes kunci OFF. */
export function runUp(magnetos: readonly MagnetoSpec[], defects: readonly Defect[], starterOk: boolean): RunUpReport {
  const notFiring = new Map(magnetos.map((m) => [m.id, defectOf(defects, m.installStep, ["missing", "wrongPart"])]));
  const notGrounded = new Map(magnetos.map((m) => [m.id, defectOf(defects, m.pLeadStep, ["missing"])]));
  const firing = (m: MagnetoSpec) => notFiring.get(m.id) === null;
  const groundable = (m: MagnetoSpec) => notGrounded.get(m.id) === null;

  const findings: IgnitionFinding[] = magnetos.flatMap((m): IgnitionFinding[] => {
    if (!firing(m)) return [{ magnetoId: m.id, problem: "notFiring", cause: notFiring.get(m.id) ?? null }];
    if (!groundable(m)) return [{ magnetoId: m.id, problem: "notGrounded", cause: notGrounded.get(m.id) ?? null }];
    return [];
  });

  const firingAtBoth = magnetos.filter(firing).length;
  const started = starterOk && firingAtBoth > 0;
  if (!started) return { started, magCheck: [], offCheck: null, findings };

  const magCheck = magnetos.map((m) => {
    // Magneto lain yang P-lead-nya tidak tersambung tetap menyala walau di-ground lewat kunci
    const stillFiring = magnetos.filter((o) => firing(o) && (o.id === m.id || !groundable(o))).length;
    const result: MagResult = stillFiring === 0 ? "rough" : stillFiring === firingAtBoth ? "noDrop" : "normal";
    return { magnetoId: m.id, result };
  });
  const offCheck = magnetos.some((m) => firing(m) && !groundable(m)) ? "keepsRunning" : "stops";
  return { started, magCheck, offCheck, findings };
}
