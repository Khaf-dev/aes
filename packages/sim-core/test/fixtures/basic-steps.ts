import type { AssemblyLog, PerformedAction, StepRecord, StepSpec } from "../../src/index.ts";

/**
 * Langkah perakitan yang memasang sambungan di jaringan `basicElectrical`.
 * Rentang torsi dan hambatan efek di sini ILUSTRASI untuk tes logika.
 */
export function basicSteps(): StepSpec[] {
  return [
    {
      id: "24-30-01",
      title: "Pasang baterai",
      partId: "ele.battery",
      requires: [],
      actions: [{ kind: "install" }, { kind: "inspect" }],
      effects: { missing: [{ kind: "missing", linkId: "w.battery-relay" }] },
    },
    {
      id: "24-30-02",
      title: "Sambungkan kabel baterai ke relay baterai",
      partId: "ele.cable.battery-relay",
      requires: ["24-30-01"],
      actions: [
        { kind: "install" },
        { kind: "torque", unit: "in-lb", range: [8, 10] },
        { kind: "inspect" },
      ],
      effects: {
        missing: [{ kind: "missing", linkId: "w.battery-relay" }],
        underTorque: [{ kind: "addedResistance", linkId: "w.battery-relay", ohms: 0.05 }],
      },
    },
    {
      id: "24-30-03",
      title: "Sambungkan kabel bus ke relay starter",
      partId: "ele.cable.bus-starter",
      requires: ["24-30-01"],
      actions: [{ kind: "install" }, { kind: "torque", unit: "in-lb", range: [8, 10] }],
      effects: {
        missing: [{ kind: "missing", linkId: "w.bus-starter-relay" }],
        underTorque: [{ kind: "addedResistance", linkId: "w.bus-starter-relay", ohms: 0.05 }],
      },
    },
    {
      id: "74-10-01",
      title: "Pasang magneto kiri",
      partId: "ign.magneto.left",
      requires: [],
      actions: [
        { kind: "install" },
        { kind: "torque", unit: "in-lb", range: [8, 10] },
        { kind: "safetyWire" },
        { kind: "adjust", what: "timing", unit: "deg", range: [24, 26] },
      ],
    },
  ];
}

/** Aksi sempurna untuk satu spesifikasi aksi. */
function ideal(step: StepSpec): PerformedAction[] {
  return step.actions.flatMap((spec): PerformedAction[] => {
    switch (spec.kind) {
      case "install":
        return [{ kind: "install", partId: step.partId }];
      case "torque": {
        const value = spec.range === null ? 1 : (spec.range[0] + spec.range[1]) / 2;
        return Array.from({ length: spec.fasteners ?? 1 }, (_, i) => ({ kind: "torque", value, fastener: i + 1 }));
      }
      case "adjust":
        return [{ kind: "adjust", value: spec.range === null ? 1 : (spec.range[0] + spec.range[1]) / 2 }];
      default:
        return [{ kind: spec.kind }];
    }
  });
}

/** Log perakitan sempurna, urut sesuai daftar langkah, semua di-sign-off. */
export function idealLog(steps: readonly StepSpec[]): AssemblyLog {
  return {
    records: steps.map((step): StepRecord => ({ stepId: step.id, performed: ideal(step), signedOff: true })),
  };
}

/** Ganti record satu langkah di log (dipakai untuk mensimulasikan kesalahan). */
export function withRecord(log: AssemblyLog, record: StepRecord): AssemblyLog {
  return { records: log.records.map((r) => (r.stepId === record.stepId ? record : r)) };
}
