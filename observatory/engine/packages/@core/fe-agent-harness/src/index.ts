/**
 * @core/fe-agent-harness — 공개 표면.
 *
 * 프레임워크 고유의 것은 여기 하나도 없다. Vite·Next·AWS 는 플러그인 패키지가 가진다.
 */
export { EnvHarness, probeDenyReason, DENIED_EXECUTABLES, anyLaneOn } from './EnvHarness.ts';
export type { IHarnessPlugin } from './EnvHarness.ts';
export { PluggableHarness } from './PluggableHarness.ts';

/** 스테이지 감사 — 플러그인마다 베끼면 어긋나므로 코어에 둔다. */
export { auditDeclaredParses, auditUndeclaredParses, auditParsesDeclarations, SCHEMA_PARSE_CALL } from './stageAudit.ts';
export type { IStageAuditFailure } from './stageAudit.ts';
export type { IPluggableConfig } from './PluggableHarness.ts';
export { createSandbox, createLocalIO, createExecutor, sweepDeadSandboxes } from './sandbox.ts';

/** 두 플러그인에 복제돼 있던 부품 — 이름 충돌로 드러나 코어로 올렸다. */
export { parseArgv, VALUE_FLAGS } from './argv.ts';
export type { IParsedArgv } from './argv.ts';
export { stripJsonc } from './jsonc.ts';
export type { ISandboxOptions } from './sandbox.ts';
export { createTrajectoryRecorder } from './trajectory.ts';
export { runCommandGate, runLintJsonGate, runSequentialGates, parseVitestSummary, tail } from './gates.ts';
export { callClaude } from './agent/claudeCli.ts';
export type { IClaudeCall, IClaudeResult } from './agent/claudeCli.ts';
export { runEpisode, parseAction, AGENT_PROTOCOL_PATH } from './runner.ts';
export { initializeProjectSettings, formatInitializeResult, AGENT_BEHAVIOR_GUIDE_PATH } from './setup-template.ts';
export type { IInitializeOptions, IInitializeResult, IWrittenFile } from './setup-template.ts';
export type * from './types.ts';
