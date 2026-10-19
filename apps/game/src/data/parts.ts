/**
 * Part Tier 2 yang bisa dirakit di irisan ini, plus pad dudukannya di mesin (koordinat lokal grup mesin, meter).
 * `assetId` = model dari asset pipeline, `contentId` + `stepId` = data perakitan di @aes/content.
 */
export interface PadDef {
  readonly code: string;
  readonly name: string;
  readonly y: number;
  readonly z: number;
  /** Offset z tiap stud dari pusat pad. Posisi telinga flange diukur dari model hasil pipeline. */
  readonly studs: readonly number[];
  /** Jarak muka mur dari muka pad = tebal telinga flange (diukur dari model hasil pipeline). */
  readonly nutX: number;
}

export interface PartDef {
  readonly assetId: string;
  readonly contentId: string;
  readonly stepId: string;
  readonly name: string;
  readonly label: string;
  readonly pad: PadDef;
  /** Posisi istirahat di meja part (x, z) dan rotasi yaw. */
  readonly rest: readonly [x: number, z: number];
  readonly yaw: number;
  /** Teks strip task card per tahap: pasang part, pasang mur, kencangkan, selesai. */
  readonly stages: readonly (readonly [code: string, text: string])[];
}

/** Muka pad di x = 0,52 (normal +x), di belakang gearbox aksesori. */
export const PAD_FACE_X = 0.52;

export const PARTS: readonly PartDef[] = [
  {
    assetId: "acc.magneto.mk1",
    contentId: "ign.magneto.left",
    stepId: "74-10-01",
    name: "Magneto kiri",
    label: "magneto",
    pad: { code: "74-10-01", name: "Pad magneto kiri · titik pasang", y: 0.1, z: 0.09, studs: [-0.056, 0.056], nutX: 0.016 },
    rest: [0.13, 0.96],
    yaw: 0.35,
    stages: [
      ["TC 74-10-01 · LANGKAH 1 / 6", "Pasang magneto kiri ke pad"],
      ["TC 74-10-01 · LANGKAH 2 / 6", "Pasang ring & mur di stud (klik stud)"],
      ["TC 74-10-01 · LANGKAH 3 / 6", "Kencangkan mur pengikat (T: kunci torsi)"],
      ["TC 74-10-01 · LANGKAH 4 / 6", "Pasang safety wire, lalu sign-off task card"],
    ],
  },
  {
    assetId: "acc.starter.mk1",
    contentId: "ele.starter",
    stepId: "80-10-01",
    name: "Motor starter",
    label: "starter",
    pad: { code: "80-10-01", name: "Pad starter · titik pasang", y: -0.06, z: -0.075, studs: [-0.05, 0.05], nutX: 0.022 },
    rest: [0.5, 0.8],
    yaw: -0.25,
    stages: [
      ["TC 80-10-01 · LANGKAH 1 / 4", "Pasang starter ke pad"],
      ["TC 80-10-01 · LANGKAH 2 / 4", "Pasang ring & mur di stud (klik stud)"],
      ["TC 80-10-01 · LANGKAH 3 / 4", "Kencangkan mur pengikat (T: kunci torsi)"],
      ["TC 80-10-01 · LANGKAH 4 / 4", "Sambungkan kabel starter, lalu sign-off"],
    ],
  },
];

export const partDef = (assetId: string): PartDef => {
  const def = PARTS.find((p) => p.assetId === assetId);
  if (!def) throw new Error(`Part tidak dikenal: ${assetId}`);
  return def;
};
