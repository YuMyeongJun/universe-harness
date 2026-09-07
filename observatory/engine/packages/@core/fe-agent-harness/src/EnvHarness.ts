/**
 * `EnvHarness` — 코어 추상 클래스. **프레임워크를 하나도 모른다.**
 *
 * 감싸는 대상(= 각 저장소의 기존 하네스)은 손대지 않는다. 이 클래스가 하는 일은 넷뿐이다:
 *   1) 격리된 워크트리에 스테이지를 세우고(`reset`)
 *   2) 에이전트의 쓰기를 Contract 로 가로채고(`step` · patch)
 *   3) 제출 시 **자식이 구현한** 게이트를 중앙에서 한 번 돌려 판정하고(`step` · submit)
 *   4) 전부 JSONL 궤적으로 남긴다 — WikiSkill 추출이 읽는 유일한 입력이다.
 *
 * 프로젝트 고유의 것은 전부 **아래 훅**으로 내려간다. 확장 경로는 두 개다:
 *   - 상속: `class ReactViteHarness extends EnvHarness` (→ `@plugins/harness-react-vite`)
 *   - 주입: `new PluggableHarness({ ..., plugins: [myPlugin] })` (→ `PluggableHarness.ts`)
 *
 * ⚠️ 이 저장소 컨벤션은 `class` 를 금지한다(CLAUDE.md §3). 그 규칙의 대상은 **앱 소스**이고,
 *    여기는 앱이 아니라 다른 저장소에 얹히는 도구 패키지다 — 확장점을 타입으로 강제하려면
 *    상속 계층이 가장 적은 장치다. 정적 규칙(`repo/no-class`)은 지금도 에이전트 패치에만 돈다.
 */
import path from 'node:path';

import { createSandbox } from './sandbox.ts';
import { createTrajectoryRecorder } from './trajectory.ts';
import type {
  IActionCode,
  IContractLanes,
  IContractVerdict,
  IHarnessConfig,
  IObservation,
  IPatchFile,
  ISandbox,
  ISignal,
  IStageDefinition,
  IStageIO,
  IStaticRule,
  IStepResult,
  ITrajectoryRecorder,
} from './types.ts';

/**
 * 조사 액션에서 막는 것 — 게이트는 부모(러너)가 중앙에서 한 번만 돈다.
 *
 * ⚠️ 실측(2026-09-04, s01 두 번째 완주 시도): 예전 구현은 명령 **문자열 전체**에 정규식을
 *    걸었다. 그래서 `\bvite\b` 가 `cat apps/partners/vite.config.ts` 의 **경로**에 걸렸고,
 *    에이전트는 고쳐야 할 설정 파일을 **읽을 수조차 없었다.** 8스텝을 전부 BLOCKED 로 태우고
 *    reward -0.05 로 끝났다. 경로에 프레임워크 이름이 들어가는 것은 흔한 일이다.
 *    그래서 지금은 **명령 세그먼트의 실행 파일 이름**만 본다.
 */
export const DENIED_EXECUTABLES = [
  'vite',
  'tsc',
  'eslint',
  'jest',
  'vitest',
  'playwright',
  'next',
  'curl',
  'wget',
  'nc',
];

/** 실행 파일을 가리는 껍데기. `npx tsc` 를 통과시키면 deny 는 장식이 된다. */
const PASSTHROUGH = new Set(['npx', 'bunx', 'time', 'nohup', 'env', 'command', 'sudo']);
const PACKAGE_MANAGERS = new Set(['yarn', 'npm', 'pnpm', 'bun']);

/** 세그먼트에서 **실제로 도는 실행 파일**을 찾는다(`npx`·`yarn … exec` 같은 껍데기를 벗긴다). */
const resolveExecutable = (segment: string): string => {
  const tokens = segment.split(/\s+/).filter(Boolean);
  let index = 0;

  while (index < tokens.length) {
    const token = (tokens[index].split('/').pop() ?? '').replace(/\.(?:c|m)?js$/, '');
    if (PASSTHROUGH.has(token) || token.includes('=')) {
      index += 1;
      continue;
    }
    if (PACKAGE_MANAGERS.has(token)) {
      /* `yarn workspace <이름> exec <실행파일>` · `pnpm dlx <실행파일>` */
      const runner = tokens.findIndex((candidate, position) => position > index && (candidate === 'exec' || candidate === 'dlx'));
      if (runner !== -1) {
        index = runner + 1;
        continue;
      }
      return token;
    }
    return token;
  }
  return '';
};

