/** Overlay mode rakit: strip task card, catatan tempel, hint, toolbar, label hover, dial kunci torsi, lab cahaya. */
import { useEffect, useRef, useState } from "react";
import { PARTS, partDef } from "../data/parts.ts";
import { WRENCH_MAX, WRENCH_MIN } from "../logic/clickWrench.ts";
import { stage } from "../logic/rakit.ts";
import { cameraApi } from "../scene/CameraRig.tsx";
import { exposureFromSlider } from "../scene/shared.ts";
import { useGame } from "../state/store.ts";

const fmt = (n: number, d = 0) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

function TaskStrip() {
  const focusPart = useGame((s) => s.focusPart);
  const step = useGame((s) => stage(s.rakit, s.focusPart));
  const [code, text] = partDef(focusPart).stages[step] ?? PARTS[0]!.stages[0]!;
  return (
    <div className="strip" role="note" aria-live="polite">
      <b>{code}</b>
      <span>{text}</span>
    </div>
  );
}

function Toast() {
  const toast = useGame((s) => s.toast);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className={`toast${toast?.bad ? " bad" : ""}`} role="status" aria-live="polite" hidden={!shown || !toast}>
      {toast?.text}
    </div>
  );
}

function Hint() {
  const held = useGame((s) => s.rakit.held);
  const torqueMode = useGame((s) => s.torqueMode);
  const text = held
    ? `Klik pad yang menyala untuk memasang ${partDef(held).name.toLowerCase()} · Esc: taruh kembali`
    : torqueMode
      ? "Arahkan ke mur · Scroll: setel dial · Klik mur: buka close-up kunci torsi · T: kembalikan kunci"
      : "Klik part di meja untuk mengambil · Klik stud: pasang mur · Klik mur: lepas mur · Drag: putar kamera";
  return <p className="hint">{text}</p>;
}

function Toolbar() {
  const torqueMode = useGame((s) => s.torqueMode);
  const held = useGame((s) => s.rakit.held);
  return (
    <div className="bar" role="toolbar" aria-label="Kontrol mode rakit">
      <button type="button" aria-pressed={torqueMode} onClick={() => useGame.getState().setTorqueMode(!torqueMode)}>
        <kbd>T</kbd>Kunci torsi
      </button>
      <button type="button" onClick={() => cameraApi.reset()}><kbd>R</kbd>Reset kamera</button>
      {held && <button type="button" onClick={() => useGame.getState().putBack()}><kbd>Esc</kbd>Taruh kembali</button>}
    </div>
  );
}

/** Label kertas kecil yang mengikuti kursor. Posisi diperbarui langsung di DOM supaya tidak render ulang. */
function HoverLabel() {
  const hover = useGame((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) { ref.current.style.left = `${e.clientX}px`; ref.current.style.top = `${e.clientY}px`; }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return (
    <div className="label" ref={ref} hidden={!hover}>
      <b>{hover?.code}</b>
      <span>{hover?.name}</span>
    </div>
  );
}

/** Dial setelan kunci torsi di HUD (diegetic). */
function TorqueDial() {
  const setting = useGame((s) => s.setting);
  const active = useGame((s) => s.torqueMode);
  const angle = -135 + ((setting - WRENCH_MIN) / (WRENCH_MAX - WRENCH_MIN)) * 270;
  return (
    <div className={`tool${active ? " active" : ""}`}>
      <svg width="150" height="150" viewBox="0 0 190 190" role="img" aria-label={`Dial kunci torsi, setelan ${setting} in-lb`}>
        <circle cx="95" cy="95" r="88" fill="#1A1F27" stroke="#3A4250" strokeWidth="4" />
        <circle cx="95" cy="95" r="74" fill="#E9E2D2" />
        <path d="M51 139L58 132M38 71L47 75M95 33L95 43M152 71L143 75M139 139L132 132" stroke="#1E1C19" strokeWidth="2" strokeLinecap="round" />
        <g fontFamily="Courier Prime, monospace" fontSize="12" fill="#1E1C19" textAnchor="middle">
          <text x="67" y="127">40</text><text x="58" y="84">80</text><text x="95" y="59">120</text><text x="132" y="84">160</text><text x="123" y="127">200</text>
        </g>
        <line x1="95" y1="95" x2="95" y2="35" stroke="#B3261E" strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle} 95 95)`} />
        <circle cx="95" cy="95" r="6" fill="#1E1C19" />
        <text x="95" y="150" fontFamily="Courier Prime, monospace" fontSize="13" fontWeight="700" fill="#1E1C19" textAnchor="middle">{setting} in-lb</text>
      </svg>
      <span className="cap">KUNCI TORSI</span>
    </div>
  );
}

function LabPanel() {
  const lights = useGame((s) => s.lights);
  const set = useGame((s) => s.setLights);
  return (
    <details className="lab" open={typeof innerWidth === "undefined" || innerWidth >= 640}>
      <summary>Lab cahaya · prototipe</summary>
      <div className="rows">
        <label>
          <span className="head"><span>Lampu kerja</span><output>{fmt(lights.lampLm)} lm</output></span>
          <input type="range" min={500} max={12000} step={250} value={lights.lampLm} onChange={(e) => set({ lampLm: Number(e.target.value) })} />
        </label>
        <label>
          <span>Cahaya lingkungan</span>
          <select value={lights.ambientLux} onChange={(e) => set({ ambientLux: Number(e.target.value) })}>
            <option value={0.0001}>Malam tanpa bulan · 0,0001 lx</option>
            <option value={0.5}>Bulan purnama · 0,5 lx</option>
            <option value={3.4}>Senja kota · 3,4 lx</option>
          </select>
        </label>
        <label>
          <span className="head"><span>Eksposur kamera</span><output>{fmt(exposureFromSlider(lights.exposure), 3)}</output></span>
          <input type="range" min={0} max={1} step={0.01} value={lights.exposure} onChange={(e) => set({ exposure: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={lights.shadows} onChange={(e) => set({ shadows: e.target.checked })} /> Bayangan
        </label>
        <label className="check">
          <input type="checkbox" checked={lights.headlamp} onChange={(e) => set({ headlamp: e.target.checked })} /> Headlamp mekanik · 280 lm (H)
        </label>
        <p className="note">Satuan fisik: daya lampu dalam lumen, cahaya lingkungan dalam lux, cahaya melemah sesuai kuadrat jarak. Model mesin masih bentuk dasar.</p>
      </div>
    </details>
  );
}

export function Hud() {
  return (
    <>
      <TaskStrip />
      <Toast />
      <LabPanel />
      <TorqueDial />
      <Toolbar />
      <Hint />
      <HoverLabel />
    </>
  );
}
