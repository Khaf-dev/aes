import { describe, expect, it } from "vitest";
import { validateAircraft, validateContentPack } from "../src/index.ts";
import { loadAircraftInput } from "./helpers.ts";

const errorsOf = (result: { ok: boolean; errors?: readonly string[] }) =>
  result.ok ? [] : (result.errors ?? []);

describe("data pesawat di repo", () => {
  it("semua paket, jaringan, dan skenario lolos validasi", () => {
    expect(errorsOf(validateAircraft(loadAircraftInput()))).toEqual([]);
  });
});

const part = { id: "ign.magneto.left", name: "Magneto kiri", ataChapter: 74, tier: 2 };
const step = (id: string, requires: string[] = [], actions: unknown[] = [{ kind: "install" }]) => ({
  id,
  title: "Langkah uji",
  partId: part.id,
  requires,
  actions,
});

describe("validateContentPack", () => {
  it("menolak rentang teknis tanpa sumber", () => {
    const result = validateContentPack({
      parts: [part],
      steps: [step("74-10-01", [], [{ kind: "torque", unit: "in-lb", range: [8, 10], source: null }])],
    });
    expect(errorsOf(result).join("\n")).toMatch(/sumber rujukan/);
  });

  it("menerima nilai yang belum dirujuk (range null)", () => {
    const result = validateContentPack({
      parts: [part],
      steps: [step("74-10-01", [], [{ kind: "torque", unit: "in-lb", range: null, source: null }])],
    });
    expect(result.ok).toBe(true);
  });

  it("menolak dua aksi torsi dalam satu langkah", () => {
    const torque = { kind: "torque", unit: "in-lb", range: null, source: null };
    const result = validateContentPack({ parts: [part], steps: [step("74-10-01", [], [torque, torque])] });
    expect(errorsOf(result).join("\n")).toMatch(/fasteners/);
  });

  it("menolak rentang terbalik", () => {
    const result = validateContentPack({
      parts: [part],
      steps: [step("74-10-01", [], [{ kind: "torque", unit: "in-lb", range: [10, 8], source: "uji" }])],
    });
    expect(errorsOf(result).join("\n")).toMatch(/terbalik/);
  });

  it("menolak prasyarat yang tidak ada dan yang berputar", () => {
    expect(validateContentPack({ parts: [part], steps: [step("74-10-01", ["74-99-99"])] }).ok).toBe(false);
    const cyclic = validateContentPack({
      parts: [part],
      steps: [step("74-10-01", ["74-10-02"]), step("74-10-02", ["74-10-01"])],
    });
    expect(errorsOf(cyclic).join("\n")).toMatch(/berputar/);
  });
});

describe("validateAircraft: referensi lintas file", () => {
  const base = loadAircraftInput();

  it("menolak efek yang menunjuk link tidak ada", () => {
    const pack = {
      parts: [part],
      steps: [{ ...step("74-10-01"), effects: { missing: [{ kind: "missing", linkId: "w.hantu" }] } }],
    };
    const result = validateAircraft({ ...base, packs: [pack] });
    expect(errorsOf(result).join("\n")).toMatch(/link yang tidak ada: w\.hantu/);
  });

  it("menolak fault missing pada saklar", () => {
    const pack = {
      parts: [part],
      steps: [{ ...step("74-10-01"), effects: { missing: [{ kind: "missing", linkId: "sw.master" }] } }],
    };
    expect(errorsOf(validateAircraft({ ...base, packs: [pack] })).join("\n")).toMatch(/hanya untuk kabel/);
  });

  it("menolak skenario yang menunjuk saklar atau konsumen tidak ada", () => {
    const scenario = {
      id: "uji",
      label: "Uji",
      switches: { "w.radio": true },
      mustOperate: ["bus.main"],
    };
    const errors = errorsOf(validateAircraft({ ...base, scenarios: [scenario] })).join("\n");
    expect(errors).toMatch(/w\.radio bukan saklar/);
    expect(errors).toMatch(/bus\.main bukan konsumen/);
  });
});

describe("validateAircraft · pengapian", () => {
  it("menolak magneto yang merujuk langkah tidak ada", () => {
    const input = loadAircraftInput();
    const result = validateAircraft({
      ...input,
      ignition: { magnetos: [{ id: "mag.x", label: "Magneto X", installStep: "74-99-01", pLeadStep: "74-10-03" }] },
    });
    expect(errorsOf(result).join("\n")).toMatch(/74-99-01/);
  });
});
