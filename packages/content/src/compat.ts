/**
 * Penjaga kompatibilitas di level tipe: data yang lolos skema konten harus
 * bisa langsung dipakai sim-core. Kalau salah satu sisi berubah dan tidak
 * cocok lagi, `pnpm typecheck` gagal di file ini.
 */
import type { Network, StepSpec, TestScenario } from "@aes/sim-core";
import type { AssemblyStep, NetworkData, TestScenarioData } from "./schema.ts";

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type _StepsCompatible = Assert<Extends<AssemblyStep, StepSpec>>;
export type _NetworkCompatible = Assert<Extends<NetworkData, Network>>;
export type _ScenarioCompatible = Assert<Extends<TestScenarioData, TestScenario>>;
