/**
 * Tes darat: keadaan rakitan di hanggar → sim-core runTest → lembar laporan investigasi untuk pemain.
 * Langkah yang belum bisa dirakit di hanggar (ATA 24: baterai & kabel) dianggap dikerjakan dengan benar
 * oleh shift sebelumnya, jadi hasil tes murni dari pekerjaan pemain.
 */
import { runTest, runUp, type Defect, type DefectKind, type MagResult, type PerformedAction, type StepRecord, type StepSpec } from "@aes/sim-core";
import { PLAYABLE_STEP_IDS } from "../data/parts.ts";
import { AIRCRAFT, assemblyLog } from "./assemblyLog.ts";
import type { RakitState } from "./rakit.ts";

/** Sistem yang belum dimodelkan sim-core: dilaporkan jujur sebagai tidak diuji. */
const UNTESTED = [
  "Timing magneto belum diuji (alat timing belum ada); setelan timing tidak dinilai.",
  "Kekencangan dudukan magneto dan starter tidak terlihat di run-up singkat. Klem magneto yang kendor bisa membuat flange aus sampai magneto lepas (FAA SAIB NE-08-26R3).",
];
const MAG_RESULT_TEXT: Record<MagResult, string> = {
  normal: "RPM turun sedikit, mesin tetap halus",
  noDrop: "RPM tidak turun sama sekali",
  rough: "mesin kasar / hampir mati",
};

const DEFECT_TEXT: Record<DefectKind, string> = {
  missing: "tidak dikerjakan / part tidak terpasang",
  wrongOrder: "dikerjakan sebelum prasyaratnya selesai",
  underTorque: "torsi kurang",
  overTorque: "torsi berlebih",
  noLock: "pengaman (safety wire) tidak terpasang dengan benar",
  wrongPart: "part salah",
  misadjusted: "setelan meleset",
  fod: "alat tertinggal di area kerja (FOD)",
};
const REASON_TEXT = { missing: "tidak tersambung", highResistance: "hambatan berlebih", switchOpen: "saklar terbuka" } as const;

/** Pekerjaan shift sebelumnya: semua aksi dikerjakan seperti spesifikasi dan task card ditandatangani. */
function priorShiftRecord(step: StepSpec): StepRecord {
  const performed = step.actions.flatMap((a): PerformedAction[] => {
    // Nilai torsi/setelan tanpa rentang bersumber tidak dinilai sim-core, jadi angkanya tidak berarti.
    const value = "range" in a && a.range !== null ? (a.range[0] + a.range[1]) / 2 : 0;
    switch (a.kind) {
      case "install": return [{ kind: "install", partId: step.partId }];
      case "torque": return Array.from({ length: a.fasteners ?? 1 }, (_, i) => ({ kind: "torque", value, fastener: i + 1 }));
      case "adjust": return [{ kind: "adjust", value }];
      default: return [{ kind: a.kind }];
    }
  });
  return { stepId: step.id, performed, signedOff: true };
}

interface Clue { readonly id: string; readonly title: string; readonly defect: string; readonly signedOff: boolean }

export interface TestSheet {
  readonly scenario: string;
  readonly passed: boolean;
  readonly fod: readonly { readonly tool: string; readonly where: string }[];
  /** Start mesin dan mag check. Hasil kualitatif: batas penurunan RPM berbeda tiap pesawat. */
  readonly runUp: {
    readonly started: boolean;
    readonly magCheck: readonly { readonly position: string; readonly result: string; readonly ok: boolean }[];
    readonly offCheck: string | null;
    readonly findings: readonly { readonly title: string; readonly step: Clue | null }[];
  };
  readonly consumers: readonly { readonly label: string; readonly ok: boolean; readonly voltage: number }[];
  readonly findings: readonly {
    readonly consumer: string;
    readonly symptom: string;
    /** Penelusuran dari konsumen ke hulu, berupa label node. */
    readonly trace: readonly string[];
    readonly rootCause: string | null;
    readonly step: Clue | null;
  }[];
  readonly untested: readonly string[];
}

