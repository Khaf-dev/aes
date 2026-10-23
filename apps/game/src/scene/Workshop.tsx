/** Area kerja di dinding belakang: meja kerja + task card, shadow board, papan tulis, troli alat, APAR, lampu meja. */
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { PLAYABLE_STEP_IDS } from "../data/parts.ts";
import { checklist, STEPS } from "../logic/assemblyLog.ts";
import { useGame } from "../state/store.ts";
import { Rod } from "./Hangar.tsx";
import { BACK, BOARD, canvasTexture, loadCanvasFonts, M, ROOM, solid, toBoard, V } from "./shared.ts";

/** true setelah font canvas siap; tekstur bertulisan digambar ulang saat itu. */
export function useCanvasFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; loadCanvasFonts().then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);
  return ready;
}

const decor = (code: string, name: string) => ({ pick: { kind: "decor", code, name } });

function Box({ size, position, material, ...rest }: {
  size: [number, number, number]; position: [number, number, number]; material: THREE.Material;
} & Omit<React.ComponentProps<"mesh">, "position">) {
  return (
    <mesh position={position} material={material} castShadow receiveShadow {...rest}>
      <boxGeometry args={size} />
    </mesh>
  );
}

const BENCH = { x: -1.4, z: BACK + 0.42 } as const;

/** Task card di atas papan klip meja kerja, satu per langkah perakitan. Posisinya dipakai kamera mode dokumen. */
export const TASK_CARDS = PLAYABLE_STEP_IDS.map((stepId, i) => ({
  stepId,
  // Dua baris papan klip (5 per baris); nampan mur, mug, dan ragum di ujung kanan meja
  position: V(BENCH.x + 0.3 - (i % 5) * 0.275, 0.955, BENCH.z - 0.17 + Math.floor(i / 5) * 0.36),
  yaw: 0.03 - (i % 5) * 0.015,
}));

