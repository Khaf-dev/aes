/** Ruang hanggar malam: lantai epoxy, dinding, pintu, firewall uji + stand, meja part, tripod lampu kerja. */
import { useMemo } from "react";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { canvasTexture, LAMP_AIM, LAMP_POS, M, PART_TABLE, rand, ROOM, solid, UP, V } from "./shared.ts";

export function Rod({ a, b, r, material }: { a: THREE.Vector3; b: THREE.Vector3; r: number; material: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    return {
      pos: a.clone().addScaledVector(dir, 0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={material} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, 12]} />
    </mesh>
  );
}

function Floor() {
  const { map, roughnessMap } = useMemo(() => ({
    map: canvasTexture(1024, 1024, (g) => {
      const r = rand(7);
      g.fillStyle = "#6c7176"; g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 14000; i++) {
        const v = 95 + Math.floor(r() * 40);
        g.fillStyle = `rgba(${v},${v + 3},${v + 6},0.35)`;
        g.fillRect(r() * 1024, r() * 1024, 2, 2);
      }
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(30,26,20,${0.05 + r() * 0.08})`;
        g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 30 + r() * 90, 20 + r() * 60, r() * 3, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = "rgba(20,22,26,0.5)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 512); g.lineTo(1024, 512); g.moveTo(512, 0); g.lineTo(512, 1024); g.stroke();
    }, true, [5, 5]),
    roughnessMap: canvasTexture(512, 512, (g) => {
      const r = rand(11);
      g.fillStyle = "rgb(95,95,95)"; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 40; i++) {
        const v = 60 + Math.floor(r() * 120);
        g.fillStyle = `rgba(${v},${v},${v},0.25)`;
        g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 80, 15 + r() * 50, r() * 3, 0, Math.PI * 2); g.fill();
      }
    }, false, [5, 5]),
  }), []);
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xd9a51c, roughness: 0.6 }), []);
  // Garis area kerja kuning di sekitar stand mesin
  const lines: [number, number, number, number][] = [[0, -1.25, 2.9, 0.06], [0, 1.25, 2.9, 0.06], [-1.45, 0, 0.06, 2.56], [1.45, 0, 0.06, 2.56]];
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[(ROOM.minX + ROOM.maxX) / 2, 0, (ROOM.minZ + ROOM.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ]} />
        <meshStandardMaterial map={map} roughnessMap={roughnessMap} roughness={1} metalness={0} />
      </mesh>
      {lines.map(([x, z, w, d], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x + 0.15, 0.002, z]} material={paint} receiveShadow>
          <planeGeometry args={[w, d]} />
        </mesh>
      ))}
    </>
  );
}

function Walls() {
  const tex = useMemo(() => canvasTexture(256, 256, (g) => {
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = "#3a3f46"; g.fillRect(x, 0, 16, 256);
      g.fillStyle = "#2c3036"; g.fillRect(x + 16, 0, 16, 256);
    }
  }), []);
  const W = ROOM.maxX - ROOM.minX, D = ROOM.maxZ - ROOM.minZ, H = ROOM.height;
  const cx = (ROOM.minX + ROOM.maxX) / 2, cz = (ROOM.minZ + ROOM.maxZ) / 2;
  const wall = (width: number, repeatX: number, position: [number, number, number], rotY: number) => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, 3); t.needsUpdate = true;
    return (
      <mesh position={position} rotation-y={rotY} receiveShadow>
        <planeGeometry args={[width, H]} />
        <meshStandardMaterial map={t} metalness={0.4} roughness={0.6} />
      </mesh>
    );
  };
  // Pintu hanggar: langit malam di kejauhan (luminans relatif terhadap eksposur malam)
  const sky = useMemo(() => canvasTexture(512, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#0b1426"); grd.addColorStop(0.75, "#1b2a44"); grd.addColorStop(1, "#24324a");
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    const r = rand(3);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(220,230,255,${0.2 + r() * 0.6})`; g.fillRect(r() * 512, r() * 330, 1.5, 1.5); }
    for (let i = 0; i < 9; i++) { g.fillStyle = "#ffcf7a"; g.beginPath(); g.arc(30 + i * 55, 470, 3, 0, Math.PI * 2); g.fill(); }
  }), []);
  return (
    <>
      {wall(W, 14, [cx, H / 2, ROOM.minZ - 0.02], 0)}
      {wall(W, 14, [cx, H / 2, ROOM.maxZ + 0.02], Math.PI)}
      {wall(D, 13, [ROOM.minX - 0.02, H / 2, cz], Math.PI / 2)}
      {wall(D, 13, [ROOM.maxX + 0.02, H / 2, cz], -Math.PI / 2)}
      <mesh position={[4.0, 1.7, ROOM.minZ + 0.01]}>
        <planeGeometry args={[2.6, 3.4]} />
        <meshBasicMaterial map={sky} fog={false} color={[12, 12, 12]} />
      </mesh>
      <mesh position={[2.64, 1.8, ROOM.minZ + 0.07]} material={M.darkSteel} castShadow>
        <boxGeometry args={[0.12, 3.6, 0.12]} />
      </mesh>
    </>
  );
}