/** Alat di luar shadow board saat tes dimulai, dengan langkah tempat alat itu terakhir dipakai. */
export type ToolsOut = readonly { readonly tool: string; readonly stepId: string }[];

export function runGroundTest(s: RakitState, toolsOut: ToolsOut = []): TestSheet {
  const scenario = AIRCRAFT.scenarios.find((x) => x.id === "ground-power-up");
  if (!scenario) throw new Error("Skenario ground-power-up tidak ada di data konten");
  const playable = new Set(PLAYABLE_STEP_IDS);
  const prior = AIRCRAFT.steps.filter((step) => !playable.has(step.id)).map(priorShiftRecord);
  const report = runTest({
    design: AIRCRAFT.network,
    steps: AIRCRAFT.steps,
    log: { records: [...prior, ...assemblyLog(s).records], toolsOut },
    scenario,
  });

  const label = (id: string) => AIRCRAFT.network.nodes.find((n) => n.id === id)?.label ?? id;
  const clue = (d: Defect | null): Clue | null => {
    const step = d ? AIRCRAFT.steps.find((x) => x.id === d.stepId) : undefined;
    return d && step ? { id: step.id, title: step.title, defect: `${DEFECT_TEXT[d.kind]} (${d.detail})`, signedOff: d.signedOff } : null;
  };

  const starterOk = report.consumers.some((c) => c.consumerId === "load.starter" && c.status === "ok");
  const magnetos = AIRCRAFT.ignition.magnetos;
  const ign = runUp(magnetos, report.defects, starterOk);
  const magLabel = (id: string) => magnetos.find((m) => m.id === id)?.label ?? id;

  return {
    scenario: `${scenario.label} + mag check`,
    passed: report.passed && ign.started && ign.findings.length === 0 && toolsOut.length === 0,
    // Alat tertinggal: tes tetap jalan, tapi pemeriksaan pasca-tes menemukannya di area mesin
    fod: report.defects.filter((d) => d.kind === "fod").map((d) => {
      const step = AIRCRAFT.steps.find((x) => x.id === d.stepId);
      const tool = toolsOut.find((t) => t.stepId === d.stepId && d.detail.startsWith(t.tool))?.tool ?? "Alat";
      return { tool, where: step ? `${step.id} (${step.title})` : d.stepId };
    }),
    runUp: {
      started: ign.started,
      magCheck: ign.magCheck.map((c) => ({
        position: `Kunci di ${magLabel(c.magnetoId).toLowerCase()} saja`,
        result: MAG_RESULT_TEXT[c.result],
        ok: c.result === "normal",
      })),
      offCheck: ign.offCheck === null ? null
        : ign.offCheck === "stops" ? "Kunci OFF saat idle: mesin mati (normal)" : "Kunci OFF saat idle: mesin TETAP HIDUP",
      findings: ign.findings.map((f) => ({
        title: f.problem === "notFiring"
          ? `${magLabel(f.magnetoId)} tidak menyala`
          : `${magLabel(f.magnetoId)} tidak bisa dimatikan: P-lead tidak meng-ground magneto ("magneto panas")`,
        step: clue(f.cause),
      })),
    },
    consumers: report.consumers
      .filter((c) => scenario.mustOperate.includes(c.consumerId))
      .map((c) => ({ label: label(c.consumerId), ok: c.status === "ok", voltage: c.voltage })),
    findings: report.findings.map((f) => {
      const state = report.consumers.find((c) => c.consumerId === f.consumerId);
      return {
        consumer: label(f.consumerId),
        symptom: f.diagnosis.status === "unpowered"
          ? "tidak mendapat listrik"
          : `tegangan turun ke ${(state?.voltage ?? 0).toFixed(1)} V saat bekerja`,
        trace: f.diagnosis.trace.map(label),
        rootCause: f.diagnosis.rootCause ? `${f.diagnosis.rootCause.label}: ${REASON_TEXT[f.diagnosis.rootCause.reason]}` : null,
        step: clue(f.cause),
      };
    }),
    untested: UNTESTED,
  };
}
