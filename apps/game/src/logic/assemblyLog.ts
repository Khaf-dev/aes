/**
 * Jembatan mode rakit -> sim-core: keadaan fisik rakitan diterjemahkan jadi StepRecord.
 * Record dibangun ulang dari keadaan terkini (sim-core memakai record terakhir per langkah sebagai hasil akhir).
 */
import { validateContentPack } from "@aes/content";
import ata74 from "@aes/content/data/packs/ata-74.json";
import ata80 from "@aes/content/data/packs/ata-80.json";
import { detectDefects, type AssemblyLog, type Defect, type PerformedAction, type StepRecord, type StepSpec } from "@aes/sim-core";
import { PARTS, type PartDef } from "../data/parts.ts";
import type { RakitState } from "./rakit.ts";

const packs = [ata74, ata80].map((data) => {
  const pack = validateContentPack(data);
  if (!pack.ok) throw new Error(`Paket konten tidak valid:\n${pack.errors.join("\n")}`);
  return pack.value;
});

/** Langkah perakitan dari data konten untuk part yang ada di mode rakit. */
export const STEPS: readonly StepSpec[] = packs.flatMap((p) => p.steps).filter((s) => PARTS.some((p) => p.stepId === s.id));

export function stepRecord(part: PartDef, s: RakitState): StepRecord {
  const performed: PerformedAction[] = [];
  if (s.parts[part.assetId] === "installed") performed.push({ kind: "install", partId: part.contentId });
  (s.nuts[part.assetId] ?? []).forEach((nut, i) => {
    if (nut.installed && nut.torque !== null) performed.push({ kind: "torque", value: nut.torque, fastener: i + 1 });
  });
  // Sign-off task card belum ada di irisan ini.
  return { stepId: part.stepId, performed, signedOff: false };
}

export function assemblyLog(s: RakitState): AssemblyLog {
  // Part yang masih di meja = langkahnya belum dikerjakan (tanpa record).
  return { records: PARTS.filter((p) => s.parts[p.assetId] !== "staged").map((p) => stepRecord(p, s)) };
}

/** Defect tersembunyi yang akan muncul saat tes. Tidak ditampilkan ke pemain di mode rakit. */
export const hiddenDefects = (s: RakitState): Defect[] => detectDefects(STEPS, assemblyLog(s));
