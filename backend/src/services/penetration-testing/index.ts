export {
  PenetrationTestOrchestrator,
  PenetrationTestOrchestratorFactory
} from "./penetration-test-orchestrator.service";
export { ReconnaissancePhase } from "./phases/reconnaissance.phase";
export { DecisionEngine } from "./decision-engine.service";
export { ExecutionPhase } from "./phases/execution.phase";
export { ChainBuilder } from "./chain-builder.service";
export { ReportGenerator } from "./report-generator.service";

export type {
  Attack,
  AttackChain,
  AttackChainStep,
  AttackPlan,
  AttackResult,
  CreatePenetrationTestOrchestratorInput,
  Decision,
  Evidence,
  ExecutionResult,
  PenetrationTestContext,
  PenetrationTestOrchestratorDependencies,
  PenetrationTestReport,
  PenetrationTestStreamEvent,
  Vulnerability
} from "./penetration-test-orchestrator.service";
export type { ReconResult, ReconnaissancePhaseOptions } from "./phases/reconnaissance.phase";
export type { Evaluation } from "./decision-engine.service";
export type {
  ExecutionPhaseOptions,
  ExecutionResult as ExecutionPhaseResult
} from "./phases/execution.phase";
export type { ReportGeneratorOptions } from "./report-generator.service";
