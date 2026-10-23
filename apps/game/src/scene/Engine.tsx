/** Mesin piston placeholder (bentuk dasar) + pad aksesori, stud, dan mur yang dipasang pemain. */
import { useMemo } from "react";
import * as THREE from "three";
import { PARTS } from "../data/parts.ts";
import { nutLabel, useGame } from "../state/store.ts";
import { ENGINE_POS, FIREWALL_BACK_X, INTERIOR, M, NO_RAYCAST, nutKey, padFrame, padPoint, rig, solid, STAND, V, XRAY_LINE } from "./shared.ts";

const finGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.006, 28);
const barrelGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.24, 24);
const studGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8);
const nutGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6);

const decor = (code: string, name: string) => ({ pick: { kind: "decor", code, name } });

/**
 * Kulit mesin: bisa dibuka lensa x-ray (materialnya di-patch di shared.ts), punya dinding dalam
 * gaya cutaway, dan dihitung sebagai benda padat untuk kamera.
 */
function Shell({ geometry, material, code, name, ...rest }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; code: string; name: string;
} & Omit<React.ComponentProps<"mesh">, "geometry" | "material">) {
  return (
    <mesh ref={solid} geometry={geometry} material={material} castShadow receiveShadow userData={decor(code, name)} {...rest}>
      <mesh geometry={geometry} material={INTERIOR} />
    </mesh>
  );
}

function Block({ size, position, code, name }: { size: [number, number, number]; position: [number, number, number]; code: string; name: string }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  return <Shell geometry={geometry} material={M.castAlu} position={position} code={code} name={name} />;
}
const headGeo = new THREE.BoxGeometry(0.2, 0.1, 0.17);

/** Bagian dalam: tertutup kulit mesin, hanya terlihat dan bisa dipilih lewat lensa x-ray. */
const INTERNALS: { geometry: THREE.BufferGeometry; position: [number, number, number]; rotZ: number; code: string; name: string }[] = [
  { geometry: new THREE.CylinderGeometry(0.03, 0.03, 0.78, 16), position: [0, 0, 0], rotZ: Math.PI / 2, code: "ATA 85", name: "Crankshaft" },
  ...([[0.44, 0.06, 0.07, "Gear penggerak aksesori"], [0.44, -0.06, 0.045, "Gear pompa oli"], [0.4, 0.1, 0.035, "Gear penggerak magneto"]] as const)
    .map(([x, y, r, name]) => ({
      geometry: new THREE.CylinderGeometry(r, r, 0.02, 20), position: [x, y, 0.05] as [number, number, number], rotZ: Math.PI / 2,
      code: name.includes("magneto") ? "ATA 74" : "ATA 72", name,
    })),
  ...[-0.17, 0.17].map((x) => ({
    geometry: new THREE.BoxGeometry(0.03, 0.03, 0.34), position: [x, 0.02, 0] as [number, number, number], rotZ: 0, code: "ATA 85", name: "Batang penghubung",
  })),
];
const internalEdges = INTERNALS.map((i) => new THREE.EdgesGeometry(i.geometry, 25));

function Internals() {
  return (
    <>
      {INTERNALS.map((i, n) => (
        <group key={n} position={i.position} rotation-z={i.rotZ}>
          <mesh geometry={i.geometry} material={M.steel} castShadow userData={{ pick: { kind: "internal", code: i.code, name: i.name } }} />
          <lineSegments geometry={internalEdges[n]} material={XRAY_LINE} raycast={NO_RAYCAST} />
        </group>
      ))}
    </>
  );
}

function Cylinders() {
  return (
    <>
      {[-0.17, 0.17].flatMap((x) => [1, -1].map((side) => (
        <group key={`${x}${side}`} position={[x + (side > 0 ? 0.04 : -0.04), 0.02, side * 0.21]} rotation-x={Math.PI / 2}>
          <Shell geometry={barrelGeo} material={M.cylinder} position-y={side * 0.12} code="ATA 85" name="Silinder" />
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} geometry={finGeo} material={M.cylinder} position-y={side * (0.03 + i * 0.022)} castShadow receiveShadow />
          ))}
          <Shell geometry={headGeo} material={M.head} position-y={side * 0.29} code="ATA 85" name="Kepala silinder" />
        </group>
      )))}
    </>
  );
}

