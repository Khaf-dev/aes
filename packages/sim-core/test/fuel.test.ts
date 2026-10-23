import { describe, expect, it } from "vitest";
import { fuelCheck, runUp, type Defect } from "../src/index.ts";

const supply = { steps: ["73-10-01", "73-10-02"] };
const missing = (stepId: string): Defect => ({ stepId, kind: "missing", detail: "Langkah tidak dikerjakan", signedOff: false });
const mags = [{ id: "mag.left", label: "Magneto kiri", installStep: "74-10-01", pLeadStep: "74-10-03" }];

describe("pasokan bahan bakar", () => {
  it("semua langkah dikerjakan: bahan bakar sampai", () => {
    expect(fuelCheck(supply, [])).toEqual({ delivered: true, cause: null });
  });
  it("karburator dan selang sama-sama tidak dipasang: akar masalah karburator", () => {
    expect(fuelCheck(supply, [missing("73-10-02"), missing("73-10-01")]).cause?.stepId).toBe("73-10-01");
  });
  it("torsi kurang tidak memutus pasokan (kebocoran belum dimodelkan)", () => {
    expect(fuelCheck(supply, [{ ...missing("73-10-01"), kind: "underTorque" }]).delivered).toBe(true);
  });
  it("tanpa bahan bakar mesin tidak hidup walau starter dan magneto baik", () => {
    expect(runUp(mags, [], true, false).started).toBe(false);
    expect(runUp(mags, [], true).started).toBe(true);
  });
});
