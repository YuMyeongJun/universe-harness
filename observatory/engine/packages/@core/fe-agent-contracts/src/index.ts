/**
 * @core/fe-agent-contracts — 토스 표준 기반 공통 검증 규칙 + WikiSkill 추출 프로토콜.
 *
 * 이 패키지는 **규칙과 프롬프트(데이터)** 다. 실행 루프는 `@core/fe-agent-harness` 가,
 * 스택 고유 규칙(배포·번들)은 플러그인이 가진다.
 */
export {
  createContractEvaluator,
  parseVerdict,
  runStaticRules,
  formatFeedback,
  CONTRACT_SYSTEM_PROMPT_PATH,
} from './contract.ts';
export type { IContractOptions } from './contract.ts';
export * from './rules/index.ts';
export { extractWikiCards, foldTrajectory, firstMissingPath, EXTRACT_PROMPT_PATH } from './wiki/extract.ts';
export type { IWikiCard, IExtractOptions } from './wiki/extract.ts';

/* JSX 훑개 — 밖에서 실측할 때 정규식을 새로 쓰지 말라고 내보낸다(R117). */
export { jsxTagEnd, booleanPropsOf, skipComment, skipQuoted } from './rules/jsx.ts';
