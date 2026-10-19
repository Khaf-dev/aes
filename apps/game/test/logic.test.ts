import { describe, expect, it } from "vitest";
import { beginPull, clampSetting, openSession, release, tick, type PullState } from "../src/logic/clickWrench.ts";
import { assemblyLog, hiddenDefects, STEPS } from "../src/logic/assemblyLog.ts";
import { initialRakit, install, installNut, pickUp, putBack, removeNut, stage, torqueNut } from "../src/logic/rakit.ts";
import { PARTS } from "../src/data/parts.ts";

const MAG = "acc.magneto.mk1";

/** Tahan gagang selama `seconds` dengan langkah 50 ms. */
function hold(s: PullState, seconds: number, setting: number): PullState {
  let state = beginPull(s);
  for (let t = 0; t < seconds - 1e-9; t += 0.05) state = tick(state, 0.05, true, setting);
  return state;
}

describe("kunci torsi tipe klik", () => {
  it("klik tepat di setelan bila dilepas segera setelah klik", () => {
    const s = hold(openSession(null), 1.3 + 1.5, 60); // run-down (+1 langkah pembulatan), lalu 40 in-lb/dtk
    expect(release(s, 60).result).toEqual({ kind: "torqued", value: 60, feel: "klik" });
  });

  it("terus ditarik setelah klik = over-torque", () => {
    const seated = openSession(60);
    const { result } = release(hold(seated, 2.5, 60), 60);
    expect(result).toMatchObject({ kind: "torqued", feel: "lewat klik" });
    expect(result.kind === "torqued" && result.value).toBeGreaterThan(60);
  });

  it("dilepas sebelum mur duduk tidak mengubah torsi", () => {
    expect(release(hold(openSession(null), 0.6, 60), 60).result).toEqual({ kind: "notSeated" });
  });

  it("dilepas sebelum klik tercatat tanpa klik", () => {
    const { result } = release(hold(openSession(null), 1.2 + 0.5, 100), 100);
    expect(result).toMatchObject({ kind: "torqued", feel: "tanpa klik" });
  });

  it("tarikan yang tidak melewati kencangan sebelumnya tidak menggerakkan mur", () => {
    expect(release(hold(openSession(100), 0.5, 40), 40).result).toEqual({ kind: "noMove" });
  });

  it("setelan dijepit di rentang alat 40–200 in-lb", () => {
    expect([clampSetting(10), clampSetting(120), clampSetting(250)]).toEqual([40, 120, 200]);
  });
});

describe("aturan fisik mode rakit", () => {
  it("part yang masih diikat mur tidak bisa diangkat", () => {
    let s = install(pickUp(initialRakit(), MAG).state, MAG).state;
    s = installNut(s, MAG, 0).state;
    const blocked = pickUp(s, MAG);
    expect(blocked.state).toBe(s);
    expect(blocked.toast).toMatchObject({ bad: true, text: expect.stringContaining("1 mur") });
    s = removeNut(s, MAG, 0).state;
    expect(pickUp(s, MAG).state.held).toBe(MAG);
  });

  it("mur hanya bisa dipasang setelah part duduk di pad", () => {
    const out = installNut(initialRakit(), MAG, 0);
    expect(out.state.nuts[MAG]?.[0]?.installed).toBe(false);
    expect(out.toast?.bad).toBe(true);
  });

  it("melepas mur menghapus torsinya", () => {
    let s = install(pickUp(initialRakit(), MAG).state, MAG).state;
    s = torqueNut(installNut(s, MAG, 0).state, MAG, 0, 60, { setting: 60, feel: "klik" });
    expect(removeNut(s, MAG, 0).state.nuts[MAG]?.[0]).toEqual({ installed: false, torque: null, log: null });
  });

  it("tahap task card mengikuti keadaan fisik", () => {
    let s = initialRakit();
    expect(stage(s, MAG)).toBe(0);
    s = install(pickUp(s, MAG).state, MAG).state;
    expect(stage(s, MAG)).toBe(1);
    s = installNut(installNut(s, MAG, 0).state, MAG, 1).state;
    expect(stage(s, MAG)).toBe(2);
    s = torqueNut(torqueNut(s, MAG, 0, 60, { setting: 60, feel: "klik" }), MAG, 1, 60, { setting: 60, feel: "klik" });
    expect(stage(s, MAG)).toBe(3);
    expect(putBack(s).state).toBe(s);
  });
});

describe("jembatan ke sim-core", () => {
  it("jumlah stud di pad sama dengan jumlah pengencang di data konten", () => {
    for (const part of PARTS) {
      const torque = STEPS.find((s) => s.id === part.stepId)?.actions.find((a) => a.kind === "torque");
      expect(torque && torque.kind === "torque" ? (torque.fasteners ?? 1) : 0).toBe(part.pad.studs.length);
    }
  });

  it("part di meja = langkah belum dikerjakan; mur tanpa torsi = under-torque per mur", () => {
    expect(hiddenDefects(initialRakit())).toMatchObject([
      { stepId: "74-10-01", kind: "missing" },
      { stepId: "80-10-01", kind: "missing" },
    ]);
    let s = install(pickUp(initialRakit(), MAG).state, MAG).state;
    s = installNut(installNut(s, MAG, 0).state, MAG, 1).state;
    s = torqueNut(s, MAG, 0, 60, { setting: 60, feel: "klik" });
    expect(assemblyLog(s).records[0]?.performed).toEqual([
      { kind: "install", partId: "ign.magneto.left" },
      { kind: "torque", value: 60, fastener: 1 },
    ]);
    const torqueDefects = hiddenDefects(s).filter((d) => d.stepId === "74-10-01" && d.kind === "underTorque");
    expect(torqueDefects.map((d) => d.detail)).toEqual(["Mur #2: Torsi tidak diterapkan"]);
  });
});
