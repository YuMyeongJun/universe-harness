import type { IStageDefinition } from '@core/fe-agent-harness';

import type { INextPaths } from '../paths.ts';

import { createStage01 } from './s01-use-client-boundary.ts';

export { createStage01 };

/**
 * 지금은 스테이지가 하나다. **일부러 하나다.**
 *
 * 후보로 검토하고 **뺀 것**들과 이유를 여기 남긴다 — 재현되지 않는 결함을 심으면
 * 「고쳤다」가 아니라 「원래 그랬다」를 초록불로 배우게 되고, 그것이 지어낸 지식이다.
 *
 * · **배럴 파일 `"use client"` 로 인한 클라이언트 그래프 팽창** — 결함 자체는 실재하지만,
 *   번들러가 재수출을 흔들어 털어내는지가 Next/Turbopack 버전과 `sideEffects` 설정에 따라
 *   갈린다. **실제 저장소에서 먼저 재 보고** 재현이 결정적일 때 넣는다.
 * · **정적 → 동적 회귀**(라우트가 조용히 매 요청 렌더로 바뀌는 것) — 싼 증거는
 *   `<distDir>/server/app/<route>.html` 의 유무인데, 그 산출은 Next 의 **문서화되지 않은
 *   내부**다(공개 API 가 아니다). `output.ts` 의 `probePrerender` 가 판정 불가를 판정 불가로
 *   내도록 준비만 해 뒀고, 채점 축으로는 아직 쓰지 않는다.
 */
export const createNextStages = (paths: INextPaths): IStageDefinition[] => [createStage01(paths)];
