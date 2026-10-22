import { describe, expect, it } from "vitest";
import { runUp, type MagnetoSpec } from "../src/index.ts";
import type { Defect } from "../src/index.ts";

const MAGS: MagnetoSpec[] = [
  { id: "L", label: "Magneto kiri", installStep: "74-10-01", pLeadStep: "74-10-03" },
  { id: "R", label: "Magneto kanan", installStep: "74-10-02", pLeadStep: "74-10-04" },
];
const missing = (stepId: string): Defect => ({ stepId, kind: "missing", detail: "Langkah tidak dikerjakan", signedOff: false });

describe("run-up dan mag check", () => {
  it("rakitan benar: tiap posisi turun normal, kunci OFF mematikan mesin", () => {
    expect(runUp(MAGS, [], true)).toEqual({
      started: true,
      magCheck: [{ magnetoId: "L", result: "normal" }, { magnetoId: "R", result: "normal" }],
      offCheck: "stops",
      findings: [],
    });
  });

  it("P-lead kanan tidak tersambung: posisi L tidak turun, mesin tetap hidup saat OFF", () => {
    const report = runUp(MAGS, [missing("74-10-04")], true);
    expect(report.magCheck).toEqual([{ magnetoId: "L", result: "noDrop" }, { magnetoId: "R", result: "normal" }]);
    expect(report.offCheck).toBe("keepsRunning");
    expect(report.findings).toMatchObject([{ magnetoId: "R", problem: "notGrounded", cause: { stepId: "74-10-04" } }]);
  });

  it("magneto kiri tidak terpasang: posisi L mesin kasar/mati, posisi R tidak turun", () => {
    const report = runUp(MAGS, [missing("74-10-01")], true);
    expect(report.magCheck).toEqual([{ magnetoId: "L", result: "rough" }, { magnetoId: "R", result: "noDrop" }]);
    expect(report.findings).toMatchObject([{ magnetoId: "L", problem: "notFiring" }]);
  });

  it("tanpa magneto atau tanpa starter mesin tidak hidup", () => {
    expect(runUp(MAGS, [missing("74-10-01"), missing("74-10-02")], true)).toMatchObject({ started: false, magCheck: [], offCheck: null });
    expect(runUp(MAGS, [], false)).toMatchObject({ started: false, findings: [] });
  });
});
