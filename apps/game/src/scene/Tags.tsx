/**
 * Tag inspeksi gantung: kuning = langkah aktif, hijau = sudah di-sign-off (bukan tanda pekerjaan benar).
 * Berayun pelan, kecuali pengguna memilih gerak dikurangi.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { canvasTexture, NO_RAYCAST, V } from "./shared.ts";
import { useCanvasFonts } from "./Workshop.tsx";
import { useGame } from "../state/store.ts";

interface TagDef {
  code: string; name: string; line: string; color: string; initials?: string;
  anchor: THREE.Vector3; length: number; yaw: number;
}
const TAGS: TagDef[] = [
  { code: "74-10-01", name: "MAGNETO KIRI", line: "Pasang di pad ini", color: "#E8C547", anchor: V(0.53, 1.24, 0.24), length: 0.1, yaw: 0.55 },
  { code: "74-10-02", name: "MAGNETO KANAN", line: "Pasang di pad ini", color: "#E8C547", anchor: V(0.56, 1.25, -0.25), length: 0.1, yaw: -0.55 },
  { code: "80-10-01", name: "STARTER", line: "Pasang di pad ini", color: "#E8C547", anchor: V(0.6, 0.98, -0.2), length: 0.06, yaw: -0.4 },
  { code: "24-30-05", name: "ALTERNATOR", line: "Pasang di pad ini", color: "#E8C547", anchor: V(0.6, 0.98, 0.21), length: 0.06, yaw: 0.4 },
  { code: "71-20-03", name: "ENGINE MOUNT", line: "Sign-off", color: "#94C474", initials: "RK", anchor: V(0.69, 1.25, 0.24), length: 0.2, yaw: 0.55 },
];
const W = 0.15, H = (W * 300) / 512;
const shape = (g: CanvasRenderingContext2D) => {
  g.beginPath();
  g.moveTo(40, 0); g.lineTo(472, 0); g.lineTo(512, 40); g.lineTo(512, 300); g.lineTo(0, 300); g.lineTo(0, 40); g.closePath();
};
const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Tag({ tag: base, phase }: { tag: TagDef; phase: number }) {
  const fonts = useCanvasFonts();
  // Tag langkah berubah hijau setelah task card-nya di-sign-off (tanda tangan, bukan tanda pekerjaan benar)
  const signed = useGame((s) => s.rakit.signoff[base.code]?.signed ?? false);
  const tag = useMemo(() => (signed ? { ...base, color: "#94C474", line: "Sign-off", initials: "RK" } : base), [base, signed]);
  const pivot = useRef<THREE.Group>(null);
  const { material, depth, line } = useMemo(() => {
    const map = canvasTexture(512, 300, (g) => {
      g.fillStyle = tag.color; shape(g); g.fill();
      g.fillStyle = "#1E1C19";
      g.font = '700 64px "Courier Prime", monospace'; g.fillText(tag.code, 34, 132);
      g.font = '700 40px "Courier Prime", monospace'; g.fillText(tag.name, 34, 190);
      g.font = '400 36px "Courier Prime", monospace'; g.fillText(tag.line, 34, 246);
      if (tag.initials) { g.fillStyle = "#1F3A8A"; g.font = '700 84px "Caveat", cursive'; g.fillText(tag.initials, 380, 262); }
    });
    const alphaMap = canvasTexture(512, 300, (g) => {
      g.fillStyle = "#000"; g.fillRect(0, 0, 512, 300);
      g.fillStyle = "#fff"; shape(g); g.fill();
      g.fillStyle = "#000"; g.beginPath(); g.arc(256, 34, 14, 0, Math.PI * 2); g.fill(); // lubang tali
    }, false);
    return {
      material: new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }),
      depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap, alphaTest: 0.5 }),
      line: new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, -tag.length, 0)]),
    };
  }, [tag, fonts]);
  useFrame(({ clock }) => {
    if (!reduceMotion && pivot.current) pivot.current.rotation.z = Math.sin(clock.elapsedTime * 1.3 + phase) * 0.05;
  });
  return (
    <group ref={pivot} position={tag.anchor} rotation-y={tag.yaw}>
      <mesh position-y={-tag.length - H / 2 + 0.01} material={material} customDepthMaterial={depth} castShadow receiveShadow
        userData={{ pick: { kind: "decor", code: tag.code, name: tag.name }, thin: true }}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <lineSegments geometry={line} raycast={NO_RAYCAST}><lineBasicMaterial color={0xb9a57a} /></lineSegments>
    </group>
  );
}

export function Tags() {
  return <>{TAGS.map((t, i) => <Tag key={t.code} tag={t} phase={i * 1.7} />)}</>;
}
