/**
 * Pencahayaan dalam satuan fisik: lampu kerja (lumen), cahaya lingkungan (lux), falloff kuadrat jarak (decay 2),
 * plus headlamp mekanik yang menempel di kepala (kamera).
 */
import { Environment } from "@react-three/drei";
import { createPortal, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { exposureFromSlider, LAMP_AIM, LAMP_POS } from "./shared.ts";

// 280 lm = output maksimum headlamp kerja (sumber: aio.lv, lembar produk GP Discovery CHW53).
// Sudut sorot dan tinggi dahi = placeholder, belum bersumber (dicatat di GDD).
const HEADLAMP_LM = 280;
const HEADLAMP_ANGLE = THREE.MathUtils.degToRad(25);

/** Peta lingkungan untuk pantulan: lantai tersorot (hangat), lampu, dan langit malam di pintu. */
function EnvGlow() {
  const glow = (rgb: [number, number, number]) => <meshBasicMaterial color={new THREE.Color().setRGB(...rgb)} side={THREE.DoubleSide} />;
  return (
    <Environment frames={1} resolution={128} background={false}>
      <color attach="background" args={[0.01, 0.012, 0.016]} />
      <mesh position={[0, -1.2, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[2.2, 32]} />{glow([9, 6.5, 4.2])}</mesh>
      <mesh position={[3, 0.4, -3]} rotation-y={-0.8}><planeGeometry args={[2.5, 2.8]} />{glow([0.35, 0.45, 0.75])}</mesh>
      <mesh position={[-1.2, 1.3, 1.4]} rotation-y={0.6}><planeGeometry args={[0.5, 0.35]} />{glow([60, 45, 30])}</mesh>
    </Environment>
  );
}

function objectAt(p: THREE.Vector3) {
  const o = new THREE.Object3D();
  o.position.copy(p);
  return o;
}

export function Lights() {
  const { lampLm, ambientLux, exposure, shadows, headlamp } = useGame((s) => s.lights);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const lampTarget = useMemo(() => objectAt(LAMP_AIM), []);
  const headTarget = useMemo(() => objectAt(new THREE.Vector3(0, 0, -1)), []);

  // Lampu yang menempel di kamera hanya ikut dihitung kalau kamera ada di scene graph
  useEffect(() => {
    scene.add(camera);
    return () => { scene.remove(camera); };
  }, [scene, camera]);
  useEffect(() => { gl.toneMappingExposure = exposureFromSlider(exposure); }, [gl, exposure]);
  useEffect(() => { scene.environmentIntensity = lampLm / 4000; }, [scene, lampLm]);
  useEffect(() => {
    gl.shadowMap.enabled = shadows;
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.needsUpdate = true;
    });
  }, [gl, scene, shadows]);

  return (
    <>
      <color attach="background" args={["#05070b"]} />
      <fogExp2 attach="fog" args={["#05070b", 0.03]} />
      <EnvGlow />
      <primitive object={lampTarget} />
      <spotLight
        position={LAMP_POS} target={lampTarget} color={0xffd2a0} power={lampLm}
        angle={0.62} penumbra={0.55} decay={2} distance={0}
        castShadow={shadows} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-near={0.3} shadow-camera-far={14}
      />
      <directionalLight position={[6, 5, -3]} color={0x9fb4e0} intensity={ambientLux} />
      <hemisphereLight args={[0x9fb4e0, 0x1a1712]} intensity={ambientLux * 0.6} />
      {createPortal(
        <>
          <primitive object={headTarget} />
          {/* power 0 alih-alih unmount: jumlah lampu tetap, shader tidak dikompilasi ulang saat ditoggle */}
          <spotLight position={[0, 0.06, 0]} target={headTarget} color={0xfff4e6} power={headlamp ? HEADLAMP_LM : 0}
            angle={HEADLAMP_ANGLE} penumbra={0.5} decay={2} distance={0} />
        </>,
        camera,
      )}
    </>
  );
}
