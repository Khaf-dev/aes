import { evaluateConsumer, getNode } from "./evaluate.ts";
import { supplyPathsTo } from "./paths.ts";
import { isConducting, type Link, type Network } from "./types.ts";

export type RootCauseReason = "missing" | "switchOpen" | "highResistance";

export interface RootCause {
  readonly linkId: string;
  readonly label: string;
  readonly reason: RootCauseReason;
}

export interface Diagnosis {
  readonly consumerId: string;
  readonly status: "undervoltage" | "unpowered";
  /** null bila jaringan tidak punya jalur sama sekali, atau tidak ada link yang abnormal. */
  readonly rootCause: RootCause | null;
  /**
   * Node yang dilewati penelusuran, dari konsumen ke hulu, berhenti di node
   * tempat link bermasalah ditemukan. Dipakai UI sebagai "Starter ← Relay ← Bus ← …".
   */
  readonly trace: readonly string[];
}

/** Menelusuri jalur dari konsumen ke hulu sampai `isCulprit` terpenuhi. */
function traceUpstream(
  consumerId: string,
  pathFromSource: readonly Link[],
  isCulprit: (link: Link) => boolean,
): { culprit: Link | null; trace: string[] } {
  const trace = [consumerId];
  for (const link of [...pathFromSource].reverse()) {
    if (isCulprit(link)) return { culprit: link, trace };
    trace.push(link.from);
  }
  return { culprit: null, trace: [consumerId] };
}

/**
 * Mencari akar masalah konsumen yang tidak bekerja. Mengembalikan null bila
 * konsumen bekerja normal.
 */
export function diagnose(network: Network, consumerId: string): Diagnosis | null {
  const consumer = getNode(network, consumerId);
  if (consumer.kind !== "consumer") throw new Error(`Bukan konsumen: ${consumerId}`);

  const state = evaluateConsumer(network, consumer);
  if (state.status === "ok") return null;

  if (state.status === "unpowered") {
    // Pakai topologi terpasang seharusnya (abaikan status putus/terbuka),
    // lalu cari link pertama dari sisi konsumen yang tidak menghantar.
    const designed = supplyPathsTo(network, consumerId, () => true)
      .toSorted((a, b) => a.resistance - b.resistance)[0];
    if (designed === undefined) {
      return { consumerId, status: "unpowered", rootCause: null, trace: [consumerId] };
    }
    const { culprit, trace } = traceUpstream(consumerId, designed.links, (l) => !isConducting(l));
    return {
      consumerId,
      status: "unpowered",
      rootCause:
        culprit === null
          ? null
          : {
              linkId: culprit.id,
              label: culprit.label,
              reason: culprit.kind === "wire" ? "missing" : "switchOpen",
            },
      trace,
    };
  }

  // Undervoltage: link dengan kelebihan hambatan terbesar di jalur suplai.
  const pathLinks = state.pathLinkIds.map((id) => {
    const link = network.links.find((l) => l.id === id);
    if (link === undefined) throw new Error(`Link tidak dikenal: ${id}`);
    return link;
  });
  const worst = pathLinks
    .filter((l) => l.resistance > l.nominalResistance)
    .toSorted((a, b) => b.resistance - b.nominalResistance - (a.resistance - a.nominalResistance))[0];

  if (worst === undefined) {
    return { consumerId, status: "undervoltage", rootCause: null, trace: [consumerId] };
  }
  const { trace } = traceUpstream(consumerId, pathLinks, (l) => l.id === worst.id);
  return {
    consumerId,
    status: "undervoltage",
    rootCause: { linkId: worst.id, label: worst.label, reason: "highResistance" },
    trace,
  };
}
