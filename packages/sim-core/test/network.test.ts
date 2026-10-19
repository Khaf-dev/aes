import { describe, expect, it } from "vitest";
import { applyFaults, diagnose, evaluate, setSwitch, type ConsumerState } from "../src/index.ts";
import { basicElectrical } from "./fixtures/basic-electrical.ts";

function stateOf(states: ConsumerState[], id: string): ConsumerState {
  const state = states.find((s) => s.consumerId === id);
  if (state === undefined) throw new Error(`state ${id} tidak ada`);
  return state;
}

const STARTER_TRACE = ["load.starter", "relay.starter", "bus.main", "relay.battery"];

describe("jaringan sehat", () => {
  it("semua konsumen bekerja", () => {
    const states = evaluate(basicElectrical());
    const starter = stateOf(states, "load.starter");

    expect(starter.status).toBe("ok");
    // 24 V − 150 A × (0.002 + 0.001 + 0.003 + 0.003) Ω
    expect(starter.voltage).toBeCloseTo(22.65, 6);
    expect(starter.pathLinkIds).toEqual([
      "w.battery-relay",
      "sw.master",
      "w.bus-starter-relay",
      "w.starter-cable",
    ]);
    expect(stateOf(states, "load.radio").status).toBe("ok");
  });

  it("tidak ada diagnosis untuk konsumen yang normal", () => {
    expect(diagnose(basicElectrical(), "load.starter")).toBeNull();
  });

  it("deterministik: input sama, hasil sama", () => {
    const network = basicElectrical();
    expect(evaluate(network)).toEqual(evaluate(network));
  });
});

describe("kabel lupa dipasang", () => {
  const network = applyFaults(basicElectrical(), [{ kind: "missing", linkId: "w.battery-relay" }]);

  it("memutus suplai ke semua konsumen di hilir", () => {
    const states = evaluate(network);
    expect(stateOf(states, "load.starter").status).toBe("unpowered");
    expect(stateOf(states, "load.radio").status).toBe("unpowered");
  });

  it("diagnosis menunjuk kabel yang hilang dan jalur penelusurannya", () => {
    expect(diagnose(network, "load.starter")).toEqual({
      consumerId: "load.starter",
      status: "unpowered",
      rootCause: {
        linkId: "w.battery-relay",
        label: "Kabel baterai ke relay baterai",
        reason: "missing",
      },
      trace: STARTER_TRACE,
    });
  });
});

describe("terminal kendor (torsi kurang)", () => {
  const network = applyFaults(basicElectrical(), [
    { kind: "addedResistance", linkId: "w.battery-relay", ohms: 0.05 },
  ]);

  it("starter kekurangan tegangan, radio tetap normal", () => {
    const states = evaluate(network);
    const starter = stateOf(states, "load.starter");

    expect(starter.status).toBe("undervoltage");
    // 24 V − 150 A × 0.059 Ω: beban besar paling merasakan hambatan ekstra
    expect(starter.voltage).toBeCloseTo(15.15, 6);
    expect(stateOf(states, "load.radio").status).toBe("ok");
  });

  it("diagnosis menunjuk sambungan dengan hambatan abnormal", () => {
    expect(diagnose(network, "load.starter")).toEqual({
      consumerId: "load.starter",
      status: "undervoltage",
      rootCause: {
        linkId: "w.battery-relay",
        label: "Kabel baterai ke relay baterai",
        reason: "highResistance",
      },
      trace: STARTER_TRACE,
    });
  });
});

describe("saklar avionik OFF", () => {
  const network = setSwitch(basicElectrical(), "sw.avionics", false);

  it("hanya mematikan cabang avionik", () => {
    const states = evaluate(network);
    expect(stateOf(states, "load.radio").status).toBe("unpowered");
    expect(stateOf(states, "load.starter").status).toBe("ok");
  });

  it("diagnosis membedakan saklar terbuka dari kabel hilang", () => {
    expect(diagnose(network, "load.radio")).toMatchObject({
      status: "unpowered",
      rootCause: { linkId: "sw.avionics", reason: "switchOpen" },
      trace: ["load.radio", "bus.avionics"],
    });
  });
});

describe("kemurnian dan validasi", () => {
  it("applyFaults tidak mengubah jaringan asli", () => {
    const original = basicElectrical();
    applyFaults(original, [{ kind: "missing", linkId: "w.battery-relay" }]);
    expect(original).toEqual(basicElectrical());
  });

  it("fault berlapis pada link yang sama ikut terakumulasi", () => {
    const network = applyFaults(basicElectrical(), [
      { kind: "addedResistance", linkId: "w.starter-cable", ohms: 0.01 },
      { kind: "addedResistance", linkId: "w.starter-cable", ohms: 0.01 },
    ]);
    const link = network.links.find((l) => l.id === "w.starter-cable");
    expect(link?.resistance).toBeCloseTo(0.023, 9);
  });

  it("menolak link yang tidak dikenal", () => {
    expect(() =>
      applyFaults(basicElectrical(), [{ kind: "missing", linkId: "w.tidak-ada" }]),
    ).toThrow(/tidak dikenal/);
  });

  it("menolak fault missing pada saklar", () => {
    expect(() =>
      applyFaults(basicElectrical(), [{ kind: "missing", linkId: "sw.master" }]),
    ).toThrow(/hanya untuk kabel/);
  });
});
