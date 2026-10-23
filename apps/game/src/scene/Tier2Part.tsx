/**
 * Part Tier 2 dari asset pipeline (GLB + meta.json, meter, Y-up; titik asal = pusat muka flange).
 * Satu objek dipindah antar induk (meja → tangan/kamera → mesin) dengan `attach`, lalu dianimasikan,
 * jadi transform dunianya mulus saat berpindah.
 */
import { useGLTF } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PartDef } from "../data/parts.ts";
import { useGame } from "../state/store.ts";
import { animate, padFrame, PART_TABLE, rig, solids, UP, V } from "./shared.ts";

interface PartMeta {
  readonly name: string;
  readonly boundingBox: { readonly min: readonly number[] };
  readonly attachPoints: { readonly mountFace: { readonly normal: readonly [number, number, number] } };
}

const INTO_ENGINE = V(-1, 0, 0); // bingkai pad: normal +x, jadi poros part masuk ke arah -x
const HELD_POSE = { p: V(0.17, -0.12, -0.55), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, -0.6, 0)) };

/** Rotasi `from` → `to`; untuk arah berlawanan putar di sumbu vertikal supaya part tidak terbalik. */
function alignQuat(from: THREE.Vector3, to: THREE.Vector3) {
  if (from.dot(to) < -0.999) return new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
  return new THREE.Quaternion().setFromUnitVectors(from, to);
}

export function Tier2Part({ def }: { def: PartDef }) {
  const model = def.model ?? def.assetId;
  const gltf = useGLTF(`/tier2/${model}.glb`);
  const meta = JSON.parse(useLoader(THREE.FileLoader, `/tier2/${model}.meta.json`) as string) as PartMeta;
  const camera = useThree((s) => s.camera);
  const status = useGame((s) => s.rakit.parts[def.assetId]);
  const first = useRef(true);

  const { root, ghost, seated, approach, rest } = useMemo(() => {
    const root = new THREE.Group();
    root.name = def.assetId;
    root.add(gltf.scene.clone(true));
    root.userData.pick = { kind: "part", part: def.assetId, code: def.pad.code, name: `${def.name} · ${meta.name}` };
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xf2b45c, transparent: true, opacity: 0.18, depthWrite: false });
    const ghost = new THREE.Group();
    ghost.userData.pick = { kind: "pad", part: def.assetId, code: def.pad.code, name: `Posisi ${def.name.toLowerCase()} · klik untuk memasang` };
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      const g = new THREE.Mesh(o.geometry, ghostMat);
      o.updateWorldMatrix(true, false);
      g.applyMatrix4(o.matrixWorld);
      ghost.add(g);
    });
    // Di bingkai pad poros part masuk ke -x; bingkai pad lalu diputar ke arah normal pad di mesin
    const frame = padFrame(def.pad);
    const q = frame.q.clone().multiply(alignQuat(V(...meta.attachPoints.mountFace.normal).normalize(), INTO_ENGINE));
    ghost.position.copy(frame.origin);
    ghost.quaternion.copy(q);
    ghost.visible = false;
    ghost.userData.material = ghostMat;
    return {
      root, ghost,
      seated: { p: frame.origin.clone(), q },
      approach: { p: frame.origin.clone().addScaledVector(frame.normal, 0.07), q },
      // Bagian bawah model menempel di alas kain meja part
      rest: { p: V(def.rest[0], PART_TABLE.top + 0.004 - meta.boundingBox.min[1]!, def.rest[1]), q: new THREE.Quaternion().setFromAxisAngle(UP, def.yaw) },
    };
  }, [gltf, meta, def]);

  useEffect(() => {
    rig.ghosts.set(def.assetId, ghost);
    rig.engine?.add(ghost);
    return () => { ghost.removeFromParent(); rig.ghosts.delete(def.assetId); };
  }, [ghost, def.assetId]);

  useEffect(() => {
    const engine = rig.engine, staging = rig.staging;
    if (!engine || !staging) return;
    const instant = first.current;
    first.current = false;
    ghost.visible = status === "held";
    solids.delete(root);
    if (status === "held") {
      camera.attach(root); // dipegang di depan kamera, sedikit ke kanan bawah
      animate(root, [{ ...HELD_POSE, dur: 0.35 }]);
    } else if (status === "installed") {
      engine.attach(root);
      animate(root, [{ ...approach, dur: 0.45 }, { ...seated, dur: 0.3 }], () => solids.add(root));
    } else {
      staging.attach(root);
      if (instant) { root.position.copy(rest.p); root.quaternion.copy(rest.q); solids.add(root); }
      else animate(root, [{ ...rest, dur: 0.45 }], () => solids.add(root));
    }
  }, [status, root, ghost, camera, seated, approach, rest]);

  useEffect(() => () => { root.removeFromParent(); solids.delete(root); }, [root]);
  return null;
}
