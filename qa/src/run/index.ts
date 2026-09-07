/**
 * 주행 결과 계약 공개 표면.
 *
 * ⛔ 소비 쪽은 `cases` 를 먼저 세지 마라. **`measurable` 을 먼저 보라** —
 * `false` 면 그 주행의 케이스는 전부 ⚪ 고, ❌ 로 세면 제품 결함이 아닌 것을 고치려 든다.
 */
export {
  MIN_ACCEPTED_WHY,
  NON_VERIFYING_ORIGINS,
  validateVerdict,
} from './contract.js';
export type {
  Attribution,
  CaseOrigin,
  CaseStatus,
  ICase,
  ICaseInput,
  IEvidence,
  IPrecondition,
  IRunReport,
  IStats,
  IVerdict,
  IVerdictCheck,
  IVerification,
  VerdictKind,
} from './contract.js';
export { buildRunReport, evaluateDone, measurabilityOf } from './report.js';
export type { IDoneResult, IRunInput, IUnjudged } from './report.js';
export { caseIdOf, fromPlaywrightJson, statusOf } from './playwright.js';
export type { IAdapterOptions, IOriginEntry, IPwJsonReport } from './playwright.js';
