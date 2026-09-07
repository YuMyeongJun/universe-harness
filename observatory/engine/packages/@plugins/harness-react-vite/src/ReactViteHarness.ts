/**
 * `ReactViteHarness` — 코어 추상 클래스에 **React + Vite + S3/CloudFront 스택을 끼운 플러그인.**
 *
 * 코어(`@core/fe-agent-harness`)는 프레임워크를 모른다. 이 클래스가 채우는 것은 다섯이다:
 *   1) `executeBuildAndTest` — ESLint(JSON 산출) · 빌드 · 유닛 테스트 · 추가 정적 검사
 *   2) `simulateDelivery`   — S3 + CloudFront 시뮬레이터로 딥링크/자산 마스킹 스모크
 *   3) `provideStages`      — Stage 01~04 (번들 꼬임 · SPA 404 · 캐시 무효화 · 품질/접근성)
 *   4) `provideStaticRules` — 스택에 매인 배포(delivery) 레인 규칙
 *   5) **Contract 검증 흡수** — evaluator 를 주입받지 않으면 토스 표준 계약을 스스로 세운다
 *
 * ⛔ **저장소 이름을 여기 적지 마라.** 명령·경로·워크스페이스는 전부 `fe-harness.config.json`
 *    에서 온다(`config.ts`). 이 규칙이 깨지는 순간 이 패키지는 한 프로젝트 전용이 된다.
 *
 * ⛔ 게이트는 **여기서 중앙 집중**으로 한 번만 돈다. 타입 인지 lint 규칙을 쓰는 저장소에서는
 *    파일 하나만 재도 저장소 전체 타입 그래프를 세운다. 동시 실행하면 `eslint ./src` 가
 *    10.3초 → 21분이 된다(whitehole-front 실측). 그래서 스테이지도 에이전트도 게이트를 못 돌린다.
 * ⛔ `lint | tail` 로 재지 마라 — 파이프 뒤의 `$?` 는 마지막 명령의 것이라 실패가
 *    「0 error」로 보인다. 여기서는 `--format json -o` 산출만 증거로 쓴다.
 */
import path from 'node:path';

import { createContractEvaluator, resolveRulePresets } from '@core/fe-agent-contracts';
import {
  EnvHarness,
  createLocalIO,
  parseVitestSummary,
  runCommandGate,
  runLintJsonGate,
  runSequentialGates,
  unmeasuredSignal,
} from '@core/fe-agent-harness';
import type {
  IContractEvaluator,
  IContractVerdict,
  IGateStep,
  IHarnessConfig,
  IPatchFile,
  ISignal,
  IStageDefinition,
  IStageIO,
  IStaticRule,
} from '@core/fe-agent-harness';

import { loadCloudFrontConfig } from './aws/loadConfig.ts';
import { createDistribution, readDeployIntent } from './aws/simulate.ts';
import { cloudfrontConfigPath, DEFAULT_REACT_VITE_PATHS } from './paths.ts';
import type { IReactVitePaths } from './paths.ts';
import { DELIVERY_RULES } from './rules/delivery.ts';
import { createReactViteStages } from './stages/index.ts';

/** lint 게이트 대상. 게이트 통과 조건은 **여기 있는 것 전부 0 error** 다. */
export interface ILintTarget {
  /** 모노레포 워크스페이스 이름. 단일 앱이면 빈 문자열. */
  workspace: string;
  /** eslint 에 넘길 경로. 보통 `./src`. */
  target: string;
}

export interface IReactViteHarnessOptions extends Omit<IHarnessConfig, 'commands' | 'stages'> {
  /** 프로젝트 경로 묶음. 보통 `loadProjectConfig()` 가 채워 준다. */
  paths?: Partial<IReactVitePaths>;
  lintTargets?: ILintTarget[];
  commands?: Partial<IHarnessConfig['commands']>;
  /** 한 폴더만 테스트하는 명령. `<PATH>` 가 치환된다(s04 가 쓴다). */
  testFileCommand?: string;
  /** 스테이지를 더 얹는다(프로젝트 고유 결함 시나리오). */
  extraStages?: IStageDefinition[];
  extraRules?: IStaticRule[];
  /** Contract 규칙 묶음. `contract.evaluator` 를 안 넘겼을 때 이걸로 세운다. */
  contractPresets?: string[];
  /** 판정 레인(LLM) 모델. 관문은 싸고 일관돼야 하므로 기본은 sonnet. */
  contractModel?: string;
  /** 판정 레인을 끄고 결정론 레인만 돌린다(첫 실행·오프라인·CI 스모크). */
  contractStaticOnly?: boolean;
}