function TaskCard({ stepId, position, yaw }: (typeof TASK_CARDS)[number]) {
  const fonts = useCanvasFonts();
  const card = useGame((s) => s.rakit.signoff[stepId]);
  const step = STEPS.find((s) => s.id === stepId)!;
  const lines = useMemo(() => checklist(stepId), [stepId]);
  const map = useMemo(() => canvasTexture(512, 700, (g) => {
    g.fillStyle = "#F3ECDD"; g.fillRect(0, 0, 512, 700);
    g.fillStyle = "#1E1C19"; g.font = '700 46px "Courier Prime", monospace'; g.fillText("TASK CARD", 30, 70);
    g.fillRect(30, 88, 452, 4);
    g.font = '700 34px "Courier Prime", monospace'; g.fillText(stepId, 30, 140);
    g.font = '400 26px "Courier Prime", monospace'; g.fillText(step.title.slice(0, 30), 30, 184);
    g.strokeStyle = "#3A352D"; g.lineWidth = 2;
    lines.forEach((_, i) => {
      g.strokeRect(30, 220 + i * 66, 452, 66);
      g.fillStyle = "#1E1C19"; g.font = '400 28px "Courier Prime", monospace'; g.fillText(String(i + 1), 44, 262 + i * 66);
      if (card?.checks[i]) { g.fillStyle = "#1F3A8A"; g.font = '700 54px "Caveat", cursive'; g.fillText("RK", 410, 266 + i * 66); }
    });
    if (card?.signed) {
      g.save(); g.translate(250, 640); g.rotate(-0.12);
      g.strokeStyle = "#B3261E"; g.lineWidth = 5; g.strokeRect(-150, -40, 300, 64);
      g.fillStyle = "#B3261E"; g.font = '700 34px "Courier Prime", monospace'; g.textAlign = "center"; g.fillText("SIGNED · RK", 0, 6);
      g.restore();
    }
  }), [fonts, card, lines, step, stepId]);
  return (
    <group position={position} rotation-y={yaw}>
      <Box size={[0.27, 0.008, 0.36]} position={[0, -0.005, -0.01]} material={M.wood} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow userData={{ pick: { kind: "taskcard", stepId, code: `TC ${stepId}`, name: "Task card · klik untuk membuka checklist" } }}>
        <planeGeometry args={[0.235, 0.32]} />
        <meshStandardMaterial map={map} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Workbench() {
  const { x: bx, z: bz } = BENCH;
  const nutGeo = useMemo(() => new THREE.CylinderGeometry(0.012, 0.012, 0.01, 6), []);
  return (
    <>
      <group ref={solid}>
        <Box size={[1.9, 0.05, 0.72]} position={[bx, 0.92, bz]} material={M.benchTop} userData={{ pick: { kind: "bench", code: "", name: "Meja kerja · klik untuk membuka task card" } }} />
        {[[-0.9, -0.32], [0.9, -0.32], [-0.9, 0.32], [0.9, 0.32]].map(([dx, dz], i) => (
          <Box key={i} size={[0.05, 0.9, 0.05]} position={[bx + dx!, 0.45, bz + dz!]} material={M.bluePaint} />
        ))}
        <Box size={[1.85, 0.03, 0.66]} position={[bx, 0.2, bz]} material={M.bluePaint} />
        {/* ragum, kotak perkakas, nampan mur */}
        <Box size={[0.16, 0.08, 0.2]} position={[bx + 0.7, 0.99, bz + 0.18]} material={M.bluePaint} />
        <Box size={[0.16, 0.07, 0.03]} position={[bx + 0.7, 1.06, bz + 0.27]} material={M.steel} />
        <Box size={[0.16, 0.07, 0.03]} position={[bx + 0.7, 1.06, bz + 0.2]} material={M.steel} />
        <Box size={[0.5, 0.22, 0.26]} position={[bx - 0.5, 0.33, bz]} material={M.redPaint} />
        <Box size={[0.24, 0.02, 0.16]} position={[bx + 0.62, 0.955, bz - 0.2]} material={M.darkSteel} />
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} geometry={nutGeo} material={M.steel} castShadow
            position={[bx + 0.55 + (i % 3) * 0.05, 0.972, bz - 0.23 + Math.floor(i / 3) * 0.06]} />
        ))}
        <mesh position={[bx + 0.84, 0.995, bz - 0.04]} material={M.ceramic} castShadow><cylinderGeometry args={[0.04, 0.036, 0.1, 20]} /></mesh>
        <mesh position={[bx + 0.88, 1.0, bz - 0.04]} material={M.ceramic} castShadow><torusGeometry args={[0.026, 0.007, 8, 16]} /></mesh>
      </group>
      {TASK_CARDS.map((c) => <TaskCard key={c.stepId} {...c} />)}
    </>
  );
}

const SIL = "#23262b";
const BOARD_WRENCHES: [number, number][] = [[120, 560], [210, 600], [300, 640], [390, 680]];

