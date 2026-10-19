import type { Link, Network } from "./types.ts";

export interface SupplyPath {
  readonly sourceId: string;
  /** Urut dari sumber ke target. */
  readonly links: readonly Link[];
  readonly resistance: number;
}

/**
 * Dijkstra mundur dari target: menghitung hambatan total terkecil dari setiap
 * node hulu menuju target, hanya lewat link yang lolos `canTraverse`.
 * Graf pesawat kecil (puluhan node), jadi versi O(n²) sudah cukup dan mudah dibaca.
 */
export function supplyPathsTo(
  network: Network,
  targetId: string,
  canTraverse: (link: Link) => boolean,
): SupplyPath[] {
  const distance = new Map<string, number>([[targetId, 0]]);
  const nextLink = new Map<string, Link>();
  const settled = new Set<string>();

  for (;;) {
    let current: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [nodeId, d] of distance) {
      if (!settled.has(nodeId) && d < best) {
        best = d;
        current = nodeId;
      }
    }
    if (current === undefined) break;
    settled.add(current);

    for (const link of network.links) {
      if (link.to !== current || !canTraverse(link)) continue;
      const candidate = best + link.resistance;
      const known = distance.get(link.from);
      if (known === undefined || candidate < known) {
        distance.set(link.from, candidate);
        nextLink.set(link.from, link);
      }
    }
  }

  const paths: SupplyPath[] = [];
  for (const node of network.nodes) {
    if (node.kind !== "source") continue;
    const resistance = distance.get(node.id);
    if (resistance === undefined) continue;

    const links: Link[] = [];
    let cursor = node.id;
    while (cursor !== targetId) {
      const link = nextLink.get(cursor);
      if (link === undefined) break;
      links.push(link);
      cursor = link.to;
    }
    paths.push({ sourceId: node.id, links, resistance });
  }
  return paths;
}
