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
  z.object({ kind: z.literal("torque"), unit: z.literal("in-lb"), ...SourcedRange }),
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
