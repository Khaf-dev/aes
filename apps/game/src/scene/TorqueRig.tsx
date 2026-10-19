/**
 * Kunci torsi 3D (tool.torque-wrench.40-200 dari asset pipeline) + kamera close-up hybrid.
 * Titik asal model = pusat square drive, gagang ke -y lokal, drive ke -z lokal. Socket 3/8 in dipasang di drive.
 */
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { tick } from "../logic/clickWrench.ts";
import { PAD_FACE_X, partDef } from "../data/parts.ts";
import { pull, useGame, type NutRef } from "../state/store.ts";
import { CLOSEUP_LAYER, closeupDom, M, nutKey, PART_TABLE, rig, V } from "./shared.ts";

/** Bagian OrbitControls yang dipakai di sini (drei memasangnya sebagai kontrol default). */
type Orbit = { target: THREE.Vector3; enabled: boolean; update(): void };

const X_AXIS = V(1, 0, 0);
const deg = THREE.MathUtils.degToRad;

/** Saat dipakai: socket (-z lokal) masuk ke mur ke arah -x dunia, gagang (-y lokal) keluar ke +z dan sedikit turun. */
const IN_USE = (() => {
  const z = V(1, 0, 0);
  const y = V(0, 0.3, -0.95).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();
/** Saat tidak dipakai: rebah di meja part, drive menghadap atas, gagang ke +x. */
const AT_REST = (() => {
  const y = V(-1, 0, 0), z = V(0, -1, 0);
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();
const REST_POS = V(0.09, PART_TABLE.top + 0.02, PART_TABLE.z - 0.12);

/** Pusat mur di koordinat lokal mesin, dari data pad. */
function nutLocal({ part, index }: NutRef) {
  const { pad } = partDef(part);
  return V(PAD_FACE_X + pad.nutX, pad.y, pad.z + (pad.studs[index] ?? 0));
}

export function TorqueRig() {
  const gltf = useGLTF("/tools/tool.torque-wrench.40-200.glb");
  const metaText = useLoader(THREE.FileLoader, "/tools/tool.torque-wrench.40-200.meta.json") as string;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as Orbit | null;
  const wrenchAt = useGame((s) => s.wrenchAt);
  const closeup = useGame((s) => s.closeup);

  const wrench = useMemo(() => {
    const g = new THREE.Group();
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.035, 16), M.darkSteel);
    socket.position.z = -0.0375;
    socket.rotation.x = Math.PI / 2;
    g.add(socket, gltf.scene.clone(true));
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      o.layers.enable(CLOSEUP_LAYER);
    });
    return g;
  }, [gltf]);

  useEffect(() => {
    scene.add(wrench);
    rig.wrench = wrench;
    rig.wrenchScaleEdge.fromArray(JSON.parse(metaText).attachPoints.scaleEdge.position);
    const raycaster = new THREE.Raycaster();
    rig.hitWrench = (x, y) => {
      const r = gl.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      return raycaster.intersectObject(wrench, true).length > 0;
    };
    return () => { scene.remove(wrench); rig.wrench = null; };
  }, [scene, wrench, metaText, gl, camera]);

  // Posisi kunci: menutup mur (ujung socket 55 mm dari drive, muka mur 4 mm di depan pusatnya) atau rebah di meja
  useEffect(() => {
    if (wrenchAt && rig.engine) {
      rig.engine.updateMatrixWorld(true);
      wrench.position.copy(rig.engine.localToWorld(nutLocal(wrenchAt).add(V(0.051, 0, 0))));
      wrench.quaternion.copy(IN_USE);
    } else {
      wrench.position.copy(REST_POS);
      wrench.quaternion.copy(AT_REST);
    }
  }, [wrenchAt, wrench]);

  // Kamera close-up: lurus di sumbu stud (dari +x), digulung supaya gagang mendatar ke kiri.
  // Hanya layer close-up yang dirender, jadi badan mesin tidak menutupi kunci.
  useEffect(() => {
    if (!closeup) return;
    const key = nutKey(closeup.part, closeup.index);
    const shown = [rig.nuts.get(key), rig.studs.get(key), rig.pads.get(closeup.part)].filter((o) => o !== undefined);
    scene.traverse((o) => { if ((o as THREE.Light).isLight) o.layers.enable(CLOSEUP_LAYER); });
    shown.forEach((o) => o.layers.enable(CLOSEUP_LAYER));
    const saved = { pos: camera.position.clone(), target: controls?.target.clone() ?? null };
    if (controls) controls.enabled = false;

    wrench.updateMatrixWorld(true);
    const center = wrench.localToWorld(V(0, -0.13, 0));
    const handle = V(0, -1, 0).applyQuaternion(wrench.quaternion);
    const forward = V(-1, 0, 0);
    camera.up.crossVectors(forward, handle).normalize();
    const halfTan = Math.tan(deg(camera.fov / 2));
    const dist = Math.max(0.25, 0.5 / (2 * halfTan * camera.aspect)); // lebar pandang ~50 cm: kunci 29 cm + ruang overlay
    camera.position.copy(center).addScaledVector(forward, -dist);
    camera.lookAt(center);
    camera.layers.set(CLOSEUP_LAYER);

    return () => {
      shown.forEach((o) => o.layers.disable(CLOSEUP_LAYER));
      camera.layers.set(0);
      camera.up.set(0, 1, 0);
      camera.position.copy(saved.pos);
      if (controls && saved.target) {
        controls.target.copy(saved.target);
        controls.enabled = true;
        controls.update();
      }
      wrench.quaternion.copy(IN_USE);
    };
  }, [closeup, camera, controls, scene, wrench]);

  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const game = useGame.getState();
    if (!game.closeup) return;
    const before = pull.state;
    pull.state = tick(before, Math.min(dt, 0.05), pull.holding, game.setting);
    if (pull.state.seated && !before.seated) game.setCloseupStatus("Mur duduk. Terus tarik sampai klik.");

    // Kunci dan mur berputar searah jarum jam dilihat dari ujung stud (ulir kanan mengencang)
    wrench.quaternion.setFromAxisAngle(X_AXIS, -deg(pull.state.wrenchAng)).multiply(IN_USE);
    const nut = rig.nuts.get(nutKey(game.closeup.part, game.closeup.index));
    if (nut && pull.state.nutAng !== before.nutAng) nut.rotateOnWorldAxis(X_AXIS, -deg(pull.state.nutAng - before.nutAng));

    // Overlay: cap KLIK dan garis penunjuk dari tepi skala di barrel 3D ke kaca pembesar
    if (closeupDom.klik) closeupDom.klik.style.opacity = pull.state.klik.toFixed(2);
    if (closeupDom.lead && closeupDom.dot && closeupDom.loupe) {
      wrench.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      wrench.localToWorld(projected.copy(rig.wrenchScaleEdge)).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      const sx = r.left + ((projected.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - projected.y) / 2) * r.height;
      const box = closeupDom.loupe.getBoundingClientRect();
      closeupDom.lead.setAttribute("x1", String(sx));
      closeupDom.lead.setAttribute("y1", String(sy));
      closeupDom.lead.setAttribute("x2", String(box.left + box.width * 0.3));
      closeupDom.lead.setAttribute("y2", String(box.top < sy ? box.bottom : box.top));
      closeupDom.dot.setAttribute("cx", String(sx));
      closeupDom.dot.setAttribute("cy", String(sy));
    }
  });

  return null;
}
