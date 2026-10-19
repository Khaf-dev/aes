/** Mesin piston placeholder (bentuk dasar) + pad aksesori, stud, dan mur yang dipasang pemain. */
import { useMemo } from "react";
import * as THREE from "three";
import { PAD_FACE_X, PARTS } from "../data/parts.ts";
import { nutLabel, useGame } from "../state/store.ts";
import { ENGINE_POS, M, nutKey, rig, solid, V } from "./shared.ts";

const finGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.006, 28);
const barrelGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.24, 24);
const padGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24);
const studGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8);
const nutGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6);

const decor = (code: string, name: string) => ({ pick: { kind: "decor", code, name } });

function Block({ size, position, code, name, material = M.castAlu }: {
  size: [number, number, number]; position: [number, number, number]; code: string; name: string; material?: THREE.Material;
}) {
  return (
    <mesh ref={solid} position={position} material={material} castShadow receiveShadow userData={decor(code, name)}>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Cylinders() {
  return (
    <>
      {[-0.17, 0.17].flatMap((x) => [1, -1].map((side) => (
        <group key={`${x}${side}`} position={[x + (side > 0 ? 0.04 : -0.04), 0.02, side * 0.21]} rotation-x={Math.PI / 2}>
          <mesh ref={solid} geometry={barrelGeo} material={M.cylinder} position-y={side * 0.12} castShadow receiveShadow userData={decor("ATA 85", "Silinder")} />
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} geometry={finGeo} material={M.cylinder} position-y={side * (0.03 + i * 0.022)} castShadow receiveShadow />
          ))}
          <mesh ref={solid} material={M.head} position-y={side * 0.29} castShadow receiveShadow userData={decor("ATA 85", "Kepala silinder")}>
            <boxGeometry args={[0.2, 0.1, 0.17]} />
          </mesh>
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

/** Pad aksesori di muka belakang gearbox (muka pad di x = PAD_FACE_X, normal +x), stud, dan mur. */
function Mounts() {
  const rakit = useGame((s) => s.rakit);
  return (
    <>
      {PARTS.map((def) => (
        <group key={def.assetId}>
          <mesh
            ref={(m) => { if (m) rig.pads.set(def.assetId, m); }}
            geometry={padGeo} material={M.castAlu} rotation-z={Math.PI / 2}
            position={[PAD_FACE_X - 0.01, def.pad.y, def.pad.z]} castShadow receiveShadow
            userData={{ pick: { kind: "pad", part: def.assetId, code: def.pad.code, name: def.pad.name } }}
          />
          {def.pad.studs.map((dz, index) => {
            const key = nutKey(def.assetId, index);
            const nut = rakit.nuts[def.assetId]?.[index];
            return (
              <group key={index}>
                <mesh
                  ref={(m) => { if (m) rig.studs.set(key, m); }}
                  geometry={studGeo} material={M.steel} rotation-z={Math.PI / 2}
                  position={[PAD_FACE_X + 0.015, def.pad.y, def.pad.z + dz]} castShadow
                  userData={{ pick: { kind: "stud", part: def.assetId, index, code: def.pad.code, name: `Stud dudukan ${def.label} #${index + 1}` } }}
                />
                {nut?.installed && (
                  <mesh
                    ref={(m) => { if (m) rig.nuts.set(key, m); else rig.nuts.delete(key); }}
                    geometry={nutGeo} material={M.steel} rotation-z={Math.PI / 2}
                    position={[PAD_FACE_X + def.pad.nutX, def.pad.y, def.pad.z + dz]} castShadow
                    userData={{ pick: { kind: "nut", part: def.assetId, index, code: def.pad.code, name: nutLabel(rakit, { part: def.assetId, index }) } }}
                  />
                )}
              </group>
            );
          })}
        </group>
      ))}
    </>
  );
}

export function Engine({ children }: { children?: React.ReactNode }) {
  return (
    <group position={ENGINE_POS} ref={(g) => { rig.engine = g; }}>
      <Block size={[0.76, 0.32, 0.42]} position={[0, 0, 0]} code="ATA 71" name="Crankcase" />
      <Block size={[0.6, 0.12, 0.34]} position={[0.02, -0.21, 0]} code="ATA 79" name="Bak oli (sump)" />
      <Block size={[0.12, 0.3, 0.34]} position={[0.44, 0.02, 0]} code="ATA 72" name="Gearbox aksesori" />
      <Cylinders />
      <Propeller />
      <Exhaust />
      <Mounts />
      {children}
    </group>
  );
}
