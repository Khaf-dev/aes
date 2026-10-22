import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AssemblyLog, PerformedAction, StepSpec } from "@aes/sim-core";
import type { AircraftInput } from "../src/index.ts";

const DATA_DIR = join(import.meta.dirname, "..", "data");

function readJsonDir(dir: string): unknown[] {
  const full = join(DATA_DIR, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .toSorted()
    .map((f) => JSON.parse(readFileSync(join(full, f), "utf8")) as unknown);
}

/** Memuat semua data pesawat dari folder data/. */
export function loadAircraftInput(): AircraftInput {
  const networks = readJsonDir("networks");
  if (networks.length !== 1) throw new Error(`Diharapkan 1 jaringan, ada ${networks.length}`);
  const ignition = readJsonDir("ignition");
  if (ignition.length !== 1) throw new Error(`Diharapkan 1 data pengapian, ada ${ignition.length}`);
  const handbook = readJsonDir("handbook");
  if (handbook.length !== 1) throw new Error(`Diharapkan 1 handbook, ada ${handbook.length}`);
  return { packs: readJsonDir("packs"), network: networks[0], scenarios: readJsonDir("scenarios"), ignition: ignition[0], handbook: handbook[0] };
}

/** Log perakitan sempurna untuk semua langkah, semua di-sign-off. */
export function idealLog(steps: readonly StepSpec[]): AssemblyLog {
  return {
    records: steps.map((step) => ({
      stepId: step.id,
      signedOff: true,
      performed: step.actions.flatMap((spec): PerformedAction[] => {
        const mid = "range" in spec && spec.range !== null ? (spec.range[0] + spec.range[1]) / 2 : 1;
        switch (spec.kind) {
          case "install":
            return [{ kind: "install", partId: step.partId }];
          case "torque":
            return Array.from({ length: spec.fasteners ?? 1 }, (_, i) => ({ kind: "torque", value: mid, fastener: i + 1 }));
          case "adjust":
            return [{ kind: "adjust", value: mid }];
          default:
            return [{ kind: spec.kind }];
        }
      }),
    })),
  };
}