/** 패키지 매니저를 통해 게이트를 부르는 것(`yarn build` 류). */
export const DENIED_SCRIPT = /^(?:yarn|npm|pnpm|bun)\s+(?:run\s+)?(?:build|lint|test|dev|start|preview)\b/;

/** 저장소를 바꾸는 git 명령. 조사에는 필요 없다. */
export const DENIED_GIT_WRITE = /^git\s+(?:push|commit|reset|checkout|clean|rebase|merge|stash)\b/;

/**
 * 막을 이유가 있으면 그 사유를, 없으면 null. 파이프·`&&`·`;` 로 이어진 **세그먼트마다** 본다
 * (`cat x | vite` 같은 우회를 막으려면 첫 토큰만 봐서는 안 된다).
 */
export const probeDenyReason = (command: string, extraPatterns: RegExp[] = []): string | null => {
  const offending = extraPatterns.find((pattern) => pattern.test(command));
  if (offending) {
    return `설정된 금지 패턴 ${String(offending)}`;
  }

  for (const segment of command.split(/&&|\|\||[;|]/)) {
    /* `FOO=1 cmd` 처럼 앞에 붙는 환경변수 대입은 건너뛴다. */
    const trimmed = segment.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)*/, '');
    if (trimmed === '') {
      continue;
    }
    const executable = resolveExecutable(trimmed);
    if (DENIED_EXECUTABLES.includes(executable)) {
      return `실행 파일 \`${executable}\``;
    }
    if (DENIED_SCRIPT.test(trimmed)) {
      return '패키지 매니저 게이트 스크립트';
    }
    if (DENIED_GIT_WRITE.test(trimmed)) {
      return 'git 쓰기 명령';
    }
  }
  return null;
};

/** 주입형 확장. 상속하고 싶지 않은 프로젝트는 이것만 채워 `PluggableHarness` 에 넘긴다. */
export interface IHarnessPlugin {
  id: string;
  stages?: IStageDefinition[];
  /** Contract 정적 레인에 얹을 프로젝트 고유 규칙(예: 배포·인프라). */
  staticRules?: IStaticRule[];
  /** `executeBuildAndTest` 를 대신한다. */
  buildAndTest?: (io: IStageIO) => Promise<ISignal[]>;
  /** `simulateDelivery` 를 대신한다. */
  simulateDelivery?: (io: IStageIO, stage: IStageDefinition) => Promise<ISignal[]>;
}

export abstract class EnvHarness {
  protected readonly config: IHarnessConfig;

  protected sandbox: ISandbox | null = null;
  protected recorder: ITrajectoryRecorder | null = null;
  protected stage: IStageDefinition | null = null;
  protected stepIndex = 0;
  protected rejectCount = 0;
  /** 이번 런에서 에이전트가 실제로 반영한 파일. submit 때 통째로 다시 판정한다. */
  protected readonly touched = new Map<string, string>();

  private catalogCache: Map<string, IStageDefinition> | null = null;

