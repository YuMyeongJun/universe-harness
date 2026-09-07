import type { IStageDefinition } from '@core/fe-agent-harness';

import type { IReactVitePaths } from '../paths.ts';

import { createStage01 } from './s01-vite-monorepo-tangle.ts';
import { createStage02 } from './s02-spa-deeplink.ts';
import { createStage03 } from './s03-cache-invalidation.ts';
import { createStage04 } from './s04-toss-quality.ts';

/** 스테이지가 경로 말고 더 필요로 하는 것. 명령은 프로젝트마다 다르므로 하네스가 넘긴다. */
export interface IStageDeps {
  /** 한 폴더만 테스트하는 명령. `<PATH>` 가 치환된다. */
  testFileCommand: string;
}

export { createStage01, createStage02, createStage03, createStage04 };

/** 순서에 의미가 있다: 빌드 → 배포 경로 → 배포 캐싱 → 코드 품질. 앞 스테이지의 산출(dist)을 뒤가 쓴다. */
export const createReactViteStages = (paths: IReactVitePaths, deps: IStageDeps): IStageDefinition[] => [
  createStage01(paths),
  createStage02(paths),
  createStage03(paths),
  createStage04(paths, deps),
];