/** Shadow board: tiap alat punya slot bersiluet. Slot kunci torsi ditandai merah saat kuncinya sedang dipakai. */
function ShadowBoard() {
  const fonts = useCanvasFonts();
  const inUse = useGame((s) => s.wrenchAt !== null);
  const tangInUse = useGame((s) => s.wireMode);
  const texture = useMemo(() => canvasTexture(1600, 900, () => {}), []);
  useEffect(() => {
    const g = (texture.image as HTMLCanvasElement).getContext("2d")!;
    g.fillStyle = "#cfd2c6"; g.fillRect(0, 0, 1600, 900);
    g.fillStyle = "rgba(60,60,55,0.35)";
    for (let y = 25; y < 900; y += 50) for (let x = 25; x < 1600; x += 50) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#1E1C19"; g.font = '700 44px "Courier Prime", monospace'; g.fillText("SHADOW BOARD · STASIUN 2", 40, 70);
    g.font = '400 26px "Courier Prime", monospace'; g.fillText("Kembalikan alat setelah dipakai. Slot kosong = cek mesin (FOD).", 40, 110);
    BOARD_WRENCHES.forEach(([x, len], i) => {
      g.fillStyle = SIL; g.beginPath(); g.roundRect(x - 14, 170, 28, len - 220, 10); g.fill();
      g.beginPath(); g.arc(x, 170, 30, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, len - 50, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1E1C19"; g.font = '700 26px "Courier Prime", monospace'; g.fillText(String(8 + i * 2), x - 16, len + 10);
    });
    for (const x of [520, 600]) { g.fillStyle = SIL; g.beginPath(); g.roundRect(x - 20, 160, 40, 150, 12); g.fill(); g.fillRect(x - 5, 310, 10, 190); }
    g.fillStyle = SIL; g.save(); g.translate(760, 420);
    for (const a of [-0.25, 0.25]) { g.save(); g.rotate(a); g.beginPath(); g.roundRect(-14, -220, 28, 440, 12); g.fill(); g.restore(); }
    g.restore();
    g.fillStyle = SIL; g.beginPath(); g.roundRect(960, 200, 34, 520, 14); g.fill(); g.beginPath(); g.arc(977, 190, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = inUse ? "#B3261E" : "#1E1C19";
    g.font = '700 30px "Courier Prime", monospace'; g.fillText("KUNCI TORSI", 1030, 420);
    if (inUse) { g.font = '400 26px "Courier Prime", monospace'; g.fillText("sedang dipakai · RK", 1030, 460); }
    g.fillStyle = SIL; g.beginPath(); g.roundRect(1300, 190, 50, 280, 16); g.fill(); g.beginPath(); g.roundRect(1380, 190, 50, 280, 16); g.fill();
    g.fillStyle = tangInUse ? "#B3261E" : "#1E1C19"; g.font = '700 26px "Courier Prime", monospace'; g.fillText("TANG SAFETY WIRE", 1240, 520);
    if (tangInUse) { g.font = '400 24px "Courier Prime", monospace'; g.fillText("sedang dipakai · RK", 1250, 556); }
    texture.needsUpdate = true;
  }, [texture, inUse, tangInUse, fonts]);

  const yellow = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xd8b21f, roughness: 0.35 }), []);
  const pv = toBoard(760, 420);
  return (
    <>
      <mesh position={[BOARD.cx, BOARD.cy, BOARD.z]} receiveShadow userData={decor("", "Shadow board · kontrol FOD")}>
        <planeGeometry args={[BOARD.W, BOARD.H]} />
        <meshStandardMaterial map={texture} roughness={0.75} />
      </mesh>
      <Box ref={solid} size={[BOARD.W + 0.06, BOARD.H + 0.06, 0.03]} position={[BOARD.cx, BOARD.cy, BOARD.z - 0.02]} material={M.wood} />
      {/* kunci pas di slotnya */}
      {BOARD_WRENCHES.map(([x, len]) => {
        const top = toBoard(x, 170), bot = toBoard(x, len - 50);
        return (
          <group key={x}>
            <Box size={[0.026, top.y - bot.y, 0.006]} position={[top.x, (top.y + bot.y) / 2, top.z]} material={M.steel} />
            {([[top, 0.028], [bot, 0.024]] as const).map(([p, r], i) => (
              <mesh key={i} position={p} rotation-x={Math.PI / 2} material={M.steel} castShadow><cylinderGeometry args={[r, r, 0.008, 18]} /></mesh>
            ))}
          </group>
        );
      })}
      {/* obeng */}
      {([[520, M.redPaint], [600, yellow]] as const).map(([x, mat]) => {
        const handleTop = toBoard(x, 160), handleBot = toBoard(x, 310), tip = toBoard(x, 500);
        return (
          <group key={x}>
            <mesh position={[handleTop.x, (handleTop.y + handleBot.y) / 2, handleTop.z + 0.01]} material={mat} castShadow>
              <cylinderGeometry args={[0.02, 0.018, handleTop.y - handleBot.y, 14]} />
            </mesh>
            <mesh position={[handleBot.x, (handleBot.y + tip.y) / 2, handleBot.z + 0.01]} material={M.steel} castShadow>
              <cylinderGeometry args={[0.004, 0.004, handleBot.y - tip.y, 8]} />
            </mesh>
          </group>
        );
      })}
      {/* tang */}
      {[-0.25, 0.25].map((a) => <Box key={a} size={[0.026, 0.44, 0.01]} position={[pv.x, pv.y, pv.z + 0.008]} rotation-z={-a} material={M.steel} />)}
      {/* tang safety wire */}
      {[1325, 1405].map((x) => {
        const p = toBoard(x, 330);
        return <Box key={x} visible={!tangInUse} size={[0.048, 0.28, 0.02]} position={[p.x, p.y, p.z + 0.01]} material={M.bluePaint} />;
      })}
    </>
  );
}

