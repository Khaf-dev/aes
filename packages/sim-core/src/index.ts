// Resource network
export type {
  ConductorNode,
  ConsumerNode,
  Link,
  Network,
  NetworkNode,
  SourceNode,
  SwitchLink,
  WireLink,
} from "./network/types.ts";
export { isConducting } from "./network/types.ts";
export { supplyPathsTo, type SupplyPath } from "./network/paths.ts";
export {
  evaluate,
  evaluateConsumer,
  getNode,
  type ConsumerState,
  type ConsumerStatus,
} from "./network/evaluate.ts";
export { applyFaults, setSwitch, type NetworkFault } from "./network/faults.ts";
export {
  diagnose,
  type Diagnosis,
  type RootCause,
  type RootCauseReason,
} from "./network/diagnose.ts";

// Perakitan
export {
  DEFECT_KINDS,
  type ActionSpec,
  type AssemblyLog,
  type Defect,
  type DefectKind,
  type PerformedAction,
  type Range,
  type StepEffects,
  type StepRecord,
  type StepSpec,
} from "./assembly/types.ts";
export { detectDefects } from "./assembly/detect.ts";

// Tes
export {
  faultsFromDefects,
  runTest,
  type AttributedFault,
  type Finding,
  type TestInput,
  type TestReport,
  type TestScenario,
} from "./testing/run-test.ts";

// Pengapian
export { runUp, type IgnitionFinding, type MagResult, type MagnetoSpec, type RunUpReport } from "./ignition/run-up.ts";
