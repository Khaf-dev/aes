import { z } from "zod";

const Id = z.string().min(1);

/** [min, max]. Kebenaran min ≤ max dicek di validate.ts. */
const RangeSchema = z.tuple([z.number().positive(), z.number().positive()]);

/**
 * Nilai teknis (torsi, sudut timing) WAJIB punya sumber rujukan.
 * `range: null` berarti belum dirujuk: game tidak boleh mengarang angka.
 */
const SourcedRange = {
  range: RangeSchema.nullable(),
  source: z.string().min(1).nullable(),
};

export const PartSchema = z.object({
  /** Contoh: "ign.magneto.left" */
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
  name: z.string().min(1),
  ataChapter: z.number().int().min(5).max(99),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  model: z.string().endsWith(".glb").optional(),
});

export const ActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("install") }),
  z.object({
    kind: z.literal("torque"),
    unit: z.literal("in-lb"),
    ...SourcedRange,
    /** Jumlah mur/baut yang ditorsi di langkah ini (default 1). */
    fasteners: z.number().int().min(1).optional(),
  }),
  z.object({ kind: z.literal("safetyWire") }),
  z.object({
    kind: z.literal("adjust"),
    what: z.string().min(1),
    unit: z.enum(["in-lb", "deg"]),
    ...SourcedRange,
  }),
  z.object({ kind: z.literal("connect"), to: Id }),
  z.object({ kind: z.literal("inspect") }),
]);

export const NetworkFaultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing"), linkId: Id }),
  z.object({ kind: z.literal("addedResistance"), linkId: Id, ohms: z.number().positive() }),
]);

const Faults = z.array(NetworkFaultSchema).optional();

/** Efek tiap jenis defect: parameter gameplay, bukan data teknis. */
export const StepEffectsSchema = z
  .object({
    missing: Faults,
    wrongOrder: Faults,
    underTorque: Faults,
    overTorque: Faults,
    noLock: Faults,
    wrongPart: Faults,
    misadjusted: Faults,
  })
  .strict();

export const AssemblyStepSchema = z.object({
  /** Penomoran gaya ATA: bab-seksi-urutan, contoh "74-10-01" */
  id: z.string().regex(/^\d{2}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  partId: Id,
  requires: z.array(Id),
  actions: z.array(ActionSchema).min(1),
  effects: StepEffectsSchema.optional(),
});

export const ContentPackSchema = z.object({
  parts: z.array(PartSchema),
  steps: z.array(AssemblyStepSchema),
});

const NodeSchema = z.discriminatedUnion("kind", [
  z.object({ id: Id, kind: z.literal("source"), label: z.string().min(1), voltage: z.number().positive() }),
  z.object({ id: Id, kind: z.literal("conductor"), label: z.string().min(1) }),
  z.object({
    id: Id,
    kind: z.literal("consumer"),
    label: z.string().min(1),
    currentDraw: z.number().nonnegative(),
    minVoltage: z.number().positive(),
  }),
]);

const LinkBase = {
  id: Id,
  label: z.string().min(1),
  from: Id,
  to: Id,
  nominalResistance: z.number().nonnegative(),
};

const LinkSchema = z.discriminatedUnion("kind", [
  z.object({ ...LinkBase, kind: z.literal("wire") }),
  z.object({ ...LinkBase, kind: z.literal("switch") }),
]);

/**
 * Jaringan sesuai desain. Penulis data cukup mengisi hambatan nominal; jaringan
 * desain selalu terpasang lengkap, saklar mulai OFF, dan hambatan aktual = nominal.
 */
export const NetworkSchema = z
  .object({
    id: Id,
    description: z.string().optional(),
    nodes: z.array(NodeSchema).min(1),
    links: z.array(LinkSchema),
  })
  .transform(({ nodes, links }) => ({
    nodes,
    links: links.map((l) =>
      l.kind === "wire"
        ? { ...l, resistance: l.nominalResistance, installed: true }
        : { ...l, resistance: l.nominalResistance, closed: false },
    ),
  }));

export const TestScenarioSchema = z.object({
  id: Id,
  label: z.string().min(1),
  switches: z.record(z.string(), z.boolean()),
  mustOperate: z.array(Id).min(1),
});

export type Part = z.infer<typeof PartSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type AssemblyStep = z.infer<typeof AssemblyStepSchema>;
export type ContentPack = z.infer<typeof ContentPackSchema>;
export type NetworkData = z.output<typeof NetworkSchema>;
export type TestScenarioData = z.infer<typeof TestScenarioSchema>;

/** Sistem pengapian: tiap magneto dikaitkan ke langkah pasang dan langkah sambung P-lead-nya. */
export const IgnitionSchema = z.object({
  magnetos: z.array(z.object({ id: Id, label: z.string().min(1), installStep: Id, pLeadStep: Id })).min(1),
});
export type IgnitionData = z.infer<typeof IgnitionSchema>;

/** Kalimat handbook: wajib menunjuk sumber dan lokasinya (halaman/paragraf), tidak boleh dikarang. */
const Cited = { text: z.string().min(1), source: Id, ref: z.string().min(1) };

/**
 * Buku panduan engineer. Prosedur dan nilai torsi TIDAK ditulis di sini: dirender dari langkah di paket konten.
 * Di sini hanya penjelasan dan catatan WARNING/CAUTION/NOTE, masing-masing dengan rujukan.
 */
export const HandbookSchema = z.object({
  sources: z.array(z.object({ id: Id, title: z.string().min(1), url: z.url() })).min(1),
  entries: z.array(
    z
      .object({
        id: Id,
        title: z.string().min(1),
        /** Halaman untuk satu langkah (task card)... */
        stepId: Id.optional(),
        /** ...atau topik umum yang ikut tampil di setiap langkah yang punya aksi ini. */
        action: z.enum(["install", "torque", "safetyWire", "adjust", "connect", "inspect"]).optional(),
        about: z.array(z.object(Cited)).min(1),
        notes: z.array(z.object({ level: z.enum(["WARNING", "CAUTION", "NOTE"]), ...Cited })),
      })
      .refine((e) => (e.stepId === undefined) !== (e.action === undefined), "isi tepat satu: stepId atau action"),
  ),
});
export type HandbookData = z.infer<typeof HandbookSchema>;