function Propeller() {
  return (
    <>
      <mesh ref={solid} position={[-0.52, 0, 0]} rotation-z={Math.PI / 2} material={M.steel} castShadow userData={decor("ATA 61", "Spinner propeller")}>
        <coneGeometry args={[0.12, 0.24, 32]} />
      </mesh>
      <mesh ref={solid} position={[-0.41, 0, 0]} rotation-z={Math.PI / 2} material={M.darkSteel} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 24]} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} ref={solid} position={[-0.43, s * 0.47, 0]} rotation-y={s * 0.35} material={M.propBlade} castShadow userData={decor("ATA 61", "Bilah propeller")}>
          <boxGeometry args={[0.035, 0.86, 0.11]} />
        </mesh>
      ))}
    </>
  );
}

function Exhaust() {
  const tubes = useMemo(() => [0.21, -0.21].map((z) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    [V(-0.13, -0.08, z * 1.5), V(-0.1, -0.32, z * 1.2), V(0.15, -0.42, z * 0.6), V(0.55, -0.46, z * 0.4)],
  ), 40, 0.022, 10)), []);
  return <>{tubes.map((g, i) => <mesh key={i} geometry={g} material={M.exhaust} castShadow userData={decor("ATA 78", "Pipa knalpot")} />)}</>;
}

const padGeos = new Map<string, THREE.CylinderGeometry>();
/** Piringan pad cukup lebar untuk semua stud-nya. */
const padGeoOf = (def: (typeof PARTS)[number]) => {
  let g = padGeos.get(def.assetId);
  if (!g) {
    const r = Math.max(0.045, ...def.pad.studs.map(([y, z]) => Math.hypot(y, z) + 0.015));
    padGeos.set(def.assetId, (g = new THREE.CylinderGeometry(r, r, 0.02, 32)));
  }
  return g;
};

/**
 * Pad dudukan, stud, dan mur tiap part. Semuanya ditulis di bingkai lokal pad (x = normal keluar dari pad),
 * jadi pad di muka belakang gearbox (normal +x) dan pad karburator di bawah bak oli (normal -y) memakai kode yang sama.
 */
function Mounts() {
  const rakit = useGame((s) => s.rakit);
  return (
    <>
      {PARTS.map((def) => {
        const frame = padFrame(def.pad);
        return (
          <group key={def.assetId}>
            <group position={frame.origin} quaternion={frame.q}>
              <mesh
                ref={(m) => { if (m) rig.pads.set(def.assetId, m); }}
                geometry={padGeoOf(def)} material={M.castAlu} rotation-z={Math.PI / 2}
                position={[-0.01, 0, 0]} castShadow receiveShadow
                userData={{ pick: { kind: "pad", part: def.assetId, code: def.pad.code, name: def.pad.name } }}
              />
              {def.pad.studs.map(([dy, dz], index) => {
                const key = nutKey(def.assetId, index);
                const nut = rakit.nuts[def.assetId]?.[index];
                return (
                  <group key={index}>
                    <mesh
                      ref={(m) => { if (m) rig.studs.set(key, m); }}
                      geometry={studGeo} material={M.steel} rotation-z={Math.PI / 2}
                      position={[0.015, dy, dz]} castShadow
                      userData={{ pick: { kind: "stud", part: def.assetId, index, code: def.pad.code, name: `Stud dudukan ${def.label} #${index + 1}` } }}
                    />
                    {nut?.installed && (
                      <mesh
                        ref={(m) => { if (m) rig.nuts.set(key, m); else rig.nuts.delete(key); }}
                        geometry={nutGeo} material={M.steel} rotation-z={Math.PI / 2}
                        position={[def.pad.nutX, dy, dz]} castShadow
                        userData={{ pick: { kind: "nut", part: def.assetId, index, code: def.pad.code, name: nutLabel(rakit, { part: def.assetId, index }) } }}
                      />
                    )}
                  </group>
                );
              })}
              {(rakit.wires[def.assetId] ?? []).map((w) => <SafetyWire key={`${w.a}-${w.b}`} def={def} a={w.a} b={w.b} />)}
            </group>
            {def.cable && <TerminalCable def={def} installed={rakit.parts[def.assetId] === "installed"} connected={rakit.cables[def.assetId] ?? false} />}
          </group>
        );
      })}
    </>
  );
}

const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const terminalGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.014, 12);

/** Jalur di belakang firewall dari grommet ke ujungnya (koordinat dunia), lalu ke lokal mesin. */
const toLocal = (v: THREE.Vector3) => v.clone().sub(ENGINE_POS);
function behindFirewall(to: "magSwitch" | "busBox" | "fuel", grommet: THREE.Vector3) {
  const back = V(FIREWALL_BACK_X + 0.01, grommet.y, grommet.z);
  const end = to === "fuel" ? STAND.gascolator.clone().add(V(0, -0.04, 0)) : STAND[to].clone().add(V(-0.03, 0, 0));
  return [end, V(back.x + 0.02, (back.y + end.y) / 2, (back.z + end.z) / 2), back];
}

