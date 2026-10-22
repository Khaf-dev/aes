/**
 * Mode dokumen: task card tampil rata sebagai kertas. Checklist dicentang dan diparaf sendiri oleh engineer,
 * lalu ditandatangani. Tidak ada yang diverifikasi di sini; kesalahan rakit baru muncul saat tes (lihat GDD).
 */
import { PARTS, PLAYABLE_STEP_IDS } from "../data/parts.ts";
import { checklist, STEPS } from "../logic/assemblyLog.ts";
import { useGame } from "../state/store.ts";

export function DocumentView() {
  const stepId = useGame((s) => s.document);
  const signoff = useGame((s) => s.rakit.signoff);
  const card = stepId ? signoff[stepId] : undefined;
  if (!stepId) return null;
  const step = STEPS.find((s) => s.id === stepId)!;
  const part = PARTS.find((p) => p.stepId === stepId);
  const lines = checklist(stepId);
  const g = useGame.getState();
  const signed = card?.signed ?? false;
  return (
    <div className="doc" role="dialog" aria-modal="true" aria-labelledby="docTitle">
      <nav className="doc-tabs" aria-label="Task card di meja kerja">
        {PLAYABLE_STEP_IDS.map((id) => (
          <button key={id} type="button" aria-current={id === stepId} title={STEPS.find((s) => s.id === id)?.title} onClick={() => g.openDocument(id)}>
            {id}{signoff[id]?.signed ? " · SIGNED" : ""}
          </button>
        ))}
      </nav>
      <article className="doc-paper">
        <header>
          <b>TASK CARD</b>
          <span className="doc-code">{stepId}</span>
          <h2 id="docTitle">{step.title}</h2>
          {part && <span className="doc-sub">Part: {part.name} · pad {part.pad.code}</span>}
        </header>
        <ol>
          {lines.map((text, i) => {
            const checked = card?.checks[i] ?? false;
            return (
              <li key={i}>
                <button
                  type="button" role="checkbox" aria-checked={checked} disabled={signed}
                  onClick={() => g.toggleCheck(stepId, i)}
                >
                  <span className="doc-n">{i + 1}</span>
                  <span className="doc-text">{text}</span>
                  <span className="doc-paraf" aria-hidden="true">{checked ? "RK" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="doc-note">Centang dan paraf sendiri setiap langkah yang sudah dikerjakan. Checklist ini tidak memeriksa pekerjaan.</p>
        <footer>
          {signed
            ? <span className="doc-stamp">SIGNED · RK</span>
            : <button type="button" className="doc-sign" onClick={() => g.signOff(stepId)}>Tanda tangani task card · RK</button>}
          <button type="button" className="doc-close" onClick={() => g.closeDocument()}>Esc · kembali</button>
        </footer>
      </article>
    </div>
  );
}
