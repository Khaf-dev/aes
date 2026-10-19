import { create } from "zustand";
import { clampSetting, openSession, WRENCH_MIN, type Feel, type PullState } from "../logic/clickWrench.ts";
import * as rakit from "../logic/rakit.ts";
import { PARTS, partDef } from "../data/parts.ts";

export interface NutRef {
  readonly part: string;
  readonly index: number;
}

export interface Lights {
  /** Lampu kerja tripod (lumen). */
  readonly lampLm: number;
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
  setTorqueMode(on: boolean): void;
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
    setting: WRENCH_MIN,
    wrenchAt: null,
    closeup: null,
    closeupStatus: "",
    pulling: false,
    lights: { lampLm: 4000, ambientLux: 0.5, exposure: 0.6, shadows: true, headlamp: true },
    toast: null,
    hover: null,

    pickUp: (part) => apply(rakit.pickUp(get().rakit, part), part),
    putBack: () => apply(rakit.putBack(get().rakit)),
    installOnPad: (padFor) => apply(rakit.install(get().rakit, padFor)),
    clickStud: ({ part, index }) => apply(rakit.installNut(get().rakit, part, index), part),
    clickNut: ({ part, index }) => apply(rakit.removeNut(get().rakit, part, index), part),

    setTorqueMode: (on) => {
      const first = on ? firstInstalledNut(get().rakit) : null;
      set({ torqueMode: on, wrenchAt: first });
      if (on && !first) get().showToast("Belum ada mur terpasang untuk dikencangkan. Kunci torsi tetap di meja part.");
    },
    aimWrench: (nut) => set({ wrenchAt: nut }),
    stepSetting: (delta) => set({ setting: clampSetting(get().setting + delta) }),

    openCloseup: (nut) => {
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
