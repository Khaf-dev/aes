import { create } from "zustand";
import { clampSetting, openSession, WRENCH_MIN, type Feel, type PullState } from "../logic/clickWrench.ts";
import * as rakit from "../logic/rakit.ts";
import { PARTS, PLAYABLE_STEP_IDS, partDef } from "../data/parts.ts";
import { checklist, handbookEntryFor } from "../logic/assemblyLog.ts";
import { runGroundTest, type TestSheet } from "../logic/groundTest.ts";

export interface NutRef {
  readonly part: string;
  readonly index: number;
}

export interface Lights {
  /** Lampu kerja tripod (lumen). */
  readonly lampLm: number;
  /** Lampu meja kerja di dinding (lumen). */
  readonly benchLm: number;
  /** Cahaya lingkungan dari luar pintu hanggar (lux). */
  readonly ambientLux: number;
  /** Posisi slider eksposur 0–1. */
  readonly exposure: number;
  readonly shadows: boolean;
  readonly headlamp: boolean;
}

interface Toast {
  readonly text: string;
  readonly bad: boolean;
  readonly id: number;
}

interface GameState {
  readonly rakit: rakit.RakitState;
  /** Part yang terakhir disentuh: strip task card mengikuti part ini. */
  readonly focusPart: string;
  readonly torqueMode: boolean;
  /** Tang safety wire di tangan; `wireFrom` = mur pertama yang dipilih, `wirePending` = menunggu pilihan arah lilitan. */
  readonly wireMode: boolean;
  readonly wireFrom: NutRef | null;
  readonly wirePending: { readonly part: string; readonly a: number; readonly b: number } | null;
  /** Task card yang sedang dibuka di mode dokumen (id langkah). */
  readonly document: string | null;
  /** Halaman buku panduan yang sedang dibuka (id entri), tampil di atas task card. */
  readonly handbook: string | null;
  /** Laporan tes darat terakhir yang sedang dibaca. */
  readonly testSheet: TestSheet | null;
  /** Lensa x-ray aktif, dan apakah kursor sedang di atas mesin (hanya di situ kulit mesin dibuka). */
  readonly lensOn: boolean;
  readonly lensOverEngine: boolean;
  /** Kamera berputar otomatis 360°. */
  readonly spin: boolean;
  /** Setelan thimble kunci torsi (in-lb). */
  readonly setting: number;
  /** Mur tempat kunci torsi sedang terpasang. */
  readonly wrenchAt: NutRef | null;
  /** Close-up kunci torsi yang sedang terbuka. */
  readonly closeup: NutRef | null;
  readonly closeupStatus: string;
  /** Gagang kunci sedang ditahan (untuk tampilan tombol). */
  readonly pulling: boolean;
  readonly lights: Lights;
  readonly toast: Toast | null;
  readonly hover: { readonly code: string; readonly name: string } | null;

  pickUp(part: string): void;
  putBack(): void;
  installOnPad(padFor: string): void;
  clickStud(nut: NutRef): void;
  clickNut(nut: NutRef): void;
  toggleCable(part: string): void;
  setTorqueMode(on: boolean): void;
  setWireMode(on: boolean): void;
  wireClickNut(nut: NutRef): void;
  finishWire(positive: boolean | null): void;
  openDocument(stepId: string): void;
  /** Klik meja kerja: buka task card yang paling relevan (part yang sedang dikerjakan, yang belum ditandatangani). */
  openBench(): void;
  runTest(): void;
  closeTest(): void;
  closeDocument(): void;
  /** Tanpa id: halaman sesuai konteks (task card yang dibaca, part di tangan, part yang dikerjakan). */
  openHandbook(entryId?: string): void;
  closeHandbook(): void;
  toggleCheck(stepId: string, index: number): void;
  signOff(stepId: string): void;
  setLens(on: boolean): void;
  setSpin(on: boolean): void;
  aimWrench(nut: NutRef): void;
  stepSetting(delta: number): void;
  openCloseup(nut: NutRef): void;
  closeCloseup(): void;
  setCloseupStatus(text: string): void;
  recordTorque(nut: NutRef, value: number, feel: Feel): void;
  setLights(patch: Partial<Lights>): void;
  setHover(hover: GameState["hover"]): void;
  showToast(text: string, bad?: boolean): void;
}