/**
 * 패키지 매니저를 모르는 중립 기본 명령 — **설정을 만들 때 쓰라고 있는 값이다**(`init`).
 *
 * ⛔⛔ **주행 중에 이것으로 빈 칸을 메우지 마라**(R146 에서 뽑아냈다). 예전엔 생성자가
 * `{ ...NEUTRAL_COMMANDS, ...options.commands }` 로 조용히 메웠고, 그 결과:
 *   · `test` 를 **선언하지 않은** 은하에서 `npm test` 가 돌아 `✅ test exit 0` 이 찍혔다.
 *     그 은하에는 테스트가 하나도 없다 — 「0건 통과」가 아니라 **못 잰 것**이었다.
 *   · 진짜 은하(yarn · test 스크립트 없음)에서는 같은 자리가 `❌ test exit 1` 이 되어
 *     **우주가 지어낸 명령의 실패를 별의 잘못으로** 돌렸다.
 * 기본값의 자리는 **사람이 보고 고칠 수 있는 설정 파일**이지, 사람이 못 보는 주행 경로가 아니다.
 */
export const NEUTRAL_COMMANDS = {
  install: 'npm ci',
  build: 'npm run build',
  test: 'npm test',
  lintJson: 'npx eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>',
};

const DEFAULT_PRESETS = ['toss', 'a11y', 'tailwind'];

export class ReactViteHarness extends EnvHarness {
  readonly paths: IReactVitePaths;

  private readonly lintTargets: ILintTarget[];
  private readonly testFileCommand: string;
  private readonly extraStages: IStageDefinition[];
  private readonly extraRules: IStaticRule[];
  private readonly evaluator: IContractEvaluator;

