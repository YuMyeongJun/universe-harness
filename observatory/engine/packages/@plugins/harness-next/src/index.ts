/**
 * @plugins/harness-next — Next.js(App Router) 특화 플러그인.
 *
 * 코어(`@core/fe-agent-harness`)와 계약(`@core/fe-agent-contracts`)은 그대로 쓴다.
 * 다른 스택으로 갈 때 갈아 끼우는 것은 **이 패키지 하나**다.
 *
 * ⛔ 배포 시뮬레이터는 없다. Next 배포는 Node 서버 · Docker · 정적 export · 플랫폼 어댑터로
 *    갈리고 **기능 지원 범위 자체가 대상마다 다르다**(공식 문서의 배포 표). 하나를 재현하면
 *    나머지 저장소에서는 전부 오탐이 된다 — README 「배포는 왜 범위 밖인가」 참고.
 */
export { createNextHarness, createNextPlugin } from './createNextHarness.ts';
export type { INextHarnessOptions } from './createNextHarness.ts';
export { DEFAULT_NEXT_PATHS, inApp, inBuildOutput, seedRoutePath, seedRouteUrl } from './paths.ts';
export type { INextPaths } from './paths.ts';
export { loadNextConfig, stripJsonc, CONFIG_FILE_NAMES, NEUTRAL_NEXT_COMMANDS } from './config.ts';
export type { INextProjectFile, IResolvedNextConfig, ILintTarget } from './config.ts';
export { parseArgv, VALUE_FLAGS } from './argv.ts';
export { createNextBuildAndTest, runBuildOutputCensus } from './gates.ts';
export type { INextGateOptions } from './gates.ts';
export { readClientBundle, findMarker, formatHits, probePrerender, walkFiles } from './output.ts';
export type { IClientBundle, IMarkerHit, IPrerenderProbe } from './output.ts';
export { NEXT_BOUNDARY_RULES, hasUseClient } from './rules/boundaries.ts';
export { createNextStages, createStage01 } from './stages/index.ts';
export { verifyWorkingTree } from './verify.ts';
export type { INextVerifyOptions, INextVerifyResult } from './verify.ts';