let toastId = 0;

export const useGame = create<GameState>()((set, get) => {
  /** Terapkan hasil aturan rakit + catatan untuk pemain. */
  const apply = (out: rakit.Outcome, focusPart?: string) => {
    set({ rakit: out.state, ...(focusPart ? { focusPart } : {}) });
    if (out.toast) get().showToast(out.toast.text, out.toast.bad);
  };

  return {
    rakit: rakit.initialRakit(),
    focusPart: PARTS[0]!.assetId,
    torqueMode: false,
    wireMode: false,
    wireFrom: null,
    wirePending: null,
    document: null,
    handbook: null,
    testSheet: null,
    lensOn: false,
    lensOverEngine: false,
    spin: false,
    setting: WRENCH_MIN,
    wrenchAt: null,
    closeup: null,
    closeupStatus: "",
    pulling: false,
    lights: { lampLm: 4000, benchLm: 1200, ambientLux: 0.5, exposure: 0.6, shadows: true, headlamp: true },
    toast: null,
    hover: null,

    pickUp: (part) => apply(rakit.pickUp(get().rakit, part), part),
    putBack: () => apply(rakit.putBack(get().rakit)),
    installOnPad: (padFor) => apply(rakit.install(get().rakit, padFor)),
    clickStud: ({ part, index }) => apply(rakit.installNut(get().rakit, part, index), part),
    clickNut: ({ part, index }) => apply(rakit.removeNut(get().rakit, part, index), part),
    toggleCable: (part) => apply(rakit.toggleCable(get().rakit, part), part),

    setTorqueMode: (on) => {
      const first = on ? firstInstalledNut(get().rakit) : null;
      // Satu alat di tangan: kunci torsi menggantikan tang safety wire
      set({ torqueMode: on, wrenchAt: first, ...(on ? { wireMode: false, wireFrom: null, wirePending: null } : {}) });
      if (on && !first) get().showToast("Belum ada mur terpasang untuk dikencangkan. Kunci torsi tetap di shadow board.");
    },
    setWireMode: (on) => set({ wireMode: on, wireFrom: null, wirePending: null, ...(on ? { torqueMode: false, wrenchAt: null } : {}) }),
    wireClickNut: (nut) => {
      const { rakit: s, wireFrom } = get();
      if (rakit.isWired(s, nut.part, nut.index)) { apply(rakit.cutWire(s, nut.part, nut.index), nut.part); set({ wireFrom: null }); return; }
      if (!wireFrom || wireFrom.part !== nut.part) {
        set({ wireFrom: nut, focusPart: nut.part });
        get().showToast(`Kawat dimasukkan ke mur #${nut.index + 1}. Klik mur pasangannya.`);
        return;
      }
      if (wireFrom.index === nut.index) return;
      set({ wirePending: { part: nut.part, a: wireFrom.index, b: nut.index }, wireFrom: null });
    },
    finishWire: (positive) => {
      const pending = get().wirePending;
      set({ wirePending: null });
      if (pending && positive !== null) apply(rakit.installWire(get().rakit, pending.part, pending.a, pending.b, positive), pending.part);
    },
    openBench: () => {
      const { rakit: s, focusPart } = get();
      const focus = partDef(focusPart);
      const mine = [focus.stepId, ...(focus.cable ? [focus.cable.stepId] : [])];
      const unsigned = (id: string) => !s.signoff[id]?.signed;
      get().openDocument(mine.find(unsigned) ?? PLAYABLE_STEP_IDS.find(unsigned) ?? mine[0]!);
    },
    openDocument: (document) => {
      const part = PARTS.find((p) => p.stepId === document);
      set({ document, hover: null, spin: false, ...(part ? { focusPart: part.assetId } : {}) });
    },
    closeDocument: () => set({ document: null }),
    openHandbook: (entryId) => {
      const g = get();
      set({ handbook: entryId ?? handbookEntryFor(g.rakit, g.focusPart, g.document), hover: null, spin: false });
    },
    closeHandbook: () => set({ handbook: null }),
    runTest: () => {
      // Alat yang masih di tangan / terpasang di mur saat tes dimulai = FOD. Alat tidak dikembalikan otomatis.
      const g = get();
      const toolsOut = [
        ...(g.torqueMode && g.wrenchAt ? [{ tool: "Kunci torsi", stepId: partDef(g.wrenchAt.part).stepId }] : []),
        ...(g.wireMode ? [{ tool: "Tang safety wire", stepId: partDef(g.focusPart).stepId }] : []),
      ];
      set({ testSheet: runGroundTest(g.rakit, toolsOut), hover: null, spin: false, closeup: null, wireFrom: null, wirePending: null });
    },
    closeTest: () => set({ testSheet: null }),
    toggleCheck: (stepId, index) => set({ rakit: rakit.toggleCheck(get().rakit, stepId, index, checklist(stepId).length) }),
    signOff: (stepId) => set({ rakit: rakit.signOff(get().rakit, stepId, checklist(stepId).length) }),
    setLens: (lensOn) => set({ lensOn, lensOverEngine: false, hover: null }),
    setSpin: (spin) => set({ spin }),
    aimWrench: (nut) => set({ wrenchAt: nut }),
    stepSetting: (delta) => set({ setting: clampSetting(get().setting + delta) }),

    openCloseup: (nut) => {
      if (rakit.isWired(get().rakit, nut.part, nut.index)) {
        get().showToast(`Mur #${nut.index + 1} sudah diikat safety wire. Potong kawatnya dulu kalau mau ditorsi ulang.`, true);
        return;
      }
      const torque = get().rakit.nuts[nut.part]?.[nut.index]?.torque ?? null;
      pull.state = openSession(torque);
      pull.holding = false;
      set({
        closeup: nut,
        wrenchAt: nut,
        hover: null,
        focusPart: nut.part,
        closeupStatus: torque !== null
          ? "Mur ini sudah pernah dikencangkan."
          : "Masih kencang tangan. Tahan sampai mur duduk, terus tarik sampai klik.",
      });
    },
    closeCloseup: () => { pull.holding = false; set({ closeup: null, pulling: false }); },
    setCloseupStatus: (closeupStatus) => set({ closeupStatus }),
    recordTorque: (nut, value, feel) => {
      const log = { setting: get().setting, feel };
      set({ rakit: rakit.torqueNut(get().rakit, nut.part, nut.index, value, log) });
    },

    setLights: (patch) => set({ lights: { ...get().lights, ...patch } }),
    setHover: (hover) => { if (hover?.name !== get().hover?.name || hover?.code !== get().hover?.code) set({ hover }); },
    showToast: (text, bad = false) => set({ toast: { text, bad, id: ++toastId } }),
  };
});

function firstInstalledNut(s: rakit.RakitState): NutRef | null {
  for (const def of PARTS) {
    const index = (s.nuts[def.assetId] ?? []).findIndex((n) => n.installed);
    if (index >= 0) return { part: def.assetId, index };
  }
  return null;
}

/**
 * Keadaan tarikan kunci torsi, diperbarui tiap frame. Sengaja di luar store React supaya
 * animasi 60 fps tidak memicu render ulang komponen.
 */
export const pull: { state: PullState; holding: boolean } = { state: openSession(null), holding: false };

/** Label mur untuk hover: hanya yang diketahui engineer (setelan + rasa klik), bukan torsi sebenarnya. */
export function nutLabel(s: rakit.RakitState, { part, index }: NutRef): string {
  const log = s.nuts[part]?.[index]?.log;
  const status = log ? `setel ${log.setting} in-lb (${log.feel})` : "belum dikencangkan";
  return `Mur pengikat ${partDef(part).label} #${index + 1} · ${status}`;
}