/**
 * Terminal di part + kabel/selangnya. Kabel menembus pelat firewall uji lewat grommet dan berakhir di ujungnya:
 * P-lead di kunci kontak magneto, kabel output alternator di kotak bus/relay, selang dari strainer bahan bakar stand.
 * Posisi terminal dari `cable.terminal` di bingkai pad: untuk magneto masih perkiraan, untuk alternator dan karburator dari metadata model.
 */
function TerminalCable({ def, installed, connected }: { def: (typeof PARTS)[number]; installed: boolean; connected: boolean }) {
  const frame = padFrame(def.pad);
  const { terminal: [tx, ty], to, name } = def.cable!;
  const fuel = to === "fuel";
  const cable = useMemo(() => {
    const terminal = padPoint(def.pad, tx, ty, 0);
    const world = terminal.clone().add(ENGINE_POS);
    // Grommet di pelat firewall, kira-kira segaris dengan terminalnya
    const grommet = V(FIREWALL_BACK_X - 0.04, world.y + (fuel ? 0 : 0.1), Math.max(-0.38, Math.min(0.38, world.z * 1.5 + (fuel ? 0.15 : 0))));
    const front = toLocal(grommet).add(V(-0.012, 0, 0));
    const tail = [...behindFirewall(to, grommet).map(toLocal), toLocal(grommet).add(V(0.02, 0, 0)), front];
    // Tidak tersambung: ujung kabel menggantung keluar dari grommet
    const end = connected ? [front.clone().lerp(terminal, 0.5).add(V(0, fuel ? -0.04 : 0.03, 0)), terminal] : [front.clone().add(V(-0.06, -0.1, 0))];
    return { tube: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...tail, ...end]), 48, fuel ? 0.006 : 0.003, 8), grommet: toLocal(grommet) };
  }, [connected, def, tx, ty, to, fuel]);
  return (
    <>
      {installed && (
        <group position={frame.origin} quaternion={frame.q}>
          <mesh geometry={terminalGeo} material={brass} position={[tx, ty, 0]} castShadow
            userData={{ pick: { kind: "terminal", part: def.assetId, code: def.cable!.stepId, name: `Terminal ${name.toLowerCase()} ${def.label} · ${connected ? "tersambung, klik untuk melepas" : "klik untuk menyambung"}` } }} />
        </group>
      )}
      <mesh geometry={cable.tube} material={fuel ? M.fuelHose : M.rubber} castShadow raycast={NO_RAYCAST} />
      {/* Grommet karet / fitting bulkhead di pelat firewall */}
      <mesh position={cable.grommet} rotation-y={Math.PI / 2} material={fuel ? brass : M.rubber} raycast={NO_RAYCAST}>
        <torusGeometry args={[fuel ? 0.012 : 0.009, 0.004, 8, 20]} />
      </mesh>
    </>
  );
}

/** Kawat safety wire antar muka mur (bingkai pad), sedikit melengkung keluar. Ukuran kawat hanya visual. */
function SafetyWire({ def, a, b }: { def: (typeof PARTS)[number]; a: number; b: number }) {
  const geometry = useMemo(() => {
    const x = def.pad.nutX + 0.005;
    const [ya, za] = def.pad.studs[a] ?? [0, 0], [yb, zb] = def.pad.studs[b] ?? [0, 0];
    const curve = new THREE.CatmullRomCurve3([V(x, ya, za), V(x + 0.006, (ya + yb) / 2 - 0.008, (za + zb) / 2), V(x, yb, zb)]);
    return new THREE.TubeGeometry(curve, 24, 0.0005, 6);
  }, [def, a, b]);
  return <mesh geometry={geometry} material={M.steel} castShadow raycast={NO_RAYCAST} />;
}

export function Engine({ children }: { children?: React.ReactNode }) {
  return (
    <group position={ENGINE_POS} ref={(g) => { rig.engine = g; }}>
      <Block size={[0.76, 0.32, 0.42]} position={[0, 0, 0]} code="ATA 71" name="Crankcase" />
      <Block size={[0.6, 0.12, 0.34]} position={[0.02, -0.21, 0]} code="ATA 79" name="Bak oli (sump)" />
      <Block size={[0.12, 0.3, 0.34]} position={[0.44, 0.02, 0]} code="ATA 72" name="Gearbox aksesori" />
      <Cylinders />
      <Internals />
      <Propeller />
      <Exhaust />
      <Mounts />
      {children}
    </group>
  );
}
