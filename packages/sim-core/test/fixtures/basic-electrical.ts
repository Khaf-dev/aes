import type { Network } from "../../src/index.ts";

/**
 * Jaringan listrik DC sederhana untuk tes: baterai → relay baterai → (master switch)
 * → bus utama → starter, dan bus utama → (saklar avionik) → bus avionik → radio.
 *
 * PERHATIAN: semua angka di sini ilustrasi untuk menguji logika, BUKAN data
 * pesawat nyata. Nilai sungguhan masuk lewat paket content, lengkap dengan sumbernya.
 */
export function basicElectrical(): Network {
  return {
    nodes: [
      { id: "src.battery", kind: "source", label: "Baterai", voltage: 24 },
      { id: "relay.battery", kind: "conductor", label: "Relay baterai" },
      { id: "bus.main", kind: "conductor", label: "Bus utama" },
      { id: "relay.starter", kind: "conductor", label: "Relay starter" },
      { id: "load.starter", kind: "consumer", label: "Starter", currentDraw: 150, minVoltage: 18 },
      { id: "bus.avionics", kind: "conductor", label: "Bus avionik" },
      { id: "load.radio", kind: "consumer", label: "Radio", currentDraw: 3, minVoltage: 20 },
    ],
    links: [
      {
        id: "w.battery-relay",
        kind: "wire",
        label: "Kabel baterai ke relay baterai",
        from: "src.battery",
        to: "relay.battery",
        nominalResistance: 0.002,
        resistance: 0.002,
        installed: true,
      },
      {
        id: "sw.master",
        kind: "switch",
        label: "Master switch (BAT)",
        from: "relay.battery",
        to: "bus.main",
        nominalResistance: 0.001,
        resistance: 0.001,
        closed: true,
      },
      {
        id: "w.bus-starter-relay",
        kind: "wire",
        label: "Kabel bus ke relay starter",
        from: "bus.main",
        to: "relay.starter",
        nominalResistance: 0.003,
        resistance: 0.003,
        installed: true,
      },
      {
        id: "w.starter-cable",
        kind: "wire",
        label: "Kabel starter",
        from: "relay.starter",
        to: "load.starter",
        nominalResistance: 0.003,
        resistance: 0.003,
        installed: true,
      },
      {
        id: "sw.avionics",
        kind: "switch",
        label: "Saklar avionik",
        from: "bus.main",
        to: "bus.avionics",
        nominalResistance: 0.001,
        resistance: 0.001,
        closed: true,
      },
      {
        id: "w.radio",
        kind: "wire",
        label: "Kabel radio",
        from: "bus.avionics",
        to: "load.radio",
        nominalResistance: 0.05,
        resistance: 0.05,
        installed: true,
      },
    ],
  };
}
