import type { Link, Network } from "./types.ts";

/**
 * Efek kesalahan rakit pada jaringan. Pemetaan dari defect perakitan
 * (langkah + jenis kesalahan) ke fault ini nanti diatur oleh data konten.
 */
export type NetworkFault =
  | { readonly kind: "missing"; readonly linkId: string }
  | { readonly kind: "addedResistance"; readonly linkId: string; readonly ohms: number };

function requireLink(network: Network, linkId: string): Link {
  const link = network.links.find((l) => l.id === linkId);
  if (link === undefined) throw new Error(`Link tidak dikenal: ${linkId}`);
  return link;
}

/** Mengembalikan jaringan baru; jaringan asli tidak diubah. */
export function applyFaults(network: Network, faults: readonly NetworkFault[]): Network {
  const patched = new Map<string, Link>();

  for (const fault of faults) {
    const link = patched.get(fault.linkId) ?? requireLink(network, fault.linkId);

    switch (fault.kind) {
      case "missing": {
        if (link.kind !== "wire") {
          throw new Error(`Fault "missing" hanya untuk kabel, bukan saklar: ${link.id}`);
        }
        patched.set(link.id, { ...link, installed: false });
        break;
      }
      case "addedResistance": {
        if (!Number.isFinite(fault.ohms) || fault.ohms <= 0) {
          throw new Error(`Hambatan tambahan harus positif: ${fault.ohms} pada ${link.id}`);
        }
        patched.set(link.id, { ...link, resistance: link.resistance + fault.ohms });
        break;
      }
    }
  }

  return {
    nodes: network.nodes,
    links: network.links.map((l) => patched.get(l.id) ?? l),
  };
}

/** Mengatur posisi saklar (input operator saat tes). Mengembalikan jaringan baru. */
export function setSwitch(network: Network, linkId: string, closed: boolean): Network {
  const link = requireLink(network, linkId);
  if (link.kind !== "switch") throw new Error(`Bukan saklar: ${linkId}`);
  return {
    nodes: network.nodes,
    links: network.links.map((l) => (l.id === linkId ? { ...link, closed } : l)),
  };
}