function Whiteboard() {
  const fonts = useCanvasFonts();
  const W = 1.6, H = 1.0, cx = 0.95, cy = 1.6, z = BACK + 0.035;
  const map = useMemo(() => canvasTexture(1600, 1000, (g) => {
    g.fillStyle = "#f4f5f1"; g.fillRect(0, 0, 1600, 1000);
    g.strokeStyle = "rgba(150,155,160,0.18)"; g.lineWidth = 26; g.lineCap = "round";
    g.beginPath(); g.moveTo(980, 160); g.lineTo(1450, 230); g.moveTo(120, 820); g.lineTo(520, 760); g.stroke();
    const hand = (txt: string, x: number, y: number, size: number, color: string) => { g.fillStyle = color; g.font = `700 ${size}px "Caveat", cursive`; g.fillText(txt, x, y); };
    hand("Shift malam · AES-1", 60, 90, 64, "#1F3A8A");
    g.strokeStyle = "#1c1c1c"; g.lineWidth = 6; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(90, 220); g.lineTo(90, 300); g.moveTo(115, 240); g.lineTo(115, 280); g.stroke();
    hand("BAT", 60, 350, 40, "#1c1c1c");
    g.beginPath(); g.moveTo(115, 260); g.lineTo(240, 260); g.stroke();
    g.strokeRect(240, 220, 150, 80); hand("RELAY", 255, 275, 40, "#1c1c1c");
    g.beginPath(); g.moveTo(390, 260); g.lineTo(470, 260); g.lineTo(500, 235); g.moveTo(520, 260); g.lineTo(600, 260); g.stroke();
    hand("master", 455, 215, 34, "#1c1c1c");
    g.strokeRect(600, 220, 140, 80); hand("BUS", 630, 275, 44, "#1c1c1c");
    g.beginPath(); g.moveTo(740, 260); g.lineTo(840, 260); g.stroke();
    g.beginPath(); g.arc(890, 260, 50, 0, Math.PI * 2); g.stroke(); hand("M", 872, 276, 46, "#1c1c1c");
    hand("starter", 850, 350, 38, "#1c1c1c");
    g.strokeStyle = "#c0261d"; g.lineWidth = 7;
    g.beginPath(); g.ellipse(200, 260, 70, 55, 0, 0, Math.PI * 2); g.stroke();
    hand("kendor?!", 120, 420, 50, "#c0261d");
    hand("V = Vs − I · R", 70, 560, 70, "#1F3A8A");
    hand("I starter besar → drop tegangan besar", 70, 640, 46, "#1F3A8A");
    hand("Tes #3 gagal → cek terminal relay baterai", 70, 720, 46, "#1c1c1c");
    hand("Malam ini:", 1080, 330, 54, "#1c1c1c");
    const items: [string, boolean][] = [["74-10-01 magneto kiri", false], ["74-10-02 magneto kanan", false], ["71-20-03 engine mount", true], ["24-30-02 ulang torsi", false]];
    items.forEach(([t, done], i) => {
      const y = 400 + i * 70;
      g.strokeStyle = "#1c1c1c"; g.lineWidth = 5; g.strokeRect(1080, y - 34, 36, 36);
      if (done) { g.beginPath(); g.moveTo(1086, y - 16); g.lineTo(1098, y - 4); g.lineTo(1122, y - 42); g.stroke(); }
      hand(t, 1132, y, 40, "#1c1c1c");
    });
    hand("TORSI = PAKAI KUNCI TORSI, JANGAN CUMA CENTANG!", 60, 900, 52, "#c0261d");
  }), [fonts]);
  const markers: [number, number][] = [[-0.55, 0x1f3a8a], [-0.45, 0xc0261d], [-0.35, 0x1c1c1c]];
  return (
    <>
      <mesh position={[cx, cy, z]} receiveShadow userData={decor("", "Papan tulis shift malam")}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={map} roughness={0.22} metalness={0} />
      </mesh>
      <group ref={solid}>
        <Box size={[W + 0.04, 0.025, 0.03]} position={[cx, cy + H / 2, z]} material={M.steel} />
        <Box size={[W + 0.04, 0.025, 0.03]} position={[cx, cy - H / 2, z]} material={M.steel} />
        <Box size={[0.025, H, 0.03]} position={[cx - W / 2, cy, z]} material={M.steel} />
        <Box size={[0.025, H, 0.03]} position={[cx + W / 2, cy, z]} material={M.steel} />
        <Box size={[0.5, 0.03, 0.07]} position={[cx - 0.4, cy - H / 2 - 0.02, z + 0.04]} material={M.steel} />
      </group>
      {markers.map(([x, color]) => (
        <mesh key={x} position={[cx + x + 0.05, cy - H / 2, z + 0.05]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.12, 10]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

/** Troli alat di samping firewall dan APAR di pojok. */
function Trolley() {
  const fonts = useCanvasFonts();
  const tx = 1.65, tz = -1.25;
  const ex = ROOM.minX + 0.4, ez = BACK + 0.3;
  const lineMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5a110d, roughness: 0.5 }), []);
  const sign = useMemo(() => canvasTexture(256, 256, (g) => {
    g.fillStyle = "#b3261e"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#fff"; g.font = '700 80px "IBM Plex Sans Condensed", sans-serif'; g.textAlign = "center"; g.fillText("APAR", 128, 150);
  }), [fonts]);
  return (
    <>
      <Box ref={solid} size={[0.62, 0.78, 0.44]} position={[tx, 0.47, tz]} material={M.redPaint} userData={decor("", "Troli alat")} />
      {[0.3, 0.48, 0.66].map((y) => <Box key={y} size={[0.6, 0.006, 0.006]} position={[tx, y, tz + 0.222]} material={lineMat} />)}
      <Rod a={V(tx - 0.33, 0.6, tz - 0.18)} b={V(tx - 0.33, 0.6, tz + 0.18)} r={0.012} material={M.steel} />
      {[[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]].map(([dx, dz], i) => (
        <mesh key={i} position={[tx + dx!, 0.04, tz + dz!]} rotation-x={Math.PI / 2} material={M.rubber} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 14]} />
        </mesh>
      ))}
      <mesh ref={solid} position={[ex, 0.3, ez]} material={M.redPaint} castShadow userData={decor("", "APAR (alat pemadam api ringan)")}>
        <cylinderGeometry args={[0.085, 0.085, 0.52, 24]} />
      </mesh>
      <Box size={[0.06, 0.08, 0.06]} position={[ex, 0.6, ez]} material={M.rubber} />
      <mesh position={[ex, 1.25, BACK + 0.01]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshStandardMaterial map={sign} roughness={0.5} />
      </mesh>
    </>
  );
}

/** Lampu meja kerja di dinding: armatur + tabung menyala sesuai daya (lumen). Cahayanya di Lights.tsx. */
export const BENCH_LAMP = { pos: V(-1.4, 2.4, BACK + 0.45), aim: V(-1.4, 0.9, BACK + 0.1) };
function BenchLampFixture() {
  const benchLm = useGame((s) => s.lights.benchLm);
  const q = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(BENCH_LAMP.pos);
    o.lookAt(BENCH_LAMP.aim);
    return o.quaternion.clone();
  }, []);
  return (
    <>
      <group ref={solid} position={BENCH_LAMP.pos} quaternion={q}>
        <mesh material={M.darkSteel} receiveShadow><boxGeometry args={[0.5, 0.08, 0.06]} /></mesh>
        <mesh position-z={0.031}>
          <planeGeometry args={[0.46, 0.05]} />
          <meshStandardMaterial color={0x000000} emissive={0xfff1dc} emissiveIntensity={benchLm / 40} />
        </mesh>
      </group>
      <Rod a={V(-1.4, 2.4, BACK)} b={V(-1.4, 2.4, BACK + 0.42)} r={0.012} material={M.darkSteel} />
    </>
  );
}

export function Workshop() {
  return (
    <>
      <Workbench />
      <ShadowBoard />
      <Whiteboard />
      <Trolley />
      <BenchLampFixture />
    </>
  );
}
