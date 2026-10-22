import { describe, expect, it } from "vitest";
import { beginPull, clampSetting, openSession, release, tick, type PullState } from "../src/logic/clickWrench.ts";
import { assemblyLog, checklist, handbookEntryFor, handbookTopics, hiddenDefects, STEPS } from "../src/logic/assemblyLog.ts";
import { runGroundTest } from "../src/logic/groundTest.ts";
import {
  cutWire, initialRakit, install, installNut, installWire, pickUp, putBack, removeNut, signOff, stage, toggleCheck, toggleCable, torqueNut,
} from "../src/logic/rakit.ts";
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
    expect(stage(s, MAG, false)).toBe("install");
    s = install(pickUp(s, MAG).state, MAG).state;
    expect(stage(s, MAG, false)).toBe("nuts");
    s = installNut(installNut(s, MAG, 0).state, MAG, 1).state;
    expect(stage(s, MAG, false)).toBe("torque");
    s = torqueNut(torqueNut(s, MAG, 0, 60, { setting: 60, feel: "klik" }), MAG, 1, 60, { setting: 60, feel: "klik" });
    expect(stage(s, MAG, true)).toBe("wire");
    expect(stage(s, MAG, false)).toBe("cable");
    s = toggleCable(s, MAG).state;
    expect(stage(s, MAG, false)).toBe("signoff");
    expect(stage(signOff(s, "74-10-01", 5), MAG, false)).toBe("signoff"); // task card P-lead belum
    expect(stage(signOff(signOff(s, "74-10-01", 5), "74-10-03", 2), MAG, false)).toBe("done");
    expect(pickUp(s, MAG).toast?.bad).toBe(true); // P-lead masih tersambung
    expect(putBack(s).state).toBe(s);
  });

  it("safety wire: mur terikat tidak bisa dilepas/dipasang ulang sampai kawat dipotong", () => {
    let s = install(pickUp(initialRakit(), MAG).state, MAG).state;
    expect(installWire(s, MAG, 0, 1, true).toast?.bad).toBe(true); // mur belum ada
    s = installNut(installNut(s, MAG, 0).state, MAG, 1).state;
    s = installWire(s, MAG, 0, 1, false).state;
    expect(s.wires[MAG]).toEqual([{ a: 0, b: 1, positive: false }]);
    expect(removeNut(s, MAG, 1).state).toBe(s);
    expect(installWire(s, MAG, 1, 0, true).state).toBe(s);
    s = cutWire(s, MAG, 1).state;
    expect(s.wires[MAG]).toEqual([]);
    expect(removeNut(s, MAG, 1).state.nuts[MAG]?.[1]?.installed).toBe(false);
  });

  it("checklist dicentang bebas sampai ditandatangani, lalu terkunci", () => {
    let s = toggleCheck(initialRakit(), "74-10-01", 1, 5);
    expect(s.signoff["74-10-01"]?.checks).toEqual([false, true, false, false, false]);
    s = signOff(s, "74-10-01", 5);
    expect(toggleCheck(s, "74-10-01", 0, 5)).toBe(s);
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
    expect(hiddenDefects(initialRakit()).map((d) => `${d.stepId} ${d.kind}`)).toEqual([
      "24-30-05 missing", "24-30-06 missing", "74-10-01 missing", "74-10-02 missing", "74-10-03 missing", "74-10-04 missing", "80-10-01 missing",
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

describe("task card", () => {
  it("checklist diturunkan dari aksi di data konten, nilai tanpa sumber tidak dikarang", () => {
    expect(checklist("74-10-01")).toEqual([
      "Inspeksi magneto kiri sebelum dipasang",
      "Pasang magneto kiri di pad",
      "Kencangkan 2 mur pengikat · torsi: belum ada nilai bersumber",
      "Atur timing · belum ada nilai bersumber",
      "Inspeksi akhir pekerjaan",
    ]);
    expect(checklist("74-10-03")).toEqual(["Sambungkan kabel p-lead kiri ke magneto kiri", "Inspeksi akhir pekerjaan"]);
  });

  it("task card ditandatangani tanpa dikerjakan tetap tercatat, dengan defect-nya", () => {
    const s = signOff(initialRakit(), "80-10-01", 4);
    expect(hiddenDefects(s).filter((d) => d.stepId === "80-10-01")).toMatchObject([
      { kind: "missing", detail: "Part belum dipasang", signedOff: true },
      { kind: "underTorque", signedOff: true },
      { kind: "underTorque", signedOff: true },
    ]);
  });

  it("safety wire terbalik ikut ke log sebagai tegangan negatif", () => {
    let s = install(pickUp(initialRakit(), MAG).state, MAG).state;
    s = installWire(installNut(installNut(s, MAG, 0).state, MAG, 1).state, MAG, 0, 1, false).state;
    expect(assemblyLog(s).records[0]?.performed).toContainEqual({ kind: "safetyWire", positiveTension: false });
  });
});

describe("tes darat", () => {
  it("starter tidak dipasang: tes gagal, akar masalah menunjuk task card 80-10-01", () => {
    const sheet = runGroundTest(initialRakit());
    expect(sheet.passed).toBe(false);
    expect(sheet.findings).toMatchObject([
      { consumer: "Starter", symptom: "tidak mendapat listrik", step: { id: "80-10-01", signedOff: false } },
    ]);
    expect(sheet.runUp.started).toBe(false);
    expect(sheet.untested.join(" ")).toMatch(/Timing/);
    expect(sheet.untested.join(" ")).toMatch(/Pengisian alternator belum diuji/);
  });

  const STR = "acc.starter.mk1", MAG_R = "acc.magneto.mk1.r", ALT = "acc.alternator.mk1";
  const mount = (s: ReturnType<typeof initialRakit>, part: string) => install(pickUp(s, part).state, part).state;
  /** Semua part terpasang dan semua kabel tersambung, kecuali yang disebut. */
  const assembled = (skip: { alternator?: boolean; altCable?: boolean } = {}) => {
    let s = mount(mount(mount(initialRakit(), STR), MAG), MAG_R);
    s = toggleCable(toggleCable(s, MAG).state, MAG_R).state;
    if (!skip.alternator) s = mount(s, ALT);
    if (!skip.alternator && !skip.altCable) s = toggleCable(s, ALT).state;
    return s;
  };

  it("semua part + kabel terpasang: lulus, mag check normal, alternator mengisi", () => {
    const sheet = runGroundTest(assembled());
    expect(sheet.passed).toBe(true);
    expect(sheet.runUp.magCheck.every((c) => c.ok)).toBe(true);
    expect(sheet.runUp.offCheck).toMatch(/mati/);
    expect(sheet.consumers).toContainEqual(expect.objectContaining({ label: "Pengisian baterai (ammeter) · mesin hidup", ok: true }));
  });

  it("alternator tidak dipasang: pengisian gagal, ammeter minus, clue 24-30-05", () => {
    const sheet = runGroundTest(assembled({ alternator: true }));
    expect(sheet.passed).toBe(false);
    expect(sheet.findings).toMatchObject([{ consumer: "Pengisian baterai (ammeter)", symptom: expect.stringMatching(/minus/), step: { id: "24-30-05" } }]);
  });

  it("kabel output alternator lupa disambung: clue 24-30-06", () => {
    const sheet = runGroundTest(assembled({ altCable: true }));
    expect(sheet.findings).toMatchObject([{ rootCause: "Kabel output alternator: tidak tersambung", step: { id: "24-30-06" } }]);
  });

  it("P-lead kanan lupa disambung: magneto kanan panas, mesin tetap hidup saat kunci OFF", () => {
    const s = toggleCable(assembled(), MAG_R).state;
    const sheet = runGroundTest(s);
    expect(sheet.passed).toBe(false);
    expect(sheet.runUp.offCheck).toMatch(/TETAP HIDUP/);
    expect(sheet.runUp.findings).toMatchObject([{ step: { id: "74-10-04" } }]);
  });
});

describe("FOD", () => {
  it("kunci torsi tidak dikembalikan: tes gagal dengan temuan FOD di langkah terakhir dipakai", () => {
    const sheet = runGroundTest(initialRakit(), [{ tool: "Kunci torsi", stepId: "74-10-01" }]);
    expect(sheet.passed).toBe(false);
    expect(sheet.fod).toEqual([{ tool: "Kunci torsi", where: "74-10-01 (Pasang magneto kiri)" }]);
  });
});

describe("buku panduan", () => {
  const log = { setting: 60, feel: "klik" } as const;
  it("membuka halaman sesuai konteks: dokumen, part di tangan, lalu langkah berikutnya", () => {
    let s = initialRakit();
    expect(handbookEntryFor(s, MAG, null)).toBe("hb.magneto.left");
    expect(handbookEntryFor(s, MAG, "74-10-04")).toBe("hb.p-lead.right");
    expect(handbookEntryFor(pickUp(s, "acc.starter.mk1").state, MAG, null)).toBe("hb.starter");
    s = install(pickUp(s, MAG).state, MAG).state;
    s = installNut(installNut(s, MAG, 0).state, MAG, 1).state;
    s = torqueNut(torqueNut(s, MAG, 0, 60, log), MAG, 1, 60, log);
    expect(handbookEntryFor(s, MAG, null)).toBe("hb.p-lead.left");
  });

  it("topik umum mengikuti aksi di langkah", () => {
    const ids = handbookTopics("74-10-01").map((e) => e.id);
    expect(ids).toContain("hb.torque");
    expect(ids).not.toContain("hb.safety-wire");
  });
});
