import type { z } from "zod";
import {
  ContentPackSchema,
  FuelSchema,
  HandbookSchema,
  IgnitionSchema,
  NetworkSchema,
  TestScenarioSchema,
  type AssemblyStep,
  type ContentPack,
  type FuelData,
  type HandbookData,
  type IgnitionData,
  type NetworkData,
  type Part,
  type TestScenarioData,
} from "./schema.ts";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface Aircraft {
  readonly parts: readonly Part[];
  readonly steps: readonly AssemblyStep[];
  readonly network: NetworkData;
  readonly scenarios: readonly TestScenarioData[];
  readonly ignition: IgnitionData;
  readonly fuel: FuelData;
  readonly handbook: HandbookData;
}

function issues(error: z.ZodError, prefix: string): string[] {
  return error.issues.map((i) => `${prefix}${i.path.join(".")}: ${i.message}`);
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function findCycle(steps: readonly AssemblyStep[]): string[] | null {
  const requires = new Map(steps.map((s) => [s.id, s.requires]));
  const state = new Map<string, "visiting" | "done">();

  const visit = (id: string, stack: string[]): string[] | null => {
    const mark = state.get(id);
    if (mark === "done") return null;
    if (mark === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    for (const next of requires.get(id) ?? []) {
      const found = visit(next, [...stack, id]);
      if (found !== null) return found;
    }
    state.set(id, "done");
    return null;
  };

  for (const step of steps) {
    const found = visit(step.id, []);
    if (found !== null) return found;
  }
  return null;
}

/** Aturan semantik untuk part dan langkah (setelah lolos skema). */
function checkPack(pack: ContentPack): string[] {
  const errors: string[] = [];
  const partIds = new Set(pack.parts.map((p) => p.id));
  const stepIds = new Set(pack.steps.map((s) => s.id));

  for (const id of duplicates(pack.parts.map((p) => p.id))) errors.push(`Part duplikat: ${id}`);
  for (const id of duplicates(pack.steps.map((s) => s.id))) errors.push(`Langkah duplikat: ${id}`);

  for (const step of pack.steps) {
    if (!partIds.has(step.partId)) {
      errors.push(`Langkah ${step.id} merujuk part yang tidak ada: ${step.partId}`);
    }
    for (const req of step.requires) {
      if (!stepIds.has(req)) errors.push(`Langkah ${step.id} butuh langkah yang tidak ada: ${req}`);
    }
    if (step.actions.filter((a) => a.kind === "torque").length > 1) {
      errors.push(`Langkah ${step.id}: maksimal satu aksi torsi per langkah (pakai "fasteners" untuk banyak mur)`);
    }
    for (const action of step.actions) {
      if (action.kind !== "torque" && action.kind !== "adjust") continue;
      if (action.range === null) continue;
      if (action.source === null) {
        errors.push(`Langkah ${step.id}: nilai teknis ${action.kind} wajib mencantumkan sumber rujukan`);
      }
      if (action.range[0] > action.range[1]) {
        errors.push(`Langkah ${step.id}: rentang ${action.kind} terbalik (min > max)`);
      }
    }
  }

  const cycle = findCycle(pack.steps);
  if (cycle !== null) errors.push(`Prasyarat berputar: ${cycle.join(" → ")}`);
  return errors;
}

/** Validasi satu paket part + langkah. */
export function validateContentPack(input: unknown): Result<ContentPack> {
  const parsed = ContentPackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: issues(parsed.error, "") };
  const errors = checkPack(parsed.data);
  return errors.length === 0 ? { ok: true, value: parsed.data } : { ok: false, errors };
}

export interface AircraftInput {
  readonly packs: readonly unknown[];
  readonly network: unknown;
  readonly scenarios: readonly unknown[];
  readonly ignition: unknown;
  readonly fuel: unknown;
  readonly handbook: unknown;
}

/**
 * Validasi satu pesawat utuh: semua paket langkah, jaringan, dan skenario tes,
 * termasuk referensi lintas file (efek defect → link jaringan, skenario → saklar & konsumen).
 */
export function validateAircraft(input: AircraftInput): Result<Aircraft> {
  const errors: string[] = [];
  const parts: Part[] = [];
  const steps: AssemblyStep[] = [];

  input.packs.forEach((raw, i) => {
    const parsed = ContentPackSchema.safeParse(raw);
    if (!parsed.success) errors.push(...issues(parsed.error, `pack[${i}].`));
    else {
      parts.push(...parsed.data.parts);
      steps.push(...parsed.data.steps);
    }
  });
  errors.push(...checkPack({ parts, steps }));

  const network = NetworkSchema.safeParse(input.network);
  if (!network.success) {
    errors.push(...issues(network.error, "network."));
    return { ok: false, errors };
  }
  const { nodes, links } = network.data;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const linkById = new Map(links.map((l) => [l.id, l]));

  for (const id of duplicates(nodes.map((n) => n.id))) errors.push(`Node duplikat: ${id}`);
  for (const id of duplicates(links.map((l) => l.id))) errors.push(`Link duplikat: ${id}`);
  for (const link of links) {
    for (const end of [link.from, link.to]) {
      if (!nodeById.has(end)) errors.push(`Link ${link.id} merujuk node yang tidak ada: ${end}`);
    }
  }

  for (const step of steps) {
    for (const [kind, faults] of Object.entries(step.effects ?? {})) {
      for (const fault of faults ?? []) {
        const link = linkById.get(fault.linkId);
        if (link === undefined) {
          errors.push(`Langkah ${step.id} efek ${kind} merujuk link yang tidak ada: ${fault.linkId}`);
        } else if (fault.kind === "missing" && link.kind !== "wire") {
          errors.push(`Langkah ${step.id} efek ${kind}: fault missing hanya untuk kabel, bukan ${link.id}`);
        }
      }
    }
  }

  const scenarios: TestScenarioData[] = [];
  input.scenarios.forEach((raw, i) => {
    const parsed = TestScenarioSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...issues(parsed.error, `scenario[${i}].`));
      return;
    }
    const scenario = parsed.data;
    scenarios.push(scenario);
    for (const linkId of Object.keys(scenario.switches)) {
      if (linkById.get(linkId)?.kind !== "switch") {
        errors.push(`Skenario ${scenario.id}: ${linkId} bukan saklar di jaringan`);
      }
    }
    for (const nodeId of scenario.mustOperate) {
      if (nodeById.get(nodeId)?.kind !== "consumer") {
        errors.push(`Skenario ${scenario.id}: ${nodeId} bukan konsumen di jaringan`);
      }
    }
  });
  for (const id of duplicates(scenarios.map((s) => s.id))) errors.push(`Skenario duplikat: ${id}`);

  const ignition = IgnitionSchema.safeParse(input.ignition);
  if (!ignition.success) {
    errors.push(...issues(ignition.error, "ignition."));
    return { ok: false, errors };
  }
  const stepIds = new Set(steps.map((s) => s.id));
  for (const m of ignition.data.magnetos) {
    for (const ref of [m.installStep, m.pLeadStep]) {
      if (!stepIds.has(ref)) errors.push(`Magneto ${m.id} merujuk langkah yang tidak ada: ${ref}`);
    }
  }
  for (const id of duplicates(ignition.data.magnetos.map((m) => m.id))) errors.push(`Magneto duplikat: ${id}`);

  const fuel = FuelSchema.safeParse(input.fuel);
  if (!fuel.success) {
    errors.push(...issues(fuel.error, "fuel."));
    return { ok: false, errors };
  }
  for (const ref of fuel.data.steps) {
    if (!stepIds.has(ref)) errors.push(`Pasokan bahan bakar merujuk langkah yang tidak ada: ${ref}`);
  }

  const handbook = HandbookSchema.safeParse(input.handbook);
  if (!handbook.success) {
    errors.push(...issues(handbook.error, "handbook."));
    return { ok: false, errors };
  }
  const sourceIds = new Set(handbook.data.sources.map((s) => s.id));
  for (const id of duplicates(handbook.data.sources.map((s) => s.id))) errors.push(`Sumber handbook duplikat: ${id}`);
  for (const id of duplicates(handbook.data.entries.map((e) => e.id))) errors.push(`Entri handbook duplikat: ${id}`);
  for (const id of duplicates(handbook.data.entries.flatMap((e) => (e.stepId ? [e.stepId] : [])))) {
    errors.push(`Langkah ${id} punya lebih dari satu entri handbook`);
  }
  for (const entry of handbook.data.entries) {
    if (entry.stepId !== undefined && !stepIds.has(entry.stepId)) {
      errors.push(`Entri handbook ${entry.id} merujuk langkah yang tidak ada: ${entry.stepId}`);
    }
    for (const c of [...entry.about, ...entry.notes]) {
      if (!sourceIds.has(c.source)) errors.push(`Entri handbook ${entry.id} merujuk sumber yang tidak ada: ${c.source}`);
    }
  }

  return errors.length === 0
    ? { ok: true, value: { parts, steps, network: network.data, scenarios, ignition: ignition.data, fuel: fuel.data, handbook: handbook.data } }
    : { ok: false, errors };
}
