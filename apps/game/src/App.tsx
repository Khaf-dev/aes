import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { PARTS } from "./data/parts.ts";
import { hiddenDefects } from "./logic/assemblyLog.ts";
import { tick } from "./logic/clickWrench.ts";
import { CameraRig, cameraApi, HOME_POS } from "./scene/CameraRig.tsx";
import { Engine } from "./scene/Engine.tsx";
import { Hangar } from "./scene/Hangar.tsx";
import { Interact } from "./scene/Interact.tsx";
import { Lens } from "./scene/Lens.tsx";
import { Tags } from "./scene/Tags.tsx";
import { Workshop } from "./scene/Workshop.tsx";
import { Lights } from "./scene/Lights.tsx";
import { rig, runTweens } from "./scene/shared.ts";
import { Tier2Part } from "./scene/Tier2Part.tsx";
import { TorqueRig } from "./scene/TorqueRig.tsx";
import { releasePull, startPull } from "./state/pullActions.ts";
import { pull, useGame } from "./state/store.ts";
import { Closeup } from "./ui/Closeup.tsx";
import { DocumentView } from "./ui/DocumentView.tsx";
import { HandbookView } from "./ui/HandbookView.tsx";
import { TestReport } from "./ui/TestReport.tsx";
import { Hud } from "./ui/Hud.tsx";

for (const p of PARTS) useGLTF.preload(`/tier2/${p.model ?? p.assetId}.glb`);
useGLTF.preload("/tools/tool.torque-wrench.40-200.glb");

function Tweens() {
  useFrame((_, dt) => runTweens(Math.min(dt, 0.05)));
  return null;
}

function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const g = useGame.getState();
      const k = e.key.toLowerCase();
      if (k === "h") { g.setLights({ headlamp: !g.lights.headlamp }); return; }
      if (g.testSheet) { if (e.key === "Escape") g.closeTest(); return; }
      if (g.handbook) { if (e.key === "Escape" || k === "b") g.closeHandbook(); return; }
      if (k === "b" && !g.closeup && !g.wirePending) { g.openHandbook(); return; }
      if (g.document) { if (e.key === "Escape") g.closeDocument(); return; }
      if (g.wirePending) { if (e.key === "Escape") g.finishWire(null); return; }
      if (g.closeup) {
        // Close-up menangkap semua tombol: Spasi tahan = tarik, panah = putar thimble
        if (e.key === "Escape") g.closeCloseup();
        else if (e.code === "Space") { e.preventDefault(); if (!e.repeat) startPull(); }
        else if (!pull.holding && (e.key === "ArrowUp" || e.key === "ArrowRight")) { e.preventDefault(); g.stepSetting(5); }
        else if (!pull.holding && (e.key === "ArrowDown" || e.key === "ArrowLeft")) { e.preventDefault(); g.stepSetting(-5); }
        return;
      }
      if (e.key === "Escape") g.putBack();
      else if (k === "t") g.setTorqueMode(!g.torqueMode);
      else if (k === "x") g.setLens(!g.lensOn);
      else if (k === "w") g.setWireMode(!g.wireMode);
      else if (k === "g") g.runTest();
      else if (k === "p") g.setSpin(!g.spin);
      else if (k === "r") cameraApi.reset();
      else if (k === "f") cameraApi.focus();
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") releasePull(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
}

/** Kait untuk uji otomatis (?debug): akses state tanpa mengubah perilaku normal. */
const DEBUG = new URLSearchParams(location.search).has("debug");
function DebugHook() {
  const three = useThree();
  useEffect(() => {
    // advance(): majukan simulasi tarikan tanpa menunggu frame (browser headless bisa < 1 fps)
    const advance = (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.05) pull.state = tick(pull.state, 0.05, pull.holding, useGame.getState().setting);
    };
    Object.assign(window, { __aes: { useGame, pull, rig, three, advance, hiddenDefects: () => hiddenDefects(useGame.getState().rakit) } });
  }, [three]);
  return null;
}

export function App() {
  useKeyboard();
  return (
    <>
      <div id="stage" aria-label="Scene 3D hanggar: mesin piston di atas dudukan, meja part, meja kerja, papan peralatan, dan papan tulis">
        <Canvas
          shadows="percentage" dpr={[1, 1.75]}
          camera={{ fov: 42, near: 0.03, far: 80, position: HOME_POS.toArray() }}
          fallback={<div className="boot">Browser ini tidak bisa menjalankan WebGL, jadi scene 3D tidak bisa ditampilkan.</div>}
        >
          <Lights />
          <Interact>
            <Hangar />
            <Workshop />
            <Tags />
            <Engine />
            <group ref={(g) => { rig.staging = g; }} />
          </Interact>
          <Suspense fallback={null}>
            {PARTS.map((p) => <Tier2Part key={p.assetId} def={p} />)}
            <TorqueRig />
          </Suspense>
          <CameraRig />
          <Lens />
          <Tweens />
          {DEBUG && <DebugHook />}
        </Canvas>
      </div>
      <Hud />
      <Closeup />
      <DocumentView />
      <HandbookView />
      <TestReport />
    </>
  );
}