  constructor(config: IHarnessConfig) {
    this.config = config;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 자식이 채우는 자리 (Template Method)
   * ──────────────────────────────────────────────────────────────────── */

  /**
   * **필수.** 빌드/테스트/린트 러너. 프레임워크마다 명령도 산출 파싱도 달라서 코어는 모른다.
   *
   * ⛔ 여기에 "대략 통과한 것 같다" 류를 넣지 마라. 신호의 `measured` 는 반드시 명령의
   *    실제 산출(JSON·종료코드)에서 읽는다. 파이프 뒤 `$?` 로 재면 실패가 0 으로 보인다.
   */
  protected abstract executeBuildAndTest(io: IStageIO): Promise<ISignal[]>;

  /**
   * 배포 시뮬레이션. `contractLanes.delivery` 가 켜진 스테이지의 제출에서만 불린다.
   * 정적 호스팅이 없는 프로젝트는 그대로 두면 된다(빈 배열 = 채점 축 없음).
   */
  protected async simulateDelivery(_io: IStageIO, _stage: IStageDefinition): Promise<ISignal[]> {
    return [];
  }

  /** 자식이 들고 오는 스테이지. `config.stages` 와 합쳐진다(같은 id 면 자식이 이긴다). */
  protected provideStages(): IStageDefinition[] {
    return [];
  }

  /** 자식이 들고 오는 Contract 정적 규칙(공통 규칙 위에 얹힌다). */
  protected provideStaticRules(): IStaticRule[] {
    return [];
  }

  /** 샌드박스에서 링크할 경로. 프로젝트 구조를 아는 것은 자식이다. */
  protected provideLinkPaths(): string[] {
    return this.config.sandbox?.linkPaths ?? ['node_modules'];
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 공개 API — `reset()` / `step()` / `close()`
   * ──────────────────────────────────────────────────────────────────── */

  get stages(): IStageDefinition[] {
    return [...this.catalog().values()];
  }

  get trajectoryPath(): string {
    return this.recorder?.path ?? '';
  }

  findStage(stageId: string): IStageDefinition {
    const found = this.catalog().get(stageId);
    if (!found) {
      throw new Error(`없는 스테이지: ${stageId} (가능: ${[...this.catalog().keys()].join(', ')})`);
    }
    return found;
  }

  async reset(stageId: string): Promise<IObservation> {
    const stage = this.findStage(stageId);
    /* ⚠️ `Math.floor(bigint)` 는 TypeError 다 — 원본 하네스의 이 자리가 reset() 첫 줄에서
       죽는 상태였다(타입체크가 한 번도 안 돌아 안 보였다). Number() 로 먼저 좁힌다. */
    const runId = `${stageId}-${process.pid}-${Number(process.hrtime.bigint() % 100000n)}`;

    this.stage = stage;
    this.stepIndex = 0;
    this.rejectCount = 0;
    this.touched.clear();
    this.recorder = createTrajectoryRecorder({
      dir: this.config.trajectoryDir ?? path.join(this.config.repoRoot, '.harness', 'trajectories'),
      runId,
      stageId,
    });
    this.watchSignals();
    this.sandbox = await createSandbox({
      repoRoot: this.config.repoRoot,
      runId,
      baseRef: this.config.sandbox?.baseRef,
      linkPaths: this.provideLinkPaths(),
      install: this.config.sandbox?.install ?? false,
      installCommand: this.config.commands.install,
    });

    const io = this.io();
    await stage.setup(io);

    /* 결함이 들어간 상태의 산출물을 한 번 만들어 둔다 — 스테이지 관측이 dist 를 읽는다.
       ⛔ 이 빌드는 러너(부모)만 돌린다. 에이전트의 probe 액션에서는 막혀 있다. */
    const boot = await io.exec(this.config.commands.build, { timeoutMs: 20 * 60_000 });
    const briefing = await stage.briefing(io);

    await this.record({ kind: 'reset', bootBuildExit: boot.code, sandbox: this.sandbox.root });

    /* ⛔ boot build 가 빨가면 **여기서 멈춘다.**
       이 하네스의 전제는 「결함이 초록불 아래 숨는다」이다. 시작부터 빌드가 깨졌다면
       그것은 에이전트가 풀 결함이 아니라 **스테이지·은하 배선이 틀린 것**이다.
       ⚠️ 실측으로 당했다: s01 이 exit 1 인데도 브리핑은 「게이트는 전부 초록불이다」라고
       말했고, 러너가 LLM 을 14번 태운 뒤에야 실패했다. 종료코드는 궤적에 **이미 있었는데**
       아무도 안 봤다. 관측 법칙 §3 — 종료코드를 읽어라. */
    if (boot.code !== 0 && !this.config.allowFailingBootBuild) {
      const tail = `${boot.stdout ?? ''}\n${boot.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n');
      await this.close();
      throw new Error(
        [
          `[BOOT BUILD 실패] ${stage.id} — \`${this.config.commands.build}\` 가 exit ${boot.code} 로 끝났다.`,
          '결함을 심기 전에 이미 빨갛다는 뜻이므로 이 스테이지는 이 은하에서 재현되지 않는다.',
          '에이전트를 태우지 않고 멈춘다 (배선을 고치거나 `allowFailingBootBuild: true` 로 넘겨라).',
          '',
          tail,
        ].join('\n'),
      );
    }

    return this.observe(
      [
        `# ${stage.title}`,
        stage.intent,
        briefing,
        `작업 경로: ${this.sandbox.root}`,
        '허용 액션: patch(파일 전체 내용 제출) · probe(읽기 전용 조사) · submit(채점 요청)',
        `남은 스텝: ${stage.maxSteps}`,
      ].join('\n\n'),
      [{ name: 'boot build', ok: boot.code === 0, measured: `exit ${boot.code}` }],
    );
  }

