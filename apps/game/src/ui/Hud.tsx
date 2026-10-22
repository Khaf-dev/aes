/** Overlay mode rakit: strip task card, catatan tempel, hint, toolbar, label hover, dial kunci torsi, lab cahaya. */
import { useEffect, useRef, useState } from "react";
import { partDef } from "../data/parts.ts";
import { requiresWire } from "../logic/assemblyLog.ts";
import { WRENCH_MAX, WRENCH_MIN } from "../logic/clickWrench.ts";
import { stage, type Stage } from "../logic/rakit.ts";
import { cameraApi } from "../scene/CameraRig.tsx";
import { exposureFromSlider, LENS_RADIUS } from "../scene/shared.ts";
import { useGame } from "../state/store.ts";

const fmt = (n: number, d = 0) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

const STAGE_TEXT: Record<Stage, string> = {
  install: "Pasang {part} ke pad",
  nuts: "Pasang ring & mur di stud (klik stud)",
  torque: "Kencangkan mur pengikat (T: kunci torsi)",
  wire: "Pasang safety wire (W: tang safety wire)",
  plead: "Sambungkan P-lead (klik terminal di belakang magneto)",
  signoff: "Sign-off task card di meja kerja",
  done: "Task card sudah di-sign-off",
};

function TaskStrip() {
  const focusPart = useGame((s) => s.focusPart);
  const def = partDef(focusPart);
  const needsWire = requiresWire(def.stepId);
  const current = useGame((s) => stage(s.rakit, s.focusPart, needsWire));
  const order: Stage[] = ["install", "nuts", "torque", ...(needsWire ? ["wire" as const] : []), ...(def.pLead ? ["plead" as const] : []), "signoff"];
  const code = current === "done" ? `TC ${def.stepId} · SELESAI` : `TC ${def.stepId} · LANGKAH ${order.indexOf(current) + 1} / ${order.length}`;
  const text = STAGE_TEXT[current].replace("{part}", def.name.toLowerCase());
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
  const wireMode = useGame((s) => s.wireMode);
  const lensOn = useGame((s) => s.lensOn);
  const text = lensOn
    ? "Arahkan lensa ke mesin untuk melihat bagian dalam · X: tutup lensa"
    : held
    ? `Klik pad yang menyala untuk memasang ${partDef(held).name.toLowerCase()} · Esc: taruh kembali`
    : torqueMode
      ? "Arahkan ke mur · Scroll: setel dial · Klik mur: buka close-up kunci torsi · T: kembalikan ke shadow board"
      : wireMode
        ? "Klik mur pertama lalu pasangannya untuk memasang safety wire · Klik mur berkawat: potong kawat · W: kembalikan tang"
        : "Klik part di meja untuk mengambil · Klik stud: pasang mur · Klik mur: lepas mur · Klik meja kerja: task card · F: dekatkan kamera ke benda yang ditunjuk";
  return <p className="hint">{text}</p>;
}

function Toolbar() {
  const torqueMode = useGame((s) => s.torqueMode);
  const wireMode = useGame((s) => s.wireMode);
  const lensOn = useGame((s) => s.lensOn);
  const spin = useGame((s) => s.spin);
  const held = useGame((s) => s.rakit.held);
  return (
    <div className="bar" role="toolbar" aria-label="Kontrol mode rakit">
      <button type="button" aria-pressed={lensOn} onClick={() => useGame.getState().setLens(!lensOn)}>
        <kbd>X</kbd>Lensa x-ray
      </button>
      <button type="button" aria-pressed={torqueMode} onClick={() => useGame.getState().setTorqueMode(!torqueMode)}>
        <kbd>T</kbd>Kunci torsi
      </button>
      <button type="button" aria-pressed={wireMode} onClick={() => useGame.getState().setWireMode(!wireMode)}>
        <kbd>W</kbd>Tang safety wire
      </button>
      <button type="button" aria-pressed={spin} onClick={() => useGame.getState().setSpin(!spin)}>
        <kbd>P</kbd>Putar otomatis 360°
      </button>
      <button type="button" onClick={() => cameraApi.reset()}><kbd>R</kbd>Reset kamera</button>
      <button type="button" onClick={() => useGame.getState().runTest()}><kbd>G</kbd>Tes darat</button>
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

/**
 * Arah lilitan safety wire dipilih engineer sendiri. Sistem tidak memberi tahu mana yang benar:
 * aturannya (kawat harus cenderung mengencangkan) ada di handbook, akibatnya baru terasa saat tes.
 */
function WirePrompt() {
  const pending = useGame((s) => s.wirePending);
  if (!pending) return null;
  const finish = useGame.getState().finishWire;
  return (
    <div className="wire-prompt" role="dialog" aria-modal="true" aria-labelledby="wireTitle">
      <b id="wireTitle">SAFETY WIRE · MUR #{pending.a + 1} → #{pending.b + 1}</b>
      <span>Lilit kawat di mur #{pending.b + 1}, dilihat dari ujung stud:</span>
      <div>
        <button type="button" onClick={() => finish(true)}>↻ Searah jarum jam</button>
        <button type="button" onClick={() => finish(false)}>↺ Berlawanan jarum jam</button>
        {/* Fokus awal di Batal supaya tidak memberi petunjuk arah yang benar */}
        <button type="button" autoFocus onClick={() => finish(null)}>Batal</button>
      </div>
    </div>
  );
}

/** Lingkaran lensa x-ray mengikuti kursor; redup bila kursor tidak di atas mesin. */
function LensCursor() {
  const lensOn = useGame((s) => s.lensOn);
  const over = useGame((s) => s.lensOverEngine);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) { ref.current.style.left = `${e.clientX}px`; ref.current.style.top = `${e.clientY}px`; }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return (
    <div ref={ref} className={`lens${over ? "" : " idle"}`} hidden={!lensOn} style={{ width: LENS_RADIUS * 2, height: LENS_RADIUS * 2 }}>
      <span hidden={over}>Arahkan ke mesin</span>
    </div>
  );
}

/** Dial setelan kunci torsi di HUD (diegetic). */
function TorqueDial() {
  const setting = useGame((s) => s.setting);
  const active = useGame((s) => s.torqueMode);
  if (!active) return null;
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
          <span className="head"><span>Lampu meja kerja</span><output>{fmt(lights.benchLm)} lm</output></span>
          <input type="range" min={0} max={4000} step={100} value={lights.benchLm} onChange={(e) => set({ benchLm: Number(e.target.value) })} />
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
      <LensCursor />
      <WirePrompt />
    </>
  );
}
