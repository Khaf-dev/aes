import { supplyPathsTo } from "./paths.ts";
import { isConducting, type ConsumerNode, type Network, type NetworkNode } from "./types.ts";

export type ConsumerStatus = "ok" | "undervoltage" | "unpowered";

export interface ConsumerState {
  readonly consumerId: string;
  readonly status: ConsumerStatus;
  /** Tegangan yang sampai ke konsumen saat menarik arus (V). */
  readonly voltage: number;
  /** Link jalur suplai, urut dari sumber ke konsumen. */
  readonly pathLinkIds: readonly string[];
}

export function getNode(network: Network, id: string): NetworkNode {
  const node = network.nodes.find((n) => n.id === id);
  if (node === undefined) throw new Error(`Node tidak dikenal: ${id}`);
  return node;
}

export function evaluateConsumer(network: Network, consumer: ConsumerNode): ConsumerState {
  let best: { voltage: number; linkIds: string[] } | undefined;

  for (const path of supplyPathsTo(network, consumer.id, isConducting)) {
    const source = getNode(network, path.sourceId);
    if (source.kind !== "source") continue;
    const voltage = source.voltage - consumer.currentDraw * path.resistance;
    if (best === undefined || voltage > best.voltage) {
      best = { voltage, linkIds: path.links.map((l) => l.id) };
    }
  }

  if (best === undefined) {
    return { consumerId: consumer.id, status: "unpowered", voltage: 0, pathLinkIds: [] };
  }
  return {
    consumerId: consumer.id,
    status: best.voltage >= consumer.minVoltage ? "ok" : "undervoltage",
    voltage: best.voltage,
    pathLinkIds: best.linkIds,
  };
}

/** Status semua konsumen, urut sesuai urutan node. Fungsi murni dan deterministik. */
export function evaluate(network: Network): ConsumerState[] {
  return network.nodes
    .filter((n): n is ConsumerNode => n.kind === "consumer")
    .map((consumer) => evaluateConsumer(network, consumer));
}