/** Pelat firewall uji, engine mount, dan stand beroda. */
function Stand() {
  const plateX = 0.92;
  const corners = [V(0.42, 1.16, 0.15), V(0.42, 1.16, -0.15), V(0.42, 0.86, 0.15), V(0.42, 0.86, -0.15)];
  const plateCorners = [V(plateX, 1.36, 0.34), V(plateX, 1.36, -0.34), V(plateX, 0.68, 0.34), V(plateX, 0.68, -0.34)];
  const base = [V(1.12, 0.08, 0.5), V(1.12, 0.08, -0.5), V(-0.3, 0.08, 0.5), V(-0.3, 0.08, -0.5)];
  const mountPick = { pick: { kind: "decor", code: "71-20-03", name: "Engine mount" } };
  return (
    <>
      <mesh ref={solid} position={[plateX, 1.02, 0]} material={M.plate} castShadow receiveShadow
        userData={{ pick: { kind: "decor", code: "ATA 71", name: "Pelat dudukan (firewall uji)" } }}>
        <boxGeometry args={[0.04, 0.9, 0.9]} />
      </mesh>
      {corners.map((a, i) => (
        <group key={i} userData={mountPick}><Rod a={a} b={plateCorners[i]!} r={0.012} material={M.darkSteel} /></group>
      ))}
      <Rod a={corners[0]!} b={plateCorners[1]!} r={0.01} material={M.darkSteel} />
      <Rod a={corners[2]!} b={plateCorners[3]!} r={0.01} material={M.darkSteel} />
      {[[0, 1], [2, 3], [0, 2], [1, 3]].map(([i, j]) => (
        <Rod key={`${i}${j}`} a={base[i!]!} b={base[j!]!} r={0.025} material={M.standPaint} />
      ))}
      <group ref={solid}>
        <Rod a={V(1.0, 0.08, 0.38)} b={V(1.0, 0.7, 0.3)} r={0.025} material={M.standPaint} />
        <Rod a={V(1.0, 0.08, -0.38)} b={V(1.0, 0.7, -0.3)} r={0.025} material={M.standPaint} />
        <mesh position={[0.99, 0.7, 0]} material={M.standPaint} castShadow receiveShadow><boxGeometry args={[0.06, 0.06, 0.7]} /></mesh>
      </group>
      {base.map((p, i) => (
        <mesh key={i} position={[p.x, 0.05, p.z]} rotation-x={Math.PI / 2} material={M.rubber} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.035, 18]} />
        </mesh>
      ))}
      <mesh position={[0.1, 0.015, 0]} material={M.darkSteel} castShadow receiveShadow><boxGeometry args={[0.9, 0.03, 0.62]} /></mesh>
      <mesh position={[0.05, 0.032, 0.05]} rotation-x={-Math.PI / 2} material={M.oil} receiveShadow>
        <circleGeometry args={[0.16, 32]} />
      </mesh>
    </>
  );
}

/** Meja part: part siap pasang di atas kain lap bersih (praktik hanggar), di dalam sorotan lampu kerja. */
function PartTable() {
  const { x, z, top, w, d } = PART_TABLE;
  return (
    <group ref={solid}>
      <mesh position={[x, top - 0.015, z]} material={M.plate} castShadow receiveShadow
        userData={{ pick: { kind: "decor", code: "", name: "Meja part · part siap pasang" } }}>
        <boxGeometry args={[w, 0.03, d]} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz], i) => (
        <mesh key={i} position={[x + dx! * (w / 2 - 0.03), (top - 0.03) / 2, z + dz! * (d / 2 - 0.03)]} material={M.darkSteel} castShadow>
          <boxGeometry args={[0.03, top - 0.03, 0.03]} />
        </mesh>
      ))}
      <mesh position={[x, top + 0.002, z]} material={M.cloth} receiveShadow><boxGeometry args={[w - 0.06, 0.004, d - 0.06]} /></mesh>
    </group>
  );
}

/** Kepala lampu kerja di tripod; muka lampu menyala sesuai daya (lumen). */
function LampTripod() {
  const lampLm = useGame((s) => s.lights.lampLm);
  const head = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(LAMP_POS);
    o.lookAt(LAMP_AIM);
    return o.quaternion.clone();
  }, []);
  const cable = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    V(LAMP_POS.x, 0.62, LAMP_POS.z), V(LAMP_POS.x + 0.1, 0.02, LAMP_POS.z + 0.3), V(-3.2, 0.02, 2.6), V(ROOM.minX + 0.05, 0.3, 2.8),
  ]), 60, 0.008, 6), []);
  return (
    <>
      <group ref={solid} position={LAMP_POS} quaternion={head}>
        <mesh material={M.darkSteel} receiveShadow><boxGeometry args={[0.3, 0.22, 0.12]} /></mesh>
        <mesh position-z={0.061}>
          <planeGeometry args={[0.26, 0.18]} />
          <meshStandardMaterial color={0x000000} emissive={0xffe0b0} emissiveIntensity={lampLm / 60} />
        </mesh>
      </group>
      <group ref={solid}><Rod a={V(LAMP_POS.x, 0.6, LAMP_POS.z)} b={V(LAMP_POS.x, LAMP_POS.y - 0.12, LAMP_POS.z)} r={0.015} material={M.darkSteel} /></group>
      {[0, 1, 2].map((i) => {
        const a = (i * Math.PI * 2) / 3 + 0.4;
        return <Rod key={i} a={V(LAMP_POS.x, 0.62, LAMP_POS.z)} b={V(LAMP_POS.x + Math.cos(a) * 0.45, 0.01, LAMP_POS.z + Math.sin(a) * 0.45)} r={0.012} material={M.darkSteel} />;
      })}
      <mesh geometry={cable} material={M.rubber} receiveShadow />
    </>
  );
}

export function Hangar() {
  return (
    <>
      <Floor />
      <Walls />
      <Stand />
      <PartTable />
      <LampTripod />
    </>
  );
}
