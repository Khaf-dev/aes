import { describe, expect, it } from "vitest";
import { runTest, type TestScenario } from "../src/index.ts";
import { basicElectrical } from "./fixtures/basic-electrical.ts";
import { basicSteps, idealLog, withRecord } from "./fixtures/basic-steps.ts";

const steps = basicSteps();

const groundPowerUp: TestScenario = {
  id: "ground-power-up",
  label: "Ground power-up dan start",
  switches: { "sw.master": true, "sw.avionics": true },
  mustOperate: ["load.starter", "load.radio"],
};

describe("runTest: rakit → tes → investigasi", () => {
  it("perakitan sempurna lulus tes", () => {
    const report = runTest({ design: basicElectrical(), steps, log: idealLog(steps), scenario: groundPowerUp });
    expect(report.passed).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.defects).toEqual([]);
  });

  it("torsi tidak diterapkan: starter gagal, akar masalah kembali ke langkah 24-30-02", () => {
    const log = withRecord(idealLog(steps), {
      stepId: "24-30-02",
      performed: [{ kind: "install", partId: "ele.cable.battery-relay" }, { kind: "inspect" }],
      signedOff: true,
    });
    const report = runTest({ design: basicElectrical(), steps, log, scenario: groundPowerUp });

    expect(report.passed).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      consumerId: "load.starter",
      diagnosis: {
        status: "undervoltage",
        rootCause: { linkId: "w.battery-relay", reason: "highResistance" },
        trace: ["load.starter", "relay.starter", "bus.main", "relay.battery"],
      },
      cause: { stepId: "24-30-02", kind: "underTorque", signedOff: true },
    });
  });

  it("langkah pemasangan baterai dilewati: semua konsumen mati", () => {
    const log = { records: idealLog(steps).records.filter((r) => r.stepId !== "24-30-01") };
    const report = runTest({ design: basicElectrical(), steps, log, scenario: groundPowerUp });

    expect(report.passed).toBe(false);
    expect(report.findings.map((f) => [f.consumerId, f.cause?.stepId, f.cause?.kind])).toEqual([
      ["load.starter", "24-30-01", "missing"],
      ["load.radio", "24-30-01", "missing"],
    ]);
  });

  it("kabel tidak dipasang karena part prasyaratnya juga tidak dipasang: clue menunjuk prasyarat", () => {
    const log = { records: idealLog(steps).records.filter((r) => r.stepId !== "24-30-01" && r.stepId !== "24-30-03") };
    const report = runTest({ design: basicElectrical(), steps, log, scenario: groundPowerUp });
    const starter = report.findings.find((f) => f.consumerId === "load.starter");
    expect(starter?.diagnosis.rootCause?.linkId).toBe("w.bus-starter-relay"); // penelusuran tetap dari sisi konsumen
    expect(starter?.cause).toMatchObject({ stepId: "24-30-01", kind: "missing" });
  });

  it("saklar OFF saat tes bukan kesalahan perakitan", () => {
    const report = runTest({
      design: basicElectrical(),
      steps,
      log: idealLog(steps),
      scenario: { ...groundPowerUp, switches: { "sw.master": true, "sw.avionics": false } },
    });
    expect(report.findings).toMatchObject([
      { consumerId: "load.radio", diagnosis: { rootCause: { reason: "switchOpen" } }, cause: null },
    ]);
  });

  it("defect tanpa efek di skenario ini tetap tersembunyi (laten)", () => {
    const log = withRecord(idealLog(steps), {
      stepId: "74-10-01",
      performed: [
        { kind: "install", partId: "ign.magneto.left" },
        { kind: "torque", value: 9 },
        { kind: "adjust", value: 25 },
      ],
      signedOff: true,
    });
    const report = runTest({ design: basicElectrical(), steps, log, scenario: groundPowerUp });

    expect(report.passed).toBe(true);
    expect(report.defects).toMatchObject([{ stepId: "74-10-01", kind: "noLock" }]);
  });
});
