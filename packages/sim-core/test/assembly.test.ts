import { describe, expect, it } from "vitest";
import { detectDefects, type AssemblyLog } from "../src/index.ts";
import { basicSteps, idealLog, withRecord } from "./fixtures/basic-steps.ts";

const steps = basicSteps();

describe("detectDefects", () => {
  it("perakitan sempurna tidak menghasilkan defect", () => {
    expect(detectDefects(steps, idealLog(steps))).toEqual([]);
  });

  it("langkah yang tidak dikerjakan tercatat missing", () => {
    const log: AssemblyLog = { records: idealLog(steps).records.filter((r) => r.stepId !== "24-30-03") };
    expect(detectDefects(steps, log)).toEqual([
      { stepId: "24-30-03", kind: "missing", detail: "Langkah tidak dikerjakan", signedOff: false },
    ]);
  });

  it("checklist di-sign-off tapi torsi tidak diterapkan", () => {
    const log = withRecord(idealLog(steps), {
      stepId: "24-30-02",
      performed: [{ kind: "install", partId: "ele.cable.battery-relay" }, { kind: "inspect" }],
      signedOff: true,
    });
    expect(detectDefects(steps, log)).toEqual([
      { stepId: "24-30-02", kind: "underTorque", detail: "Torsi tidak diterapkan", signedOff: true, fastener: 1 },
    ]);
  });

  it("torsi di bawah dan di atas rentang", () => {
    const record = (value: number) => ({
      stepId: "24-30-02",
      performed: [
        { kind: "install", partId: "ele.cable.battery-relay" } as const,
        { kind: "torque", value } as const,
      ],
      signedOff: false,
    });
    expect(detectDefects(steps, withRecord(idealLog(steps), record(5)))).toMatchObject([
      { kind: "underTorque", detail: "Torsi 5 in-lb di bawah 8–10 in-lb" },
    ]);
    expect(detectDefects(steps, withRecord(idealLog(steps), record(14)))).toMatchObject([
      { kind: "overTorque", detail: "Torsi 14 in-lb di atas 8–10 in-lb" },
    ]);
  });

  it("torsi dinilai per pengencang, torsi ulang terakhir yang berlaku", () => {
    const twoNuts = steps.map((s) =>
      s.id === "24-30-02"
        ? { ...s, actions: s.actions.map((a) => (a.kind === "torque" ? { ...a, fasteners: 2 } : a)) }
        : s,
    );
    const record = (...torques: { value: number; fastener: number }[]) => ({
      stepId: "24-30-02",
      performed: [
        { kind: "install", partId: "ele.cable.battery-relay" } as const,
        ...torques.map((t) => ({ kind: "torque", ...t }) as const),
      ],
      signedOff: true,
    });
    expect(detectDefects(twoNuts, withRecord(idealLog(twoNuts), record({ value: 9, fastener: 1 })))).toMatchObject([
      { kind: "underTorque", detail: "Mur #2: Torsi tidak diterapkan" },
    ]);
    const reworked = record({ value: 9, fastener: 1 }, { value: 5, fastener: 2 }, { value: 14, fastener: 2 });
    expect(detectDefects(twoNuts, withRecord(idealLog(twoNuts), reworked))).toMatchObject([
      { kind: "overTorque", detail: "Mur #2: Torsi 14 in-lb di atas 8–10 in-lb" },
    ]);
    expect(detectDefects(twoNuts, idealLog(twoNuts))).toEqual([]);
  });

  it("safety wire yang menarik ke arah mengendur tetap tercatat noLock", () => {
    const ideal = idealLog(steps).records.find((r) => r.stepId === "74-10-01")!;
    const record = (positiveTension: boolean) => ({
      ...ideal,
      performed: ideal.performed.map((p) => (p.kind === "safetyWire" ? { kind: "safetyWire" as const, positiveTension } : p)),
    });
    expect(detectDefects(steps, withRecord(idealLog(steps), record(false)))).toMatchObject([
      { stepId: "74-10-01", kind: "noLock", detail: "Safety wire menarik ke arah mengendur" },
    ]);
    expect(detectDefects(steps, withRecord(idealLog(steps), record(true)))).toEqual([]);
  });

  it("alat yang tidak kembali ke shadow board tercatat sebagai FOD di langkah terakhir dipakai", () => {
    const log = { ...idealLog(steps), toolsOut: [{ tool: "Kunci torsi", stepId: "74-10-01" }] };
    expect(detectDefects(steps, log)).toEqual([
      { stepId: "74-10-01", kind: "fod", detail: "Kunci torsi tidak kembali ke shadow board", signedOff: true },
    ]);
  });

  it("batas rentang dihitung inklusif", () => {
    const log = withRecord(idealLog(steps), {
      stepId: "24-30-02",
      performed: [{ kind: "install", partId: "ele.cable.battery-relay" }, { kind: "torque", value: 10 }],
      signedOff: true,
    });
    expect(detectDefects(steps, log)).toEqual([]);
  });

  it("salah part, safety wire lupa, dan setelan meleset", () => {
    const log = withRecord(idealLog(steps), {
      stepId: "74-10-01",
      performed: [
        { kind: "install", partId: "ign.magneto.right" },
        { kind: "torque", value: 9 },
        { kind: "adjust", value: 30 },
      ],
      signedOff: true,
    });
    expect(detectDefects(steps, log).map((d) => d.kind)).toEqual(["wrongPart", "noLock", "misadjusted"]);
  });

  it("salah urutan: dikerjakan sebelum prasyaratnya", () => {
    const [battery, cable, ...rest] = idealLog(steps).records;
    if (battery === undefined || cable === undefined) throw new Error("fixture berubah");
    const log: AssemblyLog = { records: [cable, battery, ...rest] };
    expect(detectDefects(steps, log)).toEqual([
      {
        stepId: "24-30-02",
        kind: "wrongOrder",
        detail: "Dikerjakan sebelum langkah 24-30-01 selesai",
        signedOff: true,
      },
    ]);
  });

  it("rework: record terakhir menggantikan yang lama", () => {
    const sloppy = {
      stepId: "24-30-02",
      performed: [{ kind: "install", partId: "ele.cable.battery-relay" } as const],
      signedOff: true,
    };
    const fixed = idealLog(steps).records.find((r) => r.stepId === "24-30-02");
    if (fixed === undefined) throw new Error("fixture berubah");
    const log: AssemblyLog = { records: [...idealLog(steps).records, sloppy, fixed] };
    expect(detectDefects(steps, log)).toEqual([]);
  });
});
