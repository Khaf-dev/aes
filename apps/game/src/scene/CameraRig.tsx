/** Kamera orbit yang tetap di dalam ruangan dan tidak menembus benda padat. */
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { ROOM, solids, V } from "./shared.ts";

export const HOME_POS = V(2.0, 1.6, 2.5);
export const HOME_TARGET = V(0.2, 0.95, 0.25);
const CAM_MARGIN = 0.3;
const CAM_MIN_Y = 0.18;

const roomBox = new THREE.Box3(
  V(ROOM.minX + CAM_MARGIN, CAM_MIN_Y, ROOM.minZ + CAM_MARGIN),
  V(ROOM.maxX - CAM_MARGIN, ROOM.height - 0.5, ROOM.maxZ - CAM_MARGIN),
);
const targetBox = new THREE.Box3(V(ROOM.minX + 0.8, 0.3, ROOM.minZ + 0.8), V(ROOM.maxX - 0.8, 2.4, ROOM.maxZ - 0.8));

type Orbit = { target: THREE.Vector3; update(): void };

/** Kontrol kamera yang dipanggil dari keyboard/toolbar. */
export const cameraApi = { reset: () => {} };

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useRef<Orbit>(null);
  const closeup = useGame((s) => s.closeup);
  const torqueMode = useGame((s) => s.torqueMode);
  const spin = useGame((s) => s.spin);
  const boxes = useRef<THREE.Box3[]>([]);
  const frame = useRef(0);
  const tmp = useMemo(() => ({ ray: new THREE.Ray(), dir: new THREE.Vector3(), hit: new THREE.Vector3() }), []);

  useEffect(() => {
    controls.current?.target.copy(HOME_TARGET);
    cameraApi.reset = () => {
      camera.position.copy(HOME_POS);
      controls.current?.target.copy(HOME_TARGET);
      controls.current?.update();
    };
  }, [camera]);

  // Mode kunci torsi: scroll menyetel thimble, bukan zoom
  useEffect(() => {
    if (!torqueMode) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      useGame.getState().stepSetting(e.deltaY < 0 ? 5 : -5);
    };
    gl.domElement.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => gl.domElement.removeEventListener("wheel", onWheel, { capture: true });
  }, [gl, torqueMode]);

  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || useGame.getState().closeup) return;
    // Kotak benda padat dihitung ulang berkala: part bisa berpindah (meja ↔ mesin)
    if (frame.current++ % 30 === 0) {
      boxes.current = [...solids].map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.06));
    }
    targetBox.clampPoint(orbit.target, orbit.target);
    roomBox.clampPoint(camera.position, camera.position);
    // Dorong kamera keluar dari benda padat, menjauh dari titik fokus
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of boxes.current) {
        if (!b.containsPoint(camera.position)) continue;
        tmp.dir.subVectors(camera.position, orbit.target);
        if (tmp.dir.lengthSq() < 1e-6) tmp.dir.set(0, 0, 1);
        tmp.dir.normalize();
        tmp.ray.set(camera.position, tmp.dir);
        if (tmp.ray.intersectBox(b, tmp.hit)) { camera.position.copy(tmp.hit).addScaledVector(tmp.dir, 0.01); moved = true; }
      }
      roomBox.clampPoint(camera.position, camera.position);
      if (!moved) break;
    }
  });

  return (
    <OrbitControls
      ref={controls as never} makeDefault enabled={!closeup} enableDamping autoRotate={spin && !closeup} autoRotateSpeed={0.9}
      minDistance={0.35} maxDistance={6.5} minPolarAngle={0.05} maxPolarAngle={Math.PI * 0.94}
    />
  );
}
