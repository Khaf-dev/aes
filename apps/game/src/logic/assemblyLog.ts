/**
 * Jembatan mode rakit -> sim-core: keadaan fisik rakitan diterjemahkan jadi StepRecord.
 * Record dibangun ulang dari keadaan terkini (sim-core memakai record terakhir per langkah sebagai hasil akhir).
 */
import { validateAircraft } from "@aes/content";
import network from "@aes/content/data/networks/aes-1-electrical.json";
import ata24 from "@aes/content/data/packs/ata-24.json";
import ata74 from "@aes/content/data/packs/ata-74.json";
import ata80 from "@aes/content/data/packs/ata-80.json";
import groundPowerUp from "@aes/content/data/scenarios/ground-power-up.json";
import ignition from "@aes/content/data/ignition/aes-1-ignition.json";
import { detectDefects, type AssemblyLog, type Defect, type PerformedAction, type StepRecord, type StepSpec } from "@aes/sim-core";
import { PARTS, PLAYABLE_STEP_IDS, type PartDef } from "../data/parts.ts";
import type { RakitState } from "./rakit.ts";

const aircraft = validateAircraft({ packs: [ata24, ata74, ata80], network, scenarios: [groundPowerUp], ignition });
if (!aircraft.ok) throw new Error(`Data pesawat tidak valid:\n${aircraft.errors.join("\n")}`);
/** Data pesawat AES-1 yang sudah divalidasi: semua langkah, jaringan listrik, skenario tes. */
export const AIRCRAFT = aircraft.value;

/** Langkah perakitan dari data konten untuk part yang ada di mode rakit. */
export const STEPS: readonly StepSpec[] = AIRCRAFT.steps.filter((s) => PLAYABLE_STEP_IDS.includes(s.id));

export function stepRecord(part: PartDef, s: RakitState): StepRecord {
  const performed: PerformedAction[] = [];
  if (s.parts[part.assetId] === "installed") performed.push({ kind: "install", partId: part.contentId });
  (s.nuts[part.assetId] ?? []).forEach((nut, i) => {
    if (nut.installed && nut.torque !== null) performed.push({ kind: "torque", value: nut.torque, fastener: i + 1 });
  });
  const wires = s.wires[part.assetId] ?? [];
  if (wires.length > 0) performed.push({ kind: "safetyWire", positiveTension: wires.every((w) => w.positive) });
  return { stepId: part.stepId, performed, signedOff: s.signoff[part.stepId]?.signed ?? false };
}

const stepOf = (stepId: string) => {
  const step = STEPS.find((s) => s.id === stepId);
  if (!step) throw new Error(`Langkah tidak ada di data konten: ${stepId}`);
  return step;
};

export const requiresWire = (stepId: string) => stepOf(stepId).actions.some((a) => a.kind === "safetyWire");

const valueText = (range: readonly [number, number] | null, unit: string) =>
  range ? `${range[0]}–${range[1]} ${unit}` : "belum ada nilai bersumber, lihat handbook";

const partName = (contentId: string) => (AIRCRAFT.parts.find((p) => p.id === contentId)?.name ?? contentId).toLowerCase();

/** Baris checklist task card, diturunkan dari aksi langkah di data konten (bukan ditulis manual). */
export function checklist(stepId: string): string[] {
  const step = stepOf(stepId);
  const name = partName(step.partId);
  const work = step.actions.findIndex((a) => a.kind === "install" || a.kind === "connect");
  return step.actions.map((a, i) => {
    switch (a.kind) {
      case "inspect": return i < work ? `Inspeksi ${name} sebelum dipasang` : "Inspeksi akhir pekerjaan";
      case "install": return `Pasang ${name} di pad`;
      case "torque": return `Kencangkan ${a.fasteners ?? 1} mur pengikat · torsi: ${valueText(a.range, a.unit)}`;
      case "safetyWire": return "Pasang safety wire (lilitan harus cenderung mengencangkan)";
      case "adjust": return `Atur ${a.what} · ${valueText(a.range, a.unit)}`;
      case "connect": return `Sambungkan ${name} ke ${partName(a.to)}`;
    }
  });
}

function pLeadRecord(part: PartDef, s: RakitState): StepRecord | null {
  if (!part.pLead) return null;
  const connected = s.pLeads[part.assetId] ?? false;
  const signedOff = s.signoff[part.pLead.stepId]?.signed ?? false;
  if (!connected && !signedOff) return null;
  return { stepId: part.pLead.stepId, performed: connected ? [{ kind: "connect" }] : [], signedOff };
}

export function assemblyLog(s: RakitState): AssemblyLog {
  // Part yang masih di meja = langkahnya belum dikerjakan (tanpa record).
  // Kecuali task card yang ditandatangani tanpa dikerjakan tetap tercatat (engineer ceroboh).
  const parts = PARTS.filter((p) => s.parts[p.assetId] !== "staged" || s.signoff[p.stepId]?.signed).map((p) => stepRecord(p, s));
  const pLeads = PARTS.map((p) => pLeadRecord(p, s)).filter((r) => r !== null);
  return { records: [...parts, ...pLeads] };
}

/** Defect tersembunyi yang akan muncul saat tes. Tidak ditampilkan ke pemain di mode rakit. */
export const hiddenDefects = (s: RakitState): Defect[] => detectDefects(STEPS, assemblyLog(s));
