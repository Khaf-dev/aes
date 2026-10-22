import { runTest, type AssemblyLog } from "@aes/sim-core";
import { describe, expect, it } from "vitest";
import { validateAircraft, type Aircraft } from "../src/index.ts";
import { idealLog, loadAircraftInput } from "./helpers.ts";

function aircraft(): Aircraft {
  const result = validateAircraft(loadAircraftInput());
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}

function scenarioOf(a: Aircraft, id: string) {
  const scenario = a.scenarios.find((s) => s.id === id);
  if (scenario === undefined) throw new Error(`skenario ${id} tidak ada`);
  return scenario;
}
const groundPowerUp = (a: Aircraft) => scenarioOf(a, "ground-power-up");

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

describe("mesin hidup: pengisian alternator", () => {
  it("alternator terpasang benar: baterai terisi, bus dipasok alternator", () => {
    const a = aircraft();
    const report = runTest({ design: a.network, steps: a.steps, log: idealLog(a.steps), scenario: scenarioOf(a, "engine-run") });
    expect(report.passed).toBe(true);
    const radio = report.consumers.find((c) => c.consumerId === "load.radio")!;
    expect(radio.voltage).toBeGreaterThan(24); // dipasok alternator 28 V, bukan baterai 24 V
  });

  it("kabel output tidak disambung: pengisian gagal dan laporan menunjuk 24-30-06", () => {
    const a = aircraft();
    const log: AssemblyLog = { records: idealLog(a.steps).records.filter((r) => r.stepId !== "24-30-06") };
    const report = runTest({ design: a.network, steps: a.steps, log, scenario: scenarioOf(a, "engine-run") });
    expect(report.passed).toBe(false);
    expect(report.findings).toMatchObject([
      {
        consumerId: "chg.battery",
        diagnosis: { status: "unpowered", rootCause: { label: "Kabel output alternator", reason: "missing" } },
        cause: { stepId: "24-30-06", kind: "missing" },
      },
    ]);
  });

  it("ground power-up tidak terpengaruh alternator (mesin belum hidup)", () => {
    const a = aircraft();
    const log: AssemblyLog = { records: idealLog(a.steps).records.filter((r) => !["24-30-05", "24-30-06"].includes(r.stepId)) };
    expect(runTest({ design: a.network, steps: a.steps, log, scenario: groundPowerUp(a) }).passed).toBe(true);
  });
});