  constructor(options: IReactViteHarnessOptions) {
    const paths: IReactVitePaths = { ...DEFAULT_REACT_VITE_PATHS, ...options.paths };

    /* Contract 흡수 — 밖에서 evaluator 를 주면 그것을 쓰고, 안 주면 **토스 표준 계약을 여기서 세운다.**
       그래야 `new ReactViteHarness({ repoRoot })` 한 줄로도 관문이 살아 있다. */
    const evaluator =
      options.contract?.evaluator ??
      createContractEvaluator({
        baseRules: resolveRulePresets(options.contractPresets ?? DEFAULT_PRESETS),
        model: options.contractModel,
        staticOnly: options.contractStaticOnly,
      });

    super({
      ...options,
      stages: [],
      /* ⛔ 빈 칸을 메우지 않는다 — 은하가 **선언한 것만** 들고 간다(위 `NEUTRAL_COMMANDS` 의 ⛔). */
      commands: { ...options.commands },
      sandbox: { linkPaths: paths.linkPaths, ...options.sandbox },
      contract: { evaluator },
    });

    this.paths = paths;
    this.evaluator = evaluator;
    this.lintTargets = options.lintTargets ?? [{ workspace: paths.appWorkspace, target: './src' }];
    this.testFileCommand =
      options.testFileCommand ??
      (paths.appWorkspace
        ? `yarn workspace ${paths.appWorkspace} exec vitest run <PATH> --reporter=basic`
        : 'npx vitest run <PATH> --reporter=basic');
    this.extraStages = options.extraStages ?? [];
    this.extraRules = options.extraRules ?? [];
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 코어가 부르는 자리 (Template Method 구현)
   * ──────────────────────────────────────────────────────────────────── */

  /**
   * 싼 것 → 비싼 것. **하나라도 죽으면 뒤는 돌리지 않는다** — 죽은 빌드 위에서 잰 수는
   * 전부 거짓이고, 궤적에 섞이면 추출이 그 거짓을 카드로 만든다.
   */
  protected async executeBuildAndTest(io: IStageIO): Promise<ISignal[]> {
    const { commands } = this.config;

    /**
     * 선언하지 않은 축은 **돌리지 않고 「못 쟀다」로 낸다**(R146).
     * ⛔ 중립 기본값으로 메우면 두 가지가 다 거짓말이 된다 — 없는 테스트가 통과하거나,
     *    지어낸 명령의 실패가 별의 잘못이 된다. 어느 쪽도 측정이 아니다.
     */
    const declared = (name: string, command: string | undefined, run: () => Promise<ISignal | ISignal[]>): IGateStep => ({
      name,
      run: command
        ? run
        : async () =>
            unmeasuredSignal(
              name,
              `은하가 \`commands.${name}\` 을 선언하지 않았다 — 명령을 지어내지 않는다. 이 축은 아무도 안 봤다.`,
            ),
    });

    /* 타입 검사는 두 자리 중 어느 쪽에 적어도 읽는다.
       ⚠️ 예전엔 `extraGates.typecheck` 만 읽어서, `commands.typecheck` 를 적어 둔 은하의
          타입 검사가 **한 번도 안 돌았다**(R71 이 적어 둔 자리 · R146 에서 실측으로 잡았다). */
    const typecheckCommand = commands.typecheck ?? commands.extraGates?.typecheck;
    const extraGates = Object.entries(commands.extraGates ?? {}).filter(([name]) => name !== 'typecheck');

    return runSequentialGates([
      /* 1) lint — 대상별 JSON 산출을 합산한다(파이프 금지). */
      ...this.lintTargets.map((entry): IGateStep => {
        const name = entry.workspace ? `lint:${entry.workspace}` : 'lint';
        return declared(name, commands.lintJson, () =>
          runLintJsonGate(io, {
            name,
            command: (commands.lintJson ?? '').replaceAll('<WORKSPACE>', entry.workspace).replaceAll('<TARGET>', entry.target),
          }),
        );
      }),
      /* 2) build — 산출은 `paths.distDir` 다. CI 의 `aws s3 sync` 와 같은 경로여야 한다. */
      declared('build', commands.build, () =>
        runCommandGate(io, { name: 'build', command: commands.build ?? '', timeoutMs: 20 * 60_000 }),
      ),
      /* 3) unit — 테스트 요약에서 실패/통과 수를 캔다. */
      declared('test', commands.test, () =>
        runCommandGate(io, {
          name: 'test',
          command: commands.test ?? '',
          timeoutMs: 15 * 60_000,
          parse: parseVitestSummary,
        }),
      ),
      /* 4) 타입 검사 — 선언한 은하만. 안 했으면 **그렇게 말한다.** */
      declared('typecheck', typecheckCommand, () =>
        runCommandGate(io, { name: 'typecheck', command: typecheckCommand ?? '', timeoutMs: 10 * 60_000 }),
      ),
      /* 5) E2E — **가장 비싸므로 맨 뒤**(앞이 빨간불이면 아예 안 돈다).
            ⛔ 브라우저를 우리가 깔지 않는다. 은하가 `commands.e2e` 를 적을 때만 돈다. */
      declared('e2e', commands.e2e, () =>
        runCommandGate(io, { name: 'e2e', command: commands.e2e ?? '', timeoutMs: 30 * 60_000 }),
      ),
      /* 6) 그 밖의 추가 정적 검사 — **적힌 것이 있을 때만 칸을 만든다.**
            ⚠️ `extraGates` 는 축이 아니라 **그릇**이다. 빈 그릇까지 「못 쟀다」로 세면
               없는 눈먼 자리를 가리키게 되고, 그런 경고는 늑대소년이 된다(`lib/blind.mjs` 의 ⚠️). */
      ...extraGates.map(([name, command]): IGateStep => ({
        name,
        run: () => runCommandGate(io, { name, command, timeoutMs: 10 * 60_000 }),
      })),
    ]);
  }

  /**
   * 배포 레인 스테이지의 **공통 스모크**. 스테이지별 채점과 별개로, "워크플로에 적힌 그대로
   * 올렸을 때" 두 가지 불변을 본다:
   *   - 딥링크가 앱을 준다
   *   - **없는 자산은 여전히 실패한다** (403 → index 200 통째 매핑으로 가리지 않았는가)
   *
   * 네트워크는 쓰지 않는다. 배포 사고는 빌드가 초록불인 채로 나므로, 재현 장치가 없으면
   * 이 축은 영원히 안 재진다.
   */
  protected async simulateDelivery(io: IStageIO, stage: IStageDefinition): Promise<ISignal[]> {
    if (this.paths.deepLinks.length === 0) {
      return [
        {
          name: '배포 스모크',
          ok: false,
          measured: 'deepLinks 비어 있음',
          detail: 'fe-harness.config.json 의 `project.deepLinks` 를 앱 라우트로 채워라 — 빈 채로는 딥링크를 잴 수 없다.',
        },
      ];
    }

    const configPath = path.join(io.root, cloudfrontConfigPath(this.paths, envOf(stage.id)));
    const config = await loadCloudFrontConfig(configPath).catch(() => null);
    if (!config) {
      return [
        {
          name: '배포 스모크',
          ok: false,
          measured: '형상 파일 없음',
          detail: `${configPath} 를 읽지 못했다 — CloudFront 형상이 코드로 남아 있지 않으면 재현할 수 없다.`,
        },
      ];
    }

    const distribution = createDistribution(config);
    const intent = await readDeployIntent(path.join(io.root, this.paths.deployWorkflow)).catch(() => null);
    const syncs = intent?.syncs.length
      ? intent.syncs
      : [
          {
            source: this.paths.distDir,
            bucket: '',
            prefix: '',
            options: { deleteRemoved: true, cacheControl: '', exclude: [] },
          },
        ];

    for (const sync of syncs) {
      await distribution
        .sync(path.join(io.root, sync.source), sync.options)
        .catch(() => io.log(`배포 스모크: sync 소스를 못 읽었다 — ${sync.source}`));
    }

    const deepLink = distribution.request(this.paths.deepLinks[0]);
    const missingAsset = distribution.request('/assets/does-not-exist.js');

    return [
      {
        name: '배포 스모크 · 딥링크가 앱을 준다',
        ok: deepLink.status === 200 && /<div id="root"|<script/.test(deepLink.body),
        measured: `${deepLink.status}`,
        detail: '정적 오리진에는 라우트 키가 없다. 폴백 규칙이 형상 파일에 있어야 한다.',
      },
      {
        name: '배포 스모크 · 없는 자산을 가리지 않는다',
        ok: missingAsset.status !== 200,
        measured: `${missingAsset.status}`,
        detail:
          missingAsset.status === 200
            ? '자산 404 를 index.html 200 으로 가렸다 — 브라우저가 JS 자리에서 HTML 을 받고 흰 화면이 된다.'
            : '',
      },
    ];
  }

  protected provideStages(): IStageDefinition[] {
    return [...createReactViteStages(this.paths, { testFileCommand: this.testFileCommand }), ...this.extraStages];
  }

  /** 공통 규칙(`@core/fe-agent-contracts`) 위에 **스택에 매인** 배포 규칙을 얹는다. */
  protected provideStaticRules(): IStaticRule[] {
    return [...DELIVERY_RULES, ...this.extraRules];
  }

  /* ─────────────────────────────────────────────────────────────────────
   * `verify` 가 쓰는 표면 — 샌드박스 없이 **지금 워킹트리**를 재는 길
   * ⚠️ 결함 주입 스테이지에는 절대 쓰지 마라. 사용자의 저장소를 망가뜨린다.
   * ──────────────────────────────────────────────────────────────────── */

  /** 격리 없이 워킹트리를 그대로 읽고 도는 IO. 명령 실행기는 샌드박스와 **같은 구현**이다. */
  workingTreeIO(): IStageIO {
    return createLocalIO(this.config.repoRoot);
  }

  /** 게이트 한 벌을 밖에서 부를 수 있게 연다(`verify`). 순서·중단 규칙은 그대로다. */
  runGates(io: IStageIO): Promise<ISignal[]> {
    return this.executeBuildAndTest(io);
  }

  /**
   * 파일 묶음을 Contract 로 판정한다.
   * 스테이지를 주면 그 스테이지의 레인 프로필을, 안 주면 배포까지 포함한 전 레인을 켠다.
   */
  evaluateFiles(files: IPatchFile[], stage: IStageDefinition | null): Promise<IContractVerdict | null> {
    if (files.length === 0) {
      return Promise.resolve(null);
    }
    return this.evaluator.evaluate({
      stageId: stage?.id ?? 'verify',
      intent: stage?.intent ?? '작업자가 고친 코드가 계약을 지키는지 본다.',
      lanes: stage?.contractLanes ?? { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: true },
      files,
      extraRules: this.provideStaticRules(),
    });
  }
}

/** 스테이지가 어느 환경 형상을 쓰는지. 캐싱 스테이지만 prod 형상을 본다. */
const envOf = (stageId: string): string => (stageId.includes('cache') ? 'prod' : 'dev');
