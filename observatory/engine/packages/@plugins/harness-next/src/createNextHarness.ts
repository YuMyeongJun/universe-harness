/**
 * Next 하네스 조립 — **상속하지 않는다.**
 *
 * 코어에는 확장 경로가 둘 있다(`@core/fe-agent-harness/README.md`):
 *   ① `extends EnvHarness`  — 훅을 여럿 덮어써야 할 때
 *   ② `PluggableHarness`    — 스테이지 두어 개면 이게 싸다 ("먼저 여기로 시작하라")
 *
 * 이 플러그인이 코어에 채워야 하는 자리는 셋뿐이다 — 게이트(`buildAndTest`) · 스테이지 ·
 * 정적 규칙. **넷째인 `simulateDelivery` 는 일부러 비운다**(README 「배포는 범위 밖」 참고).
 * `PluggableHarness` 가 그 셋을 전부 받으므로 상속 계층을 새로 세울 이유가 없다.
 *
 * ⚠️ 상속으로 옮겨야 하는 신호는 하나다 — **`provideLinkPaths` 처럼 플러그인 객체에 없는 훅을
 *    덮어써야 할 때.** 지금은 `sandbox.linkPaths` 설정으로 충분하다.
 *
 * ⛔ **저장소 이름을 여기 적지 마라.** 명령·경로·워크스페이스는 전부
 *    `next-harness.config.json` 에서 온다(`config.ts`).
 */
import { createContractEvaluator, resolveRulePresets } from '@core/fe-agent-contracts';
import { PluggableHarness } from '@core/fe-agent-harness';
import type { IHarnessConfig, IHarnessPlugin, IStageDefinition, IStaticRule } from '@core/fe-agent-harness';

import type { ILintTarget } from './config.ts';
import { createNextBuildAndTest } from './gates.ts';
import { DEFAULT_NEXT_PATHS } from './paths.ts';
import type { INextPaths } from './paths.ts';
import { NEXT_BOUNDARY_RULES } from './rules/boundaries.ts';
import { createNextStages } from './stages/index.ts';

export interface INextHarnessOptions extends Omit<IHarnessConfig, 'commands' | 'stages'> {
  /** 프로젝트 경로 묶음. 보통 `loadNextConfig()` 가 채워 준다. */
  paths?: Partial<INextPaths>;
  lintTargets?: ILintTarget[];
  commands?: Partial<IHarnessConfig['commands']>;
  /** 스테이지를 더 얹는다(프로젝트 고유 결함 시나리오). */
  extraStages?: IStageDefinition[];
  extraRules?: IStaticRule[];
  /** Contract 규칙 묶음. `contract.evaluator` 를 안 넘겼을 때 이걸로 세운다. */
  contractPresets?: string[];
  contractModel?: string;
  /** 판정 레인을 끄고 결정론 레인만 돌린다(첫 실행·오프라인·CI 스모크). */
  contractStaticOnly?: boolean;
}

const DEFAULT_PRESETS = ['toss', 'a11y', 'tailwind'];

/** 조립된 플러그인 객체. 게이트를 밖에서 직접 부르고 싶을 때(`verify`) 쓴다. */
export const createNextPlugin = (options: {
  paths: INextPaths;
  commands: IHarnessConfig['commands'];
  lintTargets: ILintTarget[];
  extraStages?: IStageDefinition[];
  extraRules?: IStaticRule[];
}): IHarnessPlugin => ({
  id: 'next',
  stages: [...createNextStages(options.paths), ...(options.extraStages ?? [])],
  staticRules: [...NEXT_BOUNDARY_RULES, ...(options.extraRules ?? [])],
  buildAndTest: createNextBuildAndTest({
    commands: options.commands,
    lintTargets: options.lintTargets,
    paths: options.paths,
  }),
  /* simulateDelivery 는 채우지 않는다 — 코어가 빈 배열을 돌려주고, delivery 레인을 켠
     스테이지가 없으므로 애초에 불리지도 않는다. */
});

export const createNextHarness = (options: INextHarnessOptions): PluggableHarness => {
  const paths: INextPaths = { ...DEFAULT_NEXT_PATHS, ...options.paths };
  /* ⛔ 빈 칸을 메우지 않는다 — 선언한 것만 들고 간다(R146). 메우면 안 잰 축이 초록불이 된다. */
  const commands = { ...options.commands };
  const lintTargets = options.lintTargets ?? [{ workspace: paths.appWorkspace, target: '.' }];

  /* Contract 흡수 — 밖에서 evaluator 를 주면 그것을 쓰고, 안 주면 공통 계약을 여기서 세운다.
     그래야 `createNextHarness({ repoRoot })` 한 줄로도 관문이 살아 있다. */
  const evaluator =
    options.contract?.evaluator ??
    createContractEvaluator({
      baseRules: resolveRulePresets(options.contractPresets ?? DEFAULT_PRESETS),
      model: options.contractModel,
      staticOnly: options.contractStaticOnly,
    });

  return new PluggableHarness({
    ...options,
    stages: [],
    commands,
    sandbox: { linkPaths: paths.linkPaths, ...options.sandbox },
    contract: { evaluator },
    plugins: [
      createNextPlugin({
        paths,
        commands,
        lintTargets,
        extraStages: options.extraStages,
        extraRules: options.extraRules,
      }),
    ],
  });
};
