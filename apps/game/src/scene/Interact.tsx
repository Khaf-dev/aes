/**
 * Satu titik masuk hover/klik untuk seluruh benda di hanggar. Tiap mesh membawa `userData.pick`;
 * mesh tanpa pick tetap menghalangi (benda padat). Klik = tekan-lepas tanpa banyak bergeser.
 */
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { aimLocked } from "./CameraRig.tsx";
import { exposureFromSlider, isShown, pickOf, rig, setHighlight, type Pick } from "./shared.ts";

const CLICK_SLOP_PX = 6;
const FASTENER_REACH = 0.15; // m di belakang permukaan badan part
const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);

/** "skip" = tembus ke benda di belakangnya, "block" = menghalangi tanpa aksi. */
function judge(o: THREE.Object3D): Pick | "skip" | "block" {
  if (!isShown(o) || o.userData.faded) return "skip";
  const g = useGame.getState();
  if (g.closeup) return "block";
  const pick = pickOf(o);
  // Lensa x-ray: hanya komponen dalam mesin yang bisa dipilih, kulit mesin ditembus
  if (g.lensOn) return pick?.kind === "internal" && g.lensOverEngine ? pick : "skip";
  // Mode torsi: part dan kunci tidak menutupi mur kecil di telinga flange
  if ((g.torqueMode || g.wireMode) && !g.rakit.held && (pick?.kind === "part" || pick?.kind === "tool")) return "skip";
  return pick ?? "block";
}

function isThin(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (o.userData.thin) return true;
  return false;
}

function act(pick: Pick) {
  const g = useGame.getState();
  if (g.lensOn || g.wirePending) return; // lensa hanya untuk melihat; pilihan arah lilitan belum dijawab
  if (pick.kind === "bench" && !g.rakit.held) {
    g.openBench();
    return;
  }
  if (pick.kind === "taskcard" && !g.rakit.held) {
    g.openDocument(pick.stepId);
    return;
  }
  if (g.wireMode && !g.rakit.held) {
    if (pick.kind === "nut") g.wireClickNut({ part: pick.part, index: pick.index });
    return;
  }
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
  else if (pick.kind === "terminal") g.toggleCable(pick.part);
}

export function Interact({ children }: { children: React.ReactNode }) {
  const hovered = useRef<THREE.Object3D | null>(null);
  const hoveredPick = useRef<Pick | null>(null);

  const setHovered = (o: THREE.Object3D | null, pick: Pick | null) => {
    const g = useGame.getState();
    hoveredPick.current = pick;
    rig.hoveredObject = o;
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

  // R3F hanya mengirim satu irisan (terdekat) per grup handler, jadi benda yang "tembus" (part di mode torsi,
  // kulit mesin di lensa x-ray) dilewati dengan raycast sendiri di sepanjang sinar event.
  const root = useRef<THREE.Group>(null);
  const pointer = useThree((s) => s.pointer);
  const camera = useThree((s) => s.camera);
  const resolve = () => {
    if (!root.current) return null;
    // Sinar dari posisi kursor terakhir (sama untuk hover dan klik), bukan sinar bawaan event klik
    raycaster.setFromCamera(aimLocked() ? CENTER : pointer, camera);
    // Benda tipis (batang engine mount/stand, tag kertas) tidak menutupi part interaktif di belakangnya; labelnya tetap muncul bila tidak ada
    let thin: { object: THREE.Object3D; pick: Pick | null } | null = null;
    const hits = raycaster.intersectObject(root.current, true);
    for (const [i, hit] of hits.entries()) {
      const verdict = judge(hit.object);
      if (verdict === "skip") continue;
      const pick = verdict === "block" ? null : verdict;
      if (isThin(hit.object)) { thin ??= { object: hit.object, pick }; continue; }
      if (thin && (!pick || pick.kind === "decor")) return thin;
      // Stud/mur yang tertutup badan part-nya sendiri tetap bisa diklik (kalau tidak, klik malah melepas part)
      if (pick?.kind === "part" && useGame.getState().rakit.parts[pick.part] === "installed") {
        const fastener = hits.slice(i + 1).find((h) => {
          const p = pickOf(h.object);
          return h.distance - hit.distance < FASTENER_REACH && (p?.kind === "stud" || p?.kind === "nut") && p.part === pick.part && judge(h.object) !== "skip";
        });
        if (fastener) return { object: fastener.object, pick: pickOf(fastener.object)! };
      }
      return { object: hit.object, pick };
    }
    return thin;
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (aimLocked()) return; // bidikan tengah layar diperbarui tiap frame
    const hit = resolve();
    setHovered(hit?.object ?? null, hit?.pick ?? null);
  };
  const onPointerOut = () => { if (!aimLocked()) setHovered(null, null); };
  // Kursor terkunci: yang ditunjuk = benda di titik tengah layar, berubah saat menoleh atau berjalan
  const tick = useRef(0);
  useFrame(() => {
    if (!aimLocked() || tick.current++ % 2) return;
    const hit = resolve();
    setHovered(hit?.object ?? null, hit?.pick ?? null);
  });
  // Klik = tekan-lepas tanpa banyak bergeser (drag dipakai kamera), dan berlaku untuk benda yang sedang di-hover.
  // Event klik R3F tidak dipakai: posisinya bisa berbeda dari hover terakhir.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let down: { x: number; y: number; locked: boolean } | null = null;
    const onDown = (e: PointerEvent) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY, locked: aimLocked() } : null; };
    // Saat terkunci, posisi kursor tidak berubah: geseran dihitung dari movementX/Y
    const onMove = (e: PointerEvent) => { if (down && aimLocked()) { down.x -= e.movementX; down.y -= e.movementY; } };
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      // Klik yang baru saja mengunci kursor tidak ikut berinteraksi; kalau browser menolak mengunci, klik tetap jalan
      const lockingClick = !down.locked && aimLocked();
      down = null;
      if (lockingClick) return;
      if (moved > CLICK_SLOP_PX) return;
      const pick = hoveredPick.current;
      setHovered(null, null);
      if (pick) act(pick);
    };
    gl.domElement.addEventListener("pointerdown", onDown);
    gl.domElement.addEventListener("pointermove", onMove);
    gl.domElement.addEventListener("pointerup", onUp);
    return () => {
      gl.domElement.removeEventListener("pointerdown", onDown);
      gl.domElement.removeEventListener("pointermove", onMove);
      gl.domElement.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  return (
    <group ref={root} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
      {children}
    </group>
  );
}
