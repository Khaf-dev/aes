/**
 * Kunci torsi 3D (tool.torque-wrench.40-200 dari asset pipeline) + kamera close-up hybrid.
 * Titik asal model = pusat square drive, gagang ke -y lokal, drive ke -z lokal. Socket 3/8 in dipasang di drive.
 */
import { useGLTF } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { tick } from "../logic/clickWrench.ts";
import { partDef } from "../data/parts.ts";
import { pull, useGame, type NutRef } from "../state/store.ts";
import { CLOSEUP_LAYER, closeupDom, M, nutKey, padFrame, padPoint, rig, toBoard, V } from "./shared.ts";


const deg = THREE.MathUtils.degToRad;

/** Saat dipakai (bingkai pad): socket (-z lokal) masuk ke mur ke arah -x, gagang (-y lokal) keluar ke +z dan sedikit turun. */
const IN_USE = (() => {
  const z = V(1, 0, 0);
  const y = V(0, 0.3, -0.95).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();
/** Saat tidak dipakai: tergantung di slotnya di shadow board, kepala di atas. */
const REST_POS = toBoard(977, 190).add(V(0, 0, 0.03));

/** Pusat mur di koordinat lokal mesin, dari data pad. */
function nutLocal({ part, index }: NutRef) {
  const { pad } = partDef(part);
  const [y, z] = pad.studs[index] ?? [0, 0];
  return padPoint(pad, pad.nutX, y, z);
}
/** Pose kunci saat dipakai di mur ini: IN_USE diputar ke bingkai pad. */
const inUse = (at: NutRef) => padFrame(partDef(at.part).pad).q.multiply(IN_USE);

export function TorqueRig() {
  const gltf = useGLTF("/tools/tool.torque-wrench.40-200.glb");
  const metaText = useLoader(THREE.FileLoader, "/tools/tool.torque-wrench.40-200.meta.json") as string;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
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

  // Posisi kunci: menutup mur (ujung socket 55 mm dari drive, muka mur 4 mm di depan pusatnya) atau di shadow board
  useEffect(() => {
    if (wrenchAt && rig.engine) {
      rig.engine.updateMatrixWorld(true);
      const { normal } = padFrame(partDef(wrenchAt.part).pad);
      wrench.position.copy(rig.engine.localToWorld(nutLocal(wrenchAt).addScaledVector(normal, 0.051)));
      wrench.quaternion.copy(inUse(wrenchAt));
    } else {
      wrench.position.copy(REST_POS);
      wrench.quaternion.identity();
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
    // Pandangan dikembalikan persis seperti sebelum close-up (kamera jalan maupun orbit); OrbitControls diatur CameraRig
    const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone() };

    wrench.updateMatrixWorld(true);
    const center = wrench.localToWorld(V(0, -0.13, 0));
    const handle = V(0, -1, 0).applyQuaternion(wrench.quaternion);
    const forward = padFrame(partDef(closeup.part).pad).normal.negate(); // lurus di sumbu stud, menghadap ke pad
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
      camera.quaternion.copy(saved.quat);
      wrench.quaternion.copy(inUse(closeup));
    };
  }, [closeup, camera, scene, wrench]);

  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const game = useGame.getState();
    if (!game.closeup) return;
    const before = pull.state;
    pull.state = tick(before, Math.min(dt, 0.05), pull.holding, game.setting);
    if (pull.state.seated && !before.seated) game.setCloseupStatus("Mur duduk. Terus tarik sampai klik.");

    // Kunci dan mur berputar searah jarum jam dilihat dari ujung stud (ulir kanan mengencang)
    const axis = padFrame(partDef(game.closeup.part).pad).normal;
    wrench.quaternion.setFromAxisAngle(axis, -deg(pull.state.wrenchAng)).multiply(inUse(game.closeup));
    const nut = rig.nuts.get(nutKey(game.closeup.part, game.closeup.index));
    if (nut && pull.state.nutAng !== before.nutAng) nut.rotateOnWorldAxis(axis, -deg(pull.state.nutAng - before.nutAng));

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
