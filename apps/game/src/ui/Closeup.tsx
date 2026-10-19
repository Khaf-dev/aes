/**
 * Close-up kunci torsi (hybrid): kunci & mur dirender 3D oleh kamera utama (TorqueRig), overlay ini
 * menampilkan skala mikrometer di kaca pembesar, cap KLIK, slip log torsi, dan kontrol.
 * Seperti kunci klik asli, tidak ada penunjuk torsi aktual: hanya setelan dan rasa klik.
 */
import { useRef } from "react";
import { partDef } from "../data/parts.ts";
import { WRENCH_MAX, WRENCH_MIN, WRENCH_STEP } from "../logic/clickWrench.ts";
import { closeupDom, rig } from "../scene/shared.ts";
import { releasePull, startPull } from "../state/pullActions.ts";
import { pull, useGame } from "../state/store.ts";

/** 40 in-lb di x = 520, 2 unit SVG per in-lb. */
const scaleX = (v: number) => 520 + (v - WRENCH_MIN) * 2;
const TICKS = Array.from({ length: (WRENCH_MAX - WRENCH_MIN) / WRENCH_STEP + 1 }, (_, i) => WRENCH_MIN + i * WRENCH_STEP);

const step = (delta: number) => { if (!pull.holding) useGame.getState().stepSetting(delta); };

function Loupe({ setting }: { setting: number }) {
  const thimbleX = scaleX(setting);
  const drag = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  return (
    <figure className="tq-loupe" ref={(el) => { closeupDom.loupe = el; }}>
      <figcaption>SKALA SETELAN · DIPERBESAR</figcaption>
      {/* Kaca pembesar mengikuti tepi thimble */}
      <svg ref={svg} viewBox={`${Math.max(496, thimbleX - 230)} 150 400 104`} role="img" aria-label={`Skala mikrometer kunci torsi, setelan ${setting} in-lb`}>
        <defs>
          <linearGradient id="tqBarrel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9ecef" /><stop offset="0.5" stopColor="#c3c8ce" /><stop offset="1" stopColor="#6c727a" /></linearGradient>
          {/* Barrel hanya terlihat di kiri thimble */}
          <clipPath id="tqBarrelClip"><rect x="500" y="160" width={24 + (setting - WRENCH_MIN) * 2} height="100" /></clipPath>
          <pattern id="tqKnurl" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <rect width="7" height="7" fill="#26292e" /><line x1="0" y1="0" x2="0" y2="7" stroke="#4b5058" strokeWidth="2.5" />
          </pattern>
        </defs>
        <g clipPath="url(#tqBarrelClip)">
          <rect x="510" y="184" width="330" height="52" rx="5" fill="url(#tqBarrel)" />
          <line x1="516" y1="210" x2="838" y2="210" stroke="#1E1C19" strokeWidth="1.5" />
          <g stroke="#1E1C19" strokeWidth="1.5" fill="#1E1C19" fontFamily="Courier Prime, monospace" fontSize="13" textAnchor="middle">
            {TICKS.map((v) => (
              <g key={v}>
                <line x1={scaleX(v)} y1="210" x2={scaleX(v)} y2={v % 10 === 0 ? 193 : 201} />
                {v % 40 === 0 && <text x={scaleX(v)} y="188">{v}</text>}
              </g>
            ))}
          </g>
        </g>
        <g
          className="thimble" transform={`translate(${thimbleX} 0)`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = e.clientX; e.stopPropagation(); }}
          onPointerMove={(e) => {
            if (drag.current === null || !svg.current) return;
            const unitsPerPx = 400 / svg.current.getBoundingClientRect().width;
            const steps = Math.trunc(((e.clientX - drag.current) * unitsPerPx) / 10);
            if (steps) { step(steps * WRENCH_STEP); drag.current = e.clientX; }
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <rect x="0" y="174" width="112" height="72" rx="8" fill="url(#tqKnurl)" stroke="#111" strokeWidth="2" />
          <rect x="0" y="174" width="10" height="72" rx="4" fill="url(#tqBarrel)" />
          <rect x="112" y="181" width="20" height="58" rx="6" fill="#1a1c20" />
          <text x="20" y="171" fill="#F2B45C" fontFamily="Courier Prime, monospace" fontSize="13">◀ setel</text>
        </g>
      </svg>
    </figure>
  );
}

function Slip({ part }: { part: string }) {
  const nuts = useGame((s) => s.rakit.nuts[part] ?? []);
  const status = useGame((s) => s.closeupStatus);
  const { pad } = partDef(part);
  return (
    <div className="tq-slip">
      <b>LOG TORSI · {pad.code}</b>
      <ol>
        {nuts.map((n, i) => (
          <li key={i}>
            <span>#{i + 1}</span>
            <i>{!n.installed ? "belum dipasang" : n.log ? `${n.log.setting} in-lb · ${n.log.feel}` : "—"}</i>
            {n.log && <i>RK</i>}
          </li>
        ))}
      </ol>
      <p className="pencil" aria-live="polite">{status}</p>
    </div>
  );
}

export function Closeup() {
  const closeup = useGame((s) => s.closeup);
  const setting = useGame((s) => s.setting);
  const pulling = useGame((s) => s.pulling);
  if (!closeup) return null;
  const def = partDef(closeup.part);
  return (
    <div
      className="tq" role="dialog" aria-modal="true" aria-labelledby="tqTitle"
      onWheel={(e) => step(e.deltaY < 0 ? WRENCH_STEP : -WRENCH_STEP)}
      onPointerDown={(e) => {
        // Tahan gagang kunci 3D untuk menarik (klik di latar close-up, raycast ke kunci)
        if (e.target !== e.currentTarget || !rig.hitWrench(e.clientX, e.clientY)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startPull();
      }}
      onPointerUp={releasePull} onPointerCancel={releasePull} onLostPointerCapture={releasePull}
    >
      <div className="tq-tag">
        <b>TC {def.pad.code}</b>
        <span id="tqTitle">Mur pengikat {def.label} #{closeup.index + 1}</span>
        <button type="button" onClick={() => useGame.getState().closeCloseup()}>Esc · selesai</button>
      </div>
      <svg className="tq-lead" aria-hidden="true">
        <line ref={(el) => { closeupDom.lead = el; }} stroke="#F2B45C" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />
        <circle ref={(el) => { closeupDom.dot = el; }} r="4" fill="#F2B45C" />
      </svg>
      <Loupe setting={setting} />
      <div className="tq-klik" ref={(el) => { closeupDom.klik = el; }} aria-hidden="true">KLIK</div>
      <Slip part={closeup.part} />
      <div className="tq-controls">
        <button type="button" onClick={() => step(-WRENCH_STEP)} aria-label="Putar thimble: turunkan setelan 5 in-lb">−5</button>
        <span>setel <output>{setting} in-lb</output></span>
        <button type="button" onClick={() => step(WRENCH_STEP)} aria-label="Putar thimble: naikkan setelan 5 in-lb">+5</button>
        <button
          type="button" className={`tq-pull${pulling ? " on" : ""}`} autoFocus
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startPull(); }}
          onPointerUp={releasePull} onPointerCancel={releasePull} onLostPointerCapture={releasePull}
        >
          Tahan untuk menarik <kbd>Spasi</kbd>
        </button>
      </div>
    </div>
  );
}
