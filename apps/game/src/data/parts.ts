/**
 * Part Tier 2 yang bisa dirakit di irisan ini, plus pad dudukannya di mesin (koordinat lokal grup mesin, meter).
 * `assetId` = model dari asset pipeline, `contentId` + `stepId` = data perakitan di @aes/content.
 */
export interface PadDef {
  readonly code: string;
  readonly name: string;
  /** Pusat muka pad. x default = PAD_FACE_X (muka belakang gearbox aksesori). */
  readonly x?: number;
  readonly y: number;
  readonly z: number;
  /** Arah keluar dari muka pad (default +x). Bingkai lokal pad: x = normal, y/z = bidang muka pad. */
  readonly normal?: readonly [number, number, number];
  /** Posisi tiap stud [y, z] di bidang muka pad (bingkai lokal). Posisi telinga flange diukur dari model hasil pipeline. */
  readonly studs: readonly (readonly [y: number, z: number])[];
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
  /** Model GLB dari asset pipeline bila berbeda dari `assetId` (magneto kiri & kanan memakai model yang sama). */
  readonly model?: string;
  /**
   * Kabel ke terminal di part, disambung sebagai task card tersendiri (P-lead magneto, kabel output alternator).
   * `terminal` = posisi terminal relatif muka pad: [x keluar dari pad, y di atas pusat pad] (m).
   */
  readonly cable?: {
    readonly stepId: string;
    readonly contentId: string;
    readonly name: string;
    readonly terminal: readonly [x: number, y: number];
    /** Ujung lain di belakang firewall uji: kunci kontak magneto, kotak bus/relay, atau sistem bahan bakar stand. */
    readonly to: "magSwitch" | "busBox" | "fuel";
  };
}

/** Muka pad di x = 0,52 (normal +x), di belakang gearbox aksesori. */
export const PAD_FACE_X = 0.52;

export const PARTS: readonly PartDef[] = [
  {
    assetId: "acc.magneto.mk1",
    contentId: "ign.magneto.left",
    stepId: "74-10-01",
    name: "Magneto kiri",
    label: "magneto kiri",
    pad: { code: "74-10-01", name: "Pad magneto kiri · titik pasang", y: 0.1, z: 0.09, studs: [[0, -0.056], [0, 0.056]], nutX: 0.016 },
    rest: [-0.05, 1.62],
    yaw: 0.35,
    cable: { stepId: "74-10-03", contentId: "ele.p-lead.left", name: "P-lead", terminal: [0.15, 0.035], to: "magSwitch" },
  },
  {
    // Pad kanan dicerminkan dari pad kiri terhadap bidang tengah mesin (z = 0); posisi belum bersumber.
    assetId: "acc.magneto.mk1.r",
    model: "acc.magneto.mk1",
    contentId: "ign.magneto.right",
    stepId: "74-10-02",
    name: "Magneto kanan",
    label: "magneto kanan",
    pad: { code: "74-10-02", name: "Pad magneto kanan · titik pasang", y: 0.1, z: -0.09, studs: [[0, -0.056], [0, 0.056]], nutX: 0.016 },
    rest: [0.2, 1.38],
    yaw: 0.2,
    cable: { stepId: "74-10-04", contentId: "ele.p-lead.right", name: "P-lead", terminal: [0.15, 0.035], to: "magSwitch" },
  },
  {
    assetId: "acc.starter.mk1",
    contentId: "ele.starter",
    stepId: "80-10-01",
    name: "Motor starter",
    label: "starter",
    pad: { code: "80-10-01", name: "Pad starter · titik pasang", y: -0.06, z: -0.075, studs: [[0, -0.05], [0, 0.05]], nutX: 0.022 },
    rest: [0.6, 1.38],
    yaw: -0.25,
  },
  {
    // Alternator penggerak gear di pad aksesori (desain AES-1); model masih placeholder pipeline, posisi pad belum bersumber.
    assetId: "acc.alternator.mk1",
    contentId: "ele.alternator",
    stepId: "24-30-05",
    name: "Alternator",
    label: "alternator",
    // studs/nutX dari spesifikasi placeholder: jarak telinga 150 mm (di luar badan Ø110), tebal flange 8 mm
    pad: { code: "24-30-05", name: "Pad alternator · titik pasang", y: -0.06, z: 0.085, studs: [[0, -0.075], [0, 0.075]], nutX: 0.008 },
    rest: [0.72, 1.62],
    yaw: 0.3,
    cable: { stepId: "24-30-06", contentId: "ele.cable.alternator-output", name: "Kabel output", terminal: [0.128, 0.069], to: "busBox" },
  },
  {
    // Karburator updraft di bawah bak oli (desain AES-1); model placeholder pipeline, posisi pad belum bersumber.
    assetId: "acc.carburetor.mk1",
    contentId: "fuel.carburetor",
    stepId: "73-10-01",
    name: "Karburator",
    label: "karburator",
    // Muka pad menghadap ke bawah; stud di sudut flange ±42 mm, tebal flange 10 mm (spesifikasi placeholder)
    pad: {
      code: "73-10-01", name: "Pad karburator · titik pasang", x: 0.17, y: -0.27, z: 0, normal: [0, -1, 0],
      studs: [[-0.042, -0.042], [-0.042, 0.042], [0.042, -0.042], [0.042, 0.042]], nutX: 0.01,
    },
    rest: [0.33, 1.62],
    yaw: -1.57,
    // Saluran masuk bahan bakar di sisi badan yang menghadap ke belakang mesin (metadata model `fuelInlet`)
    cable: { stepId: "73-10-02", contentId: "fuel.line.carb-inlet", name: "Selang bahan bakar", terminal: [0.055, 0.05], to: "fuel" },
  },
];

export const partDef = (assetId: string): PartDef => {
  const def = PARTS.find((p) => p.assetId === assetId);
  if (!def) throw new Error(`Part tidak dikenal: ${assetId}`);
  return def;
};

/** Semua langkah yang dikerjakan pemain di hanggar (pasang part + sambung kabel terminal). */
export const PLAYABLE_STEP_IDS: readonly string[] = PARTS.flatMap((p) => [p.stepId, ...(p.cable ? [p.cable.stepId] : [])]);
