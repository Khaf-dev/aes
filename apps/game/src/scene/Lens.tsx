/** Lensa x-ray: posisi lingkaran kursor ke shader kulit mesin, aktif hanya saat kursor di atas mesin. */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { aimLocked } from "./CameraRig.tsx";
import { LENS_RADIUS, lensUniform, rig } from "./shared.ts";

export function Lens() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const mouse = useThree((s) => s.pointer);
  const center = useMemo(() => new THREE.Vector2(0, 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  useFrame(() => {
    const g = useGame.getState();
    if (!g.lensOn || g.closeup || !rig.engine) {
      lensUniform.value.w = 0;
      return;
    }
    const pointer = aimLocked() ? center : mouse; // kursor terkunci: lensa di titik bidik tengah layar
    raycaster.setFromCamera(pointer, camera);
    const over = raycaster.intersectObject(rig.engine, true).length > 0;
    if (over !== g.lensOverEngine) useGame.setState({ lensOverEngine: over });
    const dpr = gl.getPixelRatio();
    const r = gl.domElement.getBoundingClientRect();
    // pointer R3F dalam NDC; shader memakai gl_FragCoord (piksel framebuffer, asal kiri bawah)
    lensUniform.value.set(((pointer.x + 1) / 2) * r.width * dpr, ((pointer.y + 1) / 2) * r.height * dpr, LENS_RADIUS * dpr, over ? 1 : 0);
  });
  return null;
}
