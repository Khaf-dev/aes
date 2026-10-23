/**
 * Kamera: badan engineer (first person, WASD + klik kanan untuk menoleh) sebagai mode utama,
 * plus orbit di sekitar benda untuk fokus (F) dan putar otomatis (P). Keduanya tetap di dalam ruangan
 * dan tidak menembus benda padat.
 */
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clampEye, EYE, move, SPEED, type Box } from "../logic/walk.ts";
import { useGame } from "../state/store.ts";
import { animate, fadeables, rig, ROOM, setFaded, solids, stopTween, V } from "./shared.ts";
import { TASK_CARDS } from "./Workshop.tsx";

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
export const cameraApi = { reset: () => {}, focus: () => {} };

const FOCUS_DIST = 0.45;
const LOOK_RAD_PER_PX = 0.0022;
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ", "KeyE"]);
/** Kamera tidak sedang dipakai mode lain (dokumen, close-up, laporan, dialog). */
export const cameraFree = () => {
  const g = useGame.getState();
  return !g.closeup && !g.document && !g.testSheet && !g.handbook && !g.wirePending;
};
/** Kursor sedang dikunci ke kanvas (bidik pakai titik tengah layar). */
export const aimLocked = () => document.pointerLockElement !== null;
/** Klik di kanvas akan mengunci kursor (bukan berinteraksi dengan benda). */
export const canLock = () => useGame.getState().camMode === "walk" && cameraFree();
// Semua task card terlihat sekaligus dari atas meja kerja
const BENCH_LOOK = TASK_CARDS.reduce((c, t) => c.add(t.position), V(0, 0, 0)).divideScalar(TASK_CARDS.length);
const BENCH_EYE = BENCH_LOOK.clone().add(V(0, 0.75, 0.32));

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useRef<Orbit>(null);
  const closeup = useGame((s) => s.closeup);
  const torqueMode = useGame((s) => s.torqueMode);
  const spin = useGame((s) => s.spin);
  const docOpen = useGame((s) => s.document !== null);
  const camMode = useGame((s) => s.camMode);
  const keys = useRef(new Set<string>());
  /** Tinggi mata yang dituju (jongkok/jinjit); null = tidak sedang berubah. */
  const eyeGoal = useRef<number | null>(null);
  const walkBoxes = useRef<Box[]>([]);
  const boxes = useRef<THREE.Box3[]>([]);
  const fadeBoxes = useRef<{ obj: THREE.Object3D; box: THREE.Box3 }[]>([]);
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);
  const frame = useRef(0);
  const tmp = useMemo(() => ({ ray: new THREE.Ray(), dir: new THREE.Vector3(), hit: new THREE.Vector3() }), []);

  useEffect(() => {
    controls.current?.target.copy(HOME_TARGET);
    cameraApi.reset = () => {
      goal.current = null;
      camera.position.copy(HOME_POS);
      camera.lookAt(HOME_TARGET);
      controls.current?.target.copy(HOME_TARGET);
      useGame.getState().setCamMode("walk");
    };
    // F: kamera mendekat ke benda yang sedang ditunjuk kursor (mis. starter di belakang firewall)
    cameraApi.focus = () => {
      const o = rig.hoveredObject, orbit = controls.current;
      if (!o || !orbit) return;
      const target = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const dir = camera.position.clone().sub(target).normalize();
      // Mulai orbit dari pandangan sekarang supaya tidak meloncat, lalu mendekat ke benda
      orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), camera.position.distanceTo(target));
      goal.current = { target, pos: target.clone().addScaledVector(dir, FOCUS_DIST) };
      useGame.getState().setCamMode("orbit");
    };
  }, [camera]);

  // Mode dokumen: kamera ke atas meja kerja, lalu kertasnya tampil rata sebagai overlay
  useEffect(() => {
    if (!docOpen) return;
    goal.current = null;
    const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), target: controls.current?.target.clone() };
    const look = new THREE.PerspectiveCamera(); // lookAt kamera menghadap -z (Object3D biasa menghadap +z)
    look.position.copy(BENCH_EYE);
    look.lookAt(BENCH_LOOK);
    animate(camera, [{ p: BENCH_EYE, q: look.quaternion.clone(), dur: 0.6 }]);
    return () => {
      stopTween(camera);
      camera.position.copy(saved.pos);
      camera.quaternion.copy(saved.quat);
      // Tanpa controls.update(): itu memutar kamera menghadap titik orbit (mesin) walau sedang mode jalan
      if (saved.target) controls.current?.target.copy(saved.target);
    };
  }, [docOpen, camera]);

  // Kamera badan engineer: tombol gerak, jongkok, dan klik kanan + geser untuk menoleh
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || !cameraFree()) return;
      const g = useGame.getState();
      if (e.code.startsWith("Shift")) keys.current.add(e.code);
      if (e.code === "KeyC") {
        if (g.camMode === "orbit") g.setCamMode("walk");
        eyeGoal.current = camera.position.y > (EYE.stand + EYE.crouch) / 2 ? EYE.crouch : EYE.stand;
        return;
      }
      if (MOVE_KEYS.has(e.code)) {
        if (e.code.startsWith("Arrow")) e.preventDefault(); // jangan menggulung halaman
        if (g.camMode === "orbit") g.setCamMode("walk");
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    // Kursor terkunci (pointer lock): mouse = menoleh, bidikan di titik tengah layar. Esc (aturan browser) melepas kursor.
    const el = gl.domElement;
    const pdown = (e: PointerEvent) => {
      if (e.button !== 0 || aimLocked() || !canLock()) return;
      Promise.resolve(el.requestPointerLock()).catch(() => {}); // ditolak browser: tetap main dengan kursor bebas
    };
    const pmove = (e: PointerEvent) => {
      if (!aimLocked() || useGame.getState().camMode !== "walk") return;
      const look = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      look.y -= e.movementX * LOOK_RAD_PER_PX;
      look.x = Math.max(-1.45, Math.min(1.45, look.x - e.movementY * LOOK_RAD_PER_PX));
      look.z = 0;
      camera.quaternion.setFromEuler(look);
    };
    // Klik kanan saat kursor terkunci = taruh kembali part (Esc dipakai browser untuk melepas kursor)
    const pup = (e: PointerEvent) => { if (e.button === 2 && aimLocked()) useGame.getState().putBack(); };
    const noMenu = (e: Event) => e.preventDefault();
    // Dokumen, close-up, laporan, dialog, dan mode fokus butuh kursor: lepas kunci, lalu kunci lagi saat kembali ke hanggar.
    // Kunci ulang butuh aktivasi pengguna (klik tombol tutup); kalau ditolak browser (mis. ditutup pakai Esc), klik berikutnya mengunci.
    let resume = false;
    const unlock = useGame.subscribe((s) => {
      const free = s.camMode === "walk" && cameraFree();
      if (aimLocked() && !free) {
        resume = s.camMode === "walk";
        document.exitPointerLock();
      } else if (!aimLocked() && free && resume) {
        resume = false;
        Promise.resolve(el.requestPointerLock()).catch(() => {});
      } else if (s.camMode !== "walk") resume = false;
    });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup);
    el.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointermove", pmove);
      el.removeEventListener("pointerup", pup);
      el.removeEventListener("contextmenu", noMenu);
      unlock();
    };
  }, [camera, gl]);

  // Putar otomatis (P) memutari mesin; keluar dari mode orbit melepas efek tembus pandang
  useEffect(() => { if (spin) controls.current?.target.copy(HOME_TARGET); }, [spin]);
  useEffect(() => {
    if (camMode === "walk") for (const o of fadeables) o.traverse((m) => { if (m instanceof THREE.Mesh) setFaded(m, false); });
  }, [camMode]);

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

  useFrame((_, dt) => {
    const orbit = controls.current;
    const g = useGame.getState();
    if (!orbit || g.closeup || g.document) return;
    // Kotak benda padat dihitung ulang tiap ~0,5 detik: part bisa berpindah (meja ↔ mesin)
    frame.current += dt;
    if (frame.current > 0.5 || walkBoxes.current.length === 0) {
      frame.current = 0;
      const raw = [...solids].map((o) => new THREE.Box3().setFromObject(o));
      walkBoxes.current = raw.map((b) => ({ min: b.min.toArray(), max: b.max.toArray() }));
      boxes.current = raw.map((b) => b.clone().expandByScalar(0.06));
      fadeBoxes.current = [...fadeables].map((obj) => ({ obj, box: new THREE.Box3().setFromObject(obj) }));
    }
    if (g.camMode === "walk") {
      if (!cameraFree()) return;
      const k = keys.current;
      const fwd = camera.getWorldDirection(tmp.dir).setY(0).normalize();
      const ax = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      const az = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      const ay = (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
      // Langkah per frame dibatasi supaya frame yang tersendat tidak membuat badan menembus benda tipis
      const t = Math.min(dt, 0.05);
      if (ax || az) {
        const step = (k.has("ShiftLeft") || k.has("ShiftRight") ? SPEED.run : SPEED.walk) * t / Math.hypot(ax, az);
        const dx = (fwd.x * az - fwd.z * ax) * step, dz = (fwd.z * az + fwd.x * ax) * step;
        const [x, z] = move(camera.position.x, camera.position.z, dx, dz, camera.position.y, walkBoxes.current);
        camera.position.x = x; camera.position.z = z;
        // Kamera yang dipindah dari mode lain dikembalikan ke tinggi mata manusia saat mulai berjalan
        if (clampEye(camera.position.y) !== camera.position.y) eyeGoal.current = clampEye(camera.position.y);
      }
      if (ay) { eyeGoal.current = null; camera.position.y = clampEye(camera.position.y + ay * SPEED.eye * t); }
      if (eyeGoal.current !== null) {
        camera.position.y += (eyeGoal.current - camera.position.y) * (1 - Math.exp(-dt * 10));
        if (Math.abs(eyeGoal.current - camera.position.y) < 0.005) eyeGoal.current = null;
      }
      roomBox.clampPoint(camera.position, camera.position);
      return;
    }
    if (goal.current) {
      const k = 1 - Math.exp(-dt * 8);
      orbit.target.lerp(goal.current.target, k);
      camera.position.lerp(goal.current.pos, k);
      if (camera.position.distanceToSquared(goal.current.pos) < 1e-6) goal.current = null;
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
    // Benda yang menghalangi garis pandang kamera → titik fokus dibuat tembus pandang (tetap padat)
    const dist = camera.position.distanceTo(orbit.target);
    tmp.ray.set(camera.position, tmp.dir.subVectors(orbit.target, camera.position).normalize());
    for (const { obj, box } of fadeBoxes.current) {
      const blocks = !box.containsPoint(orbit.target) && tmp.ray.intersectBox(box, tmp.hit) !== null && tmp.hit.distanceTo(camera.position) < dist;
      obj.traverse((m) => { if (m instanceof THREE.Mesh) setFaded(m, blocks); });
    }
  });

  return (
    <OrbitControls
      ref={controls as never} makeDefault enabled={camMode === "orbit" && !closeup && !docOpen} enableDamping autoRotate={spin && !closeup && !docOpen} autoRotateSpeed={0.9}
      minDistance={0.2} maxDistance={6.5} minPolarAngle={0.05} maxPolarAngle={Math.PI * 0.94}
    />
  );
}
