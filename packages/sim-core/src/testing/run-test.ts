import { detectDefects } from "../assembly/detect.ts";
import type { AssemblyLog, Defect, StepSpec } from "../assembly/types.ts";
import { diagnose, type Diagnosis } from "../network/diagnose.ts";
import { evaluate, type ConsumerState } from "../network/evaluate.ts";
import { applyFaults, setSwitch, type NetworkFault } from "../network/faults.ts";
import type { Network } from "../network/types.ts";

export interface TestScenario {
  readonly id: string;
  readonly label: string;
  /** Posisi saklar saat tes, linkId → tertutup (ON). */
  readonly switches: Readonly<Record<string, boolean>>;
  /** Konsumen yang wajib bekerja supaya tes lulus. */
  readonly mustOperate: readonly string[];
}

export interface AttributedFault {
  readonly fault: NetworkFault;
  readonly defect: Defect;
}

export interface Finding {
  readonly consumerId: string;
  readonly diagnosis: Diagnosis;
  /** Defect perakitan penyebabnya; null bila akar masalah bukan dari perakitan (mis. saklar OFF). */
  readonly cause: Defect | null;
}

export interface TestReport {
  readonly scenarioId: string;
  readonly passed: boolean;
  readonly consumers: readonly ConsumerState[];
  readonly findings: readonly Finding[];
  /**
   * Semua defect yang terdeteksi, termasuk yang belum berdampak di skenario ini.
   * Data internal: jangan ditampilkan langsung ke pemain.
   */
  readonly defects: readonly Defect[];
}

export interface TestInput {
  /** Jaringan sesuai desain, semua sambungan terpasang benar. */
  readonly design: Network;
  readonly steps: readonly StepSpec[];
  readonly log: AssemblyLog;
  readonly scenario: TestScenario;
}

/** Menerjemahkan defect menjadi fault jaringan sesuai `effects` tiap langkah. */
export function faultsFromDefects(
  steps: readonly StepSpec[],
  defects: readonly Defect[],
): AttributedFault[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  return defects.flatMap((defect) =>
    (byId.get(defect.stepId)?.effects?.[defect.kind] ?? []).map((fault) => ({ fault, defect })),
  );
}

/**
 * Rakit → tes → investigasi dalam satu fungsi murni:
 * log perakitan → defect → fault → jaringan aktual → status konsumen → diagnosis,
 * lalu akar masalah dipetakan balik ke langkah perakitan penyebabnya.
 */
export function runTest(input: TestInput): TestReport {
  const { design, steps, log, scenario } = input;

  const defects = detectDefects(steps, log);
  const attributed = faultsFromDefects(steps, defects);

  let network = applyFaults(design, attributed.map((a) => a.fault));
  for (const [linkId, closed] of Object.entries(scenario.switches)) {
    network = setSwitch(network, linkId, closed);
  }

  const findings: Finding[] = [];
  for (const consumerId of scenario.mustOperate) {
    const diagnosis = diagnose(network, consumerId);
    if (diagnosis === null) continue;

    const root = diagnosis.rootCause;
    const cause =
      root === null || root.reason === "switchOpen"
        ? null
        : (attributed.find((a) => a.fault.linkId === root.linkId)?.defect ?? null);
    findings.push({ consumerId, diagnosis, cause });
  }

  return {
    scenarioId: scenario.id,
    passed: findings.length === 0,
    consumers: evaluate(network),
    findings,
    defects,
  };
}
