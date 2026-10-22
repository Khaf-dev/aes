import type {
  AssemblyLog,
  Defect,
  DefectKind,
  PerformedAction,
  Range,
  StepRecord,
  StepSpec,
} from "./types.ts";

interface Recorded {
  readonly record: StepRecord;
  readonly firstIndex: number;
  readonly lastIndex: number;
}

function indexRecords(log: AssemblyLog): Map<string, Recorded> {
  const byStep = new Map<string, Recorded>();
  log.records.forEach((record, index) => {
    const known = byStep.get(record.stepId);
    byStep.set(record.stepId, {
      record,
      firstIndex: known?.firstIndex ?? index,
      lastIndex: index,
    });
  });
  return byStep;
}

function nthPerformed<K extends PerformedAction["kind"]>(
  record: StepRecord,
  kind: K,
  n: number,
): Extract<PerformedAction, { kind: K }> | undefined {
  return record.performed.filter(
    (p): p is Extract<PerformedAction, { kind: K }> => p.kind === kind,
  )[n];
}

function formatRange(range: Range, unit: string): string {
  return `${range[0]}–${range[1]} ${unit}`;
}

/**
 * Membandingkan log perakitan dengan spesifikasi langkah. Hasilnya daftar
 * defect yang "tersembunyi" sampai tes dijalankan. Fungsi murni.
 */
export function detectDefects(steps: readonly StepSpec[], log: AssemblyLog): Defect[] {
  const recorded = indexRecords(log);
  const defects: Defect[] = [];

  for (const step of steps) {
    const entry = recorded.get(step.id);
    if (entry === undefined) {
      defects.push({ stepId: step.id, kind: "missing", detail: "Langkah tidak dikerjakan", signedOff: false });
      continue;
    }

    const { record, lastIndex } = entry;
    const add = (kind: DefectKind, detail: string) =>
      defects.push({ stepId: step.id, kind, detail, signedOff: record.signedOff });

    const notReady = step.requires.filter((req) => {
      const prerequisite = recorded.get(req);
      return prerequisite === undefined || prerequisite.firstIndex > lastIndex;
    });
    if (notReady.length > 0) {
      add("wrongOrder", `Dikerjakan sebelum langkah ${notReady.join(", ")} selesai`);
    }

    const used = new Map<PerformedAction["kind"], number>();
    const next = <K extends PerformedAction["kind"]>(kind: K) => {
      const n = used.get(kind) ?? 0;
      used.set(kind, n + 1);
      return nthPerformed(record, kind, n);
    };

    for (const spec of step.actions) {
      switch (spec.kind) {
        case "install": {
          const done = next("install");
          if (done === undefined) add("missing", "Part belum dipasang");
          else if (done.partId !== step.partId) {
            add("wrongPart", `Part terpasang ${done.partId}, seharusnya ${step.partId}`);
          }
          break;
        }
        case "torque": {
          // Satu aksi torsi per langkah (dijaga validasi konten), dinilai per pengencang.
          const count = spec.fasteners ?? 1;
          const torqued = record.performed.filter(
            (p): p is Extract<PerformedAction, { kind: "torque" }> => p.kind === "torque",
          );
          for (let fastener = 1; fastener <= count; fastener++) {
            const label = count > 1 ? `Mur #${fastener}: ` : "";
            const done = torqued.findLast((p) => (p.fastener ?? 1) === fastener);
            if (done === undefined) add("underTorque", `${label}Torsi tidak diterapkan`);
            else if (spec.range !== null && done.value < spec.range[0]) {
              add("underTorque", `${label}Torsi ${done.value} ${spec.unit} di bawah ${formatRange(spec.range, spec.unit)}`);
            } else if (spec.range !== null && done.value > spec.range[1]) {
              add("overTorque", `${label}Torsi ${done.value} ${spec.unit} di atas ${formatRange(spec.range, spec.unit)}`);
            }
          }
          break;
        }
        case "safetyWire": {
          const done = next("safetyWire");
          if (done === undefined) add("noLock", "Safety wire tidak dipasang");
          else if (done.positiveTension === false) add("noLock", "Safety wire menarik ke arah mengendur");
          break;
        }
        case "adjust": {
          const done = next("adjust");
          if (done === undefined) add("misadjusted", `Setelan ${spec.what} tidak dilakukan`);
          else if (spec.range !== null && (done.value < spec.range[0] || done.value > spec.range[1])) {
            add(
              "misadjusted",
              `Setelan ${spec.what} ${done.value} ${spec.unit} di luar ${formatRange(spec.range, spec.unit)}`,
            );
          }
          break;
        }
        case "connect": {
          if (next("connect") === undefined) add("missing", `Belum disambungkan ke ${spec.to}`);
          break;
        }
        case "inspect": {
          // Inspeksi yang dilewati tidak merusak apa pun secara fisik.
          next("inspect");
          break;
        }
      }
    }
  }

  for (const { tool, stepId } of log.toolsOut ?? []) {
    defects.push({
      stepId,
      kind: "fod",
      detail: `${tool} tidak kembali ke shadow board`,
      signedOff: recorded.get(stepId)?.record.signedOff ?? false,
    });
  }

  return defects;
}
