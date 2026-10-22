/**
 * Buku panduan engineer (mode dokumen). Penjelasan dan WARNING/CAUTION/NOTE dari data handbook yang bersumber;
 * prosedur dan nilai torsi dirender dari langkah di data konten, sama dengan task card (lihat GDD).
 */
import { checklist, HANDBOOK, handbookTopics, STEPS, type HandbookEntry } from "../logic/assemblyLog.ts";
import { useGame } from "../state/store.ts";

const LEVEL_LABEL = { WARNING: "PERINGATAN · WARNING", CAUTION: "AWAS · CAUTION", NOTE: "CATATAN · NOTE" } as const;

export function HandbookView() {
  const id = useGame((s) => s.handbook);
  const entry = HANDBOOK.entries.find((e) => e.id === id);
  if (!entry) return null;
  const g = useGame.getState();
  const step = entry.stepId ? STEPS.find((s) => s.id === entry.stepId) : undefined;
  const topics = entry.stepId ? handbookTopics(entry.stepId) : [];
  // Nomor rujukan per halaman, urut kemunculan
  const cited = [...entry.about, ...entry.notes].map((c) => c.source).filter((s, i, all) => all.indexOf(s) === i);
  const cite = (c: { source: string; ref: string }) => <sup className="hb-cite">[{cited.indexOf(c.source) + 1}, {c.ref}]</sup>;
  return (
    <div className="doc hb" role="dialog" aria-modal="true" aria-labelledby="hbTitle">
      <nav className="doc-tabs" aria-label="Isi buku panduan">
        {HANDBOOK.entries.map((e) => (
          <button key={e.id} type="button" aria-current={e.id === id} onClick={() => g.openHandbook(e.id)}>{tabLabel(e)}</button>
        ))}
      </nav>
      <article className="doc-paper hb-paper">
        <header>
          <b>BUKU PANDUAN ENGINEER · AES-1</b>
          {entry.stepId && <span className="doc-code">{entry.stepId}</span>}
          <h2 id="hbTitle">{entry.title}</h2>
        </header>
        <section>
          {entry.about.map((c, i) => <p key={i}>{c.text} {cite(c)}</p>)}
        </section>
        {entry.notes.map((n, i) => (
          <aside key={i} className={`hb-note ${n.level.toLowerCase()}`}>
            <b>{LEVEL_LABEL[n.level]}</b>
            <p>{n.text} {cite(n)}</p>
          </aside>
        ))}
        {step && (
          <section>
            <h3>Prosedur · task card {step.id}</h3>
            <ol className="hb-steps">{checklist(step.id).map((t, i) => <li key={i}>{t}</li>)}</ol>
          </section>
        )}
        {topics.length > 0 && (
          <section className="hb-see">
            <h3>Lihat juga</h3>
            {topics.map((t) => <button key={t.id} type="button" onClick={() => g.openHandbook(t.id)}>{t.title}</button>)}
          </section>
        )}
        <footer className="hb-sources">
          <h3>Rujukan</h3>
          <ol>
            {cited.map((sid) => {
              const src = HANDBOOK.sources.find((s) => s.id === sid)!;
              return <li key={sid}><a href={src.url} target="_blank" rel="noreferrer">{src.title}</a></li>;
            })}
          </ol>
          <button type="button" className="doc-close" onClick={() => g.closeHandbook()}>B / Esc · tutup</button>
        </footer>
      </article>
    </div>
  );
}

const tabLabel = (e: HandbookEntry) => (e.stepId ? `${e.stepId} · ${e.title}` : e.title);
