/**
 * Resource network: semua sistem pesawat dimodelkan sebagai graf berarah
 * sumber → penghantar → konsumen. Saat ini baru aliran listrik DC.
 *
 * Satuan: volt (V), ampere (A), ohm (Ω).
 *
 * Model listrik MVP sengaja disederhanakan: tegangan di konsumen dihitung dari
 * jalur suplai terbaik, V = Vsumber − I × Rjalur. Beban lain yang berbagi jalur
 * belum ikut dihitung.
 */

export interface SourceNode {
  readonly id: string;
  readonly kind: "source";
  readonly label: string;
  readonly voltage: number;
}

export interface ConductorNode {
  readonly id: string;
  readonly kind: "conductor";
  readonly label: string;
}

export interface ConsumerNode {
  readonly id: string;
  readonly kind: "consumer";
  readonly label: string;
  /** Arus yang ditarik saat beroperasi (A). */
  readonly currentDraw: number;
  /** Tegangan minimum supaya konsumen bekerja (V). */
  readonly minVoltage: number;
}

export type NetworkNode = SourceNode | ConductorNode | ConsumerNode;

interface LinkBase {
  readonly id: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  /** Hambatan sambungan yang terpasang benar (Ω). */
  readonly nominalResistance: number;
  /** Hambatan aktual setelah efek defect (Ω). */
  readonly resistance: number;
}

/** Kabel, terminal, atau sambungan fisik yang dipasang engineer. */
export interface WireLink extends LinkBase {
  readonly kind: "wire";
  readonly installed: boolean;
}

/** Saklar atau relay yang posisinya diatur saat operasi. */
export interface SwitchLink extends LinkBase {
  readonly kind: "switch";
  readonly closed: boolean;
}

export type Link = WireLink | SwitchLink;

export interface Network {
  readonly nodes: readonly NetworkNode[];
  readonly links: readonly Link[];
}

export function isConducting(link: Link): boolean {
  return link.kind === "wire" ? link.installed : link.closed;
}
