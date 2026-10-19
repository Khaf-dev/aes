import { runTest, type AssemblyLog } from "@aes/sim-core";
import { describe, expect, it } from "vitest";
import { validateAircraft, type Aircraft } from "../src/index.ts";
import { idealLog, loadAircraftInput } from "./helpers.ts";

function aircraft(): Aircraft {
  const result = validateAircraft(loadAircraftInput());
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

function groundPowerUp(a: Aircraft) {
  const scenario = a.scenarios.find((s) => s.id === "ground-power-up");
  if (scenario === undefined) throw new Error("skenario ground-power-up tidak ada");
  return scenario;
}

describe("ujung ke ujung: data konten → sim-core", () => {
  it("perakitan sempurna lulus ground power-up", () => {
    const a = aircraft();
    const report = runTest({ design: a.network, steps: a.steps, log: idealLog(a.steps), scenario: groundPowerUp(a) });
    expect(report.passed).toBe(true);
  });

  it("checklist dicentang tapi torsi 24-30-02 dilewati: laporan menunjuk langkah itu", () => {
    const a = aircraft();
    const ideal = idealLog(a.steps);
    const log: AssemblyLog = {
      records: ideal.records.map((r) =>
        r.stepId === "24-30-02" ? { ...r, performed: r.performed.filter((p) => p.kind !== "torque") } : r,
      ),
    };

    const report = runTest({ design: a.network, steps: a.steps, log, scenario: groundPowerUp(a) });

    expect(report.passed).toBe(false);
    expect(report.findings).toMatchObject([
      {
        consumerId: "load.starter",
        diagnosis: {
          status: "undervoltage",
          rootCause: { label: "Kabel baterai ke relay baterai", reason: "highResistance" },
          trace: ["load.starter", "relay.starter", "bus.main", "relay.battery"],
        },
        cause: { stepId: "24-30-02", kind: "underTorque", detail: "Torsi tidak diterapkan", signedOff: true },
      },
    ]);
  });
});
