/**
 * Laporan tes darat bergaya kertas kuning (laporan investigasi di GDD): hasil, gejala, penelusuran
 * dari gejala ke hulu, akar masalah perakitan, dan clue task card. Sistem yang belum diuji disebut terang.
 */
import { useGame } from "../state/store.ts";

export function TestReport() {
  const sheet = useGame((s) => s.testSheet);
  if (!sheet) return null;
  return (
    <div className="doc report" role="dialog" aria-modal="true" aria-labelledby="reportTitle">
      <article className="doc-paper report-paper">
        <header>
          <b>LAPORAN TES DARAT</b>
          <h2 id="reportTitle">{sheet.scenario}</h2>
          <span className={`report-stamp ${sheet.passed ? "pass" : "fail"}`}>{sheet.passed ? "LULUS" : "GAGAL"}</span>
        </header>
        <section>
          <h3>Konsumen yang diuji</h3>
          <ul className="report-consumers">
            {sheet.consumers.map((c) => (
              <li key={c.label}><span>{c.label}</span><span>{c.ok ? `bekerja · ${c.voltage.toFixed(1)} V` : "tidak bekerja"}</span></li>
            ))}
          </ul>
        </section>
        {sheet.fod.map((f) => (
          <section key={f.tool} className="report-finding">
            <h3>Temuan FOD: {f.tool} ditemukan tertinggal di area mesin setelah tes</h3>
            <p><b>Terakhir dipakai:</b> task card {f.where}</p>
            <p className="report-clue"><b>Clue:</b> cek shadow board, slot {f.tool.toUpperCase()} kosong. Semua alat harus kembali ke slotnya sebelum tes.</p>
          </section>
        ))}
        <section>
          <h3>Start mesin dan mag check</h3>
          {!sheet.runUp.started ? <p>Mesin tidak hidup.</p> : (
            <ul className="report-consumers">
              {sheet.runUp.magCheck.map((c) => (
                <li key={c.position} className={c.ok ? "" : "bad"}><span>{c.position}</span><span>{c.result}</span></li>
              ))}
              {sheet.runUp.offCheck && <li className={sheet.runUp.offCheck.includes("TETAP") ? "bad" : ""}><span>{sheet.runUp.offCheck}</span></li>}
            </ul>
          )}
          <p className="report-note">Batas penurunan RPM berbeda tiap pesawat (lihat manualnya), jadi hasil dicatat apa adanya tanpa angka.</p>
        </section>
        {sheet.runUp.findings.map((f, i) => (
          <section key={`ign${i}`} className="report-finding">
            <h3>Temuan start mesin: {f.title}</h3>
            {f.step ? (
              <p className="report-clue">
                <b>Clue:</b> cek task card {f.step.id} ({f.step.title}): {f.step.defect}.
                {f.step.signedOff && " Task card ini sudah ditandatangani."}
              </p>
            ) : null}
          </section>
        ))}
        <section>
          <h3>Cek torsi mur klem (inspektur)</h3>
          {sheet.torqueCheck.length === 0
            ? <p>Kunci torsi disetel ke batas bawah tiap task card; tidak ada mur yang ikut berputar sebelum klik.</p>
            : sheet.torqueCheck.map((t, i) => (
              <div key={i} className="report-finding">
                <p><b>{t.title}</b></p>
                {t.step && (
                  <p className="report-clue">
                    <b>Clue:</b> cek task card {t.step.id} ({t.step.title}): {t.step.defect}.
                    {t.step.signedOff && " Task card ini sudah ditandatangani."}
                  </p>
                )}
              </div>
            ))}
        </section>
        {sheet.findings.map((f, i) => (
          <section key={i} className="report-finding">
            <h3>Temuan {i + 1}: {f.consumer} {f.symptom}</h3>
            <p><b>Penelusuran:</b> {f.trace.join(" ← ")}</p>
            {f.rootCause && <p><b>Titik masalah:</b> {f.rootCause}</p>}
            {f.step ? (
              <p className="report-clue">
                <b>Clue:</b> cek task card {f.step.id} ({f.step.title}): {f.step.defect}.
                {f.step.signedOff && " Task card ini sudah ditandatangani."}
              </p>
            ) : <p className="report-clue"><b>Clue:</b> akar masalah bukan dari perakitan. Cek posisi saklar.</p>}
          </section>
        ))}
        <section className="report-untested">
          <h3>Belum diuji di tes ini</h3>
          <ul>{sheet.untested.map((u) => <li key={u}>{u}</li>)}</ul>
        </section>
        <footer>
          <span />
          <button type="button" className="doc-close" autoFocus onClick={() => useGame.getState().closeTest()}>Esc · kembali ke hanggar</button>
        </footer>
      </article>
    </div>
  );
}
