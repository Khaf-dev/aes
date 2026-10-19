/**
 * Satu titik masuk hover/klik untuk seluruh benda di hanggar. Tiap mesh membawa `userData.pick`;
 * mesh tanpa pick tetap menghalangi (benda padat). Klik = tekan-lepas tanpa banyak bergeser.
 */
import type { ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { useGame } from "../state/store.ts";
import { exposureFromSlider, isShown, pickOf, rig, setHighlight, type Pick } from "./shared.ts";

const CLICK_SLOP_PX = 6;

/** "skip" = tembus ke benda di belakangnya, "block" = menghalangi tanpa aksi. */
function judge(o: THREE.Object3D): Pick | "skip" | "block" {
  if (!isShown(o)) return "skip";
  const g = useGame.getState();
  if (g.closeup) return "block";
  const pick = pickOf(o);
  // Lensa x-ray: hanya komponen dalam mesin yang bisa dipilih, kulit mesin ditembus
  if (g.lensOn) return pick?.kind === "internal" && g.lensOverEngine ? pick : "skip";
  // Mode torsi: part dan kunci tidak menutupi mur kecil di telinga flange
  if (g.torqueMode && !g.rakit.held && (pick?.kind === "part" || pick?.kind === "tool")) return "skip";
  return pick ?? "block";
}

function act(pick: Pick) {
  const g = useGame.getState();
  if (g.lensOn) return; // lensa hanya untuk melihat
  if (g.torqueMode && !g.rakit.held) {
    if (pick.kind === "nut") g.openCloseup({ part: pick.part, index: pick.index });
    return;
  }
  if (g.rakit.held) {
    if (pick.kind === "pad") g.installOnPad(pick.part);
    return;
  }
  if (pick.kind === "stud") g.clickStud({ part: pick.part, index: pick.index });
  else if (pick.kind === "nut") g.clickNut({ part: pick.part, index: pick.index });
  else if (pick.kind === "part") g.pickUp(pick.part);
}

export function Interact({ children }: { children: React.ReactNode }) {
  const hovered = useRef<THREE.Object3D | null>(null);

  const setHovered = (o: THREE.Object3D | null, pick: Pick | null) => {
    const g = useGame.getState();
    if (o !== hovered.current) {
      const exposure = exposureFromSlider(g.lights.exposure);
      if (hovered.current) setHighlight(hovered.current, false, exposure);
      if (o && pick && pick.kind !== "decor") setHighlight(o, true, exposure);
      hovered.current = o;
    }
    g.setHover(pick && (pick.name || pick.code) ? { code: pick.code || "HANGGAR", name: pick.name } : null);
    // Saat memegang part: bayangan pemasangan biru bila kursor di pad yang cocok
    const held = g.rakit.held;
    const ghostMat = held ? (rig.ghosts.get(held)?.userData.material as THREE.MeshBasicMaterial | undefined) : undefined;
    ghostMat?.color.setHex(pick?.kind === "pad" && pick.part === held ? 0x3d8bff : 0xf2b45c);
    // Mode torsi: kunci pindah ke mur yang sedang ditunjuk
    if (g.torqueMode && !held && pick?.kind === "nut" && (g.wrenchAt?.part !== pick.part || g.wrenchAt.index !== pick.index)) {
      g.aimWrench({ part: pick.part, index: pick.index });
    }
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const verdict = judge(e.object);
    if (verdict === "skip") return;
    e.stopPropagation();
    setHovered(e.object, verdict === "block" ? null : verdict);
  };
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (e.object === hovered.current) setHovered(null, null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP_PX) return;
    const verdict = judge(e.object);
    if (verdict === "skip") return;
    e.stopPropagation();
    if (verdict !== "block") act(verdict);
    setHovered(null, null);
  };

  return (
    <group onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick}>
      {children}
    </group>
  );
}