  async step(action: IActionCode): Promise<IStepResult> {
    if (!this.sandbox || !this.stage) {
      throw new Error('reset() 을 먼저 불러라.');
    }
    this.stepIndex += 1;

    if (action.kind === 'patch') {
      return this.applyPatch(action);
    }
    if (action.kind === 'probe' || action.kind === 'shell') {
      return this.runProbe(action);
    }
    return this.submit(action);
  }

  async close(): Promise<void> {
    this.unwatchSignals();
    if (this.sandbox && !this.config.keepSandbox) {
      await this.sandbox.dispose();
    }
    this.sandbox = null;
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 끊었을 때 — **`close()` 가 안 도는 길**
   *
   * ⛔ 실측(R12·R20, R100 에서 고침): Ctrl-C 로 끊으면 `close()` 가 못 돌아
   * 샌드박스 워크트리와 `.harness/runs/` 가 **그 자리에서는 안 치워졌다.** 다음 `reset` 까지
   * 남는다 — 해는 없지만 즉시가 아니고, 무엇보다 **사람이 「끊었으니 치워졌겠지」라고 믿는다.**
   *
   * ⚠️ `SIGKILL` 은 여전히 못 잡는다 — 잡을 수 있는 신호가 아니다. 그것까지 막았다고 하지 않는다.
   * ⚠️ 라이브러리가 `process.on` 을 거는 것은 침범이라, `cleanupOnSignal: false` 로 끌 수 있다.
   * ──────────────────────────────────────────────────────────────────── */

  private signalHandlers: Array<[NodeJS.Signals, () => void]> = [];

  private watchSignals(): void {
    if (this.config.cleanupOnSignal === false || this.signalHandlers.length > 0) {
      return;
    }
    for (const signal of ['SIGINT', 'SIGTERM'] as NodeJS.Signals[]) {
      const handler = () => {
        /* 두 번 눌러도 한 번만 돈다 — 치우는 중에 또 들어오면 그냥 나간다. */
        this.unwatchSignals();
        void this.close()
          .catch(() => { /* 치우다 실패해도 신호는 신호다 — 나가는 것을 막지 않는다 */ })
          .finally(() => {
            /* ⛔ **신호를 삼키지 않는다.** 관례대로 128+신호번호로 나간다 —
               삼키면 부모 프로세스가 「정상 종료」로 읽는다(§3 의 친척이다). */
            process.exit(signal === 'SIGINT' ? 130 : 143);
          });
      };
      process.on(signal, handler);
      this.signalHandlers.push([signal, handler]);
    }
  }

  private unwatchSignals(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }
    this.signalHandlers = [];
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 내부 — 액션 처리
   * ──────────────────────────────────────────────────────────────────── */

  protected async applyPatch(action: IActionCode): Promise<IStepResult> {
    const started = Date.now();
    const files = action.files ?? [];
    const verdict = await this.evaluate(files);

    if (verdict?.status === 'REJECTED') {
      this.rejectCount += 1;
      await this.record({ kind: 'contract', decision: 'REJECTED', files: files.map((file) => file.path), verdict });
      return this.result({
        text: `[CONTRACT REJECTED]\n${verdict.feedback}`,
        reward: -0.1,
        status: 'REJECTED',
        verdict,
        started,
      });
    }

    for (const file of files) {
      await this.sandbox!.write(file.path, file.content);
      this.touched.set(file.path, file.content);
    }
    await this.record({ kind: 'contract', decision: 'ALLOWED', files: files.map((file) => file.path), note: action.note });

    return this.result({
      text: `[CONTRACT ALLOWED] ${files.length}개 파일을 반영했다. 조사하거나 submit 하라.`,
      reward: 0,
      status: 'ALLOWED',
      verdict,
      started,
    });
  }

  protected async runProbe(action: IActionCode): Promise<IStepResult> {
    const started = Date.now();
    const command = action.command ?? '';
    const denied = probeDenyReason(command, this.config.probeDenyList ?? []);

    if (denied) {
      return this.result({
        text: `[BLOCKED] 게이트/네트워크 명령은 러너가 중앙에서 돌린다. 이미 만들어진 산출물과 소스를 읽어라.\n막힌 것: ${command}\n사유: ${denied}\n(파일을 읽는 것은 막지 않는다 — \`cat\`·\`grep\`·\`ls\` 는 그대로 쓸 수 있다.)`,
        reward: -0.05,
        status: 'BLOCKED',
        verdict: null,
        started,
      });
    }

    const executed = await this.sandbox!.exec(command, { timeoutMs: 120_000 });
    await this.record({ kind: 'probe', command, exit: executed.code });

    return this.result({
      text: `$ ${command}\n(exit ${executed.code})\n${`${executed.stdout}${executed.stderr}`.slice(0, 8000)}`,
      reward: 0,
      status: 'ALLOWED',
      verdict: null,
      started,
    });
  }

  protected async submit(action: IActionCode): Promise<IStepResult> {
    const started = Date.now();
    const stage = this.stage!;
    const io = this.io();
    const files: IPatchFile[] = [...this.touched.entries()].map(([filePath, content]) => ({ path: filePath, content }));
    const verdict = await this.evaluate(files);

    if (verdict?.status === 'REJECTED') {
      this.rejectCount += 1;
      await this.record({ kind: 'submit', decision: 'REJECTED-by-contract', verdict });
      return this.result({
        text: `[CONTRACT REJECTED · 제출 반려]\n${verdict.feedback}`,
        reward: -0.1,
        status: 'REJECTED',
        verdict,
        started,
      });
    }

    /* 게이트 → (전부 초록일 때만) 스테이지 채점. 게이트가 빨간데 채점을 하면
       "부분 성공" 처럼 보이는 신호가 궤적에 섞여 추출이 흐려진다. */
    const gates = await this.executeBuildAndTest(io);
    const gatesOk = gates.every((signal) => signal.ok);
    /* ⚠️ 채점을 try 로 감싼다. 감싸기 전엔 스테이지가 던진 ENOENT 가 **프로세스를 죽여**
       궤적 파일이 안 써지고 샌드박스 워크트리가 누수됐다(s03 에서 실측).
       터진 채점은 「없던 일」이 아니라 **빨간 신호**다 — 그래야 SOLVED 가 안 난다. */
    let checks: ISignal[] = [];
    if (gatesOk) {
      try {
        checks = [
          ...(await stage.verify(io)),
          ...(stage.contractLanes.delivery ? await this.simulateDelivery(io, stage) : []),
        ];
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        checks = [{ name: `${stage.id} 채점이 터졌다`, ok: false, measured: reason.split('\n')[0].slice(0, 200) }];
      }
    }

    const gateScore = gates.filter((signal) => signal.ok).length / Math.max(gates.length, 1);
    const checkScore = checks.length ? checks.filter((signal) => signal.ok).length / checks.length : 0;
    const contractBonus = Math.max(0, 0.2 - this.rejectCount * 0.05);
    const reward = Number((0.4 * gateScore + 0.4 * checkScore + contractBonus - 0.02 * this.stepIndex).toFixed(3));
    const solved = gatesOk && checks.length > 0 && checks.every((signal) => signal.ok);

    await this.record({
      kind: 'submit',
      decision: solved ? 'SOLVED' : 'FAILED',
      note: action.note,
      gates,
      checks,
      reward,
      rejects: this.rejectCount,
      diff: (await this.sandbox!.diff()).slice(0, 200_000),
    });

    return this.result({
      text: [solved ? '[SOLVED]' : '[NOT YET]', ...[...gates, ...checks].map(formatSignal)].join('\n'),
      reward,
      status: solved ? 'SOLVED' : 'FAILED',
      verdict,
      started,
      signals: [...gates, ...checks],
      done: solved,
    });
  }

  /* ─────────────────────────────────────────────────────────────────────
   * 내부 — 부품
   * ──────────────────────────────────────────────────────────────────── */

  /** Contract 평가. evaluator 가 없으면 관문 자체가 없는 것으로 본다(막지 않는다). */
  protected async evaluate(files: IPatchFile[]): Promise<IContractVerdict | null> {
    const evaluator = this.config.contract?.evaluator;
    if (!evaluator || files.length === 0) {
      return null;
    }
    return evaluator.evaluate({
      stageId: this.stage!.id,
      intent: this.stage!.intent,
      lanes: this.stage!.contractLanes,
      files,
      extraRules: this.provideStaticRules(),
    });
  }

  protected catalog(): Map<string, IStageDefinition> {
    if (!this.catalogCache) {
      this.catalogCache = new Map(
        [...(this.config.stages ?? []), ...this.provideStages()].map((stage) => [stage.id, stage]),
      );
    }
    return this.catalogCache;
  }

  protected io(): IStageIO {
    if (!this.sandbox) {
      throw new Error('reset() 을 먼저 불러라.');
    }
    const sandbox = this.sandbox;
    return {
      root: sandbox.root,
      exec: sandbox.exec,
      read: sandbox.read,
      write: sandbox.write,
      exists: sandbox.exists,
      log: (message: string) => {
        void this.record({ kind: 'log', message });
      },
    };
  }

  /** 러너가 궤적에 한 줄 남기는 공개 창구. 비용처럼 **하네스 밖에서만 아는 것**을 위한 자리다. */
  async annotate(entry: Record<string, unknown>): Promise<void> {
    await this.record(entry);
  }

  protected record(entry: Record<string, unknown>): Promise<void> {
    return this.recorder?.append({ step: this.stepIndex, ...entry }) ?? Promise.resolve();
  }

  protected observe(text: string, signals: ISignal[]): IObservation {
    const maxSteps = this.stage?.maxSteps ?? 0;
    const remaining = Math.max(0, maxSteps - this.stepIndex);
    /* ⚠️ 실측(2026-09-04, s01 3차): 남은 예산을 reset 때 한 번만 알려 줬더니 에이전트가
       probe 7번으로 조사만 하다 **submit 을 못 하고** 스텝이 끝났다(reward 0).
       매 턴 예산을 보여 주고, 얼마 안 남으면 명시적으로 재촉한다. */
    const budget =
      remaining <= 2
        ? `\n\n⏳ 남은 스텝 ${remaining}/${maxSteps} — **지금 patch 하고 submit 하라.** 스텝을 다 쓰면 실패다.`
        : `\n\n(남은 스텝 ${remaining}/${maxSteps})`;
    return { stageId: this.stage?.id ?? '', step: this.stepIndex, maxSteps, text: `${text}${budget}`, signals };
  }

  private result(input: {
    text: string;
    reward: number;
    status: IStepResult['status'];
    verdict: IContractVerdict | null;
    started: number;
    signals?: ISignal[];
    done?: boolean;
  }): IStepResult {
    const signals = input.signals ?? [];
    return {
      observation: this.observe(input.text, signals),
      reward: input.reward,
      done: Boolean(input.done) || this.stepIndex >= (this.stage?.maxSteps ?? 0),
      status: input.status,
      verdict: input.verdict,
      signals,
      elapsedMs: Date.now() - input.started,
    };
  }
}

/** 레인이 하나라도 켜져 있는가 — 플러그인이 스테이지를 만들 때 쓴다. */
export const anyLaneOn = (lanes: IContractLanes): boolean => Object.values(lanes).some(Boolean);

const formatSignal = (signal: ISignal) =>
  `${signal.ok ? '✅' : '❌'} ${signal.name} ${signal.measured ?? ''} ${signal.detail ?? ''}`.trimEnd();
