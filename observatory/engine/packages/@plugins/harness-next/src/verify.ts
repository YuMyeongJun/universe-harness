/**
 * `next-harness verify` — **사람(또는 도구를 가진 개발 에이전트)이 고친 코드를 검증한다.**
 *
 * `run` 과 헷갈리지 마라:
 *   - `run <stage>` : 격리 워크트리에 결함을 주입하고 **도구 없는 에이전트**가 고치게 한다(훈련).
 *   - `verify`      : **지금 워킹트리**를 그대로 재고 판정한다(작업 검증).
 *
 * 순서가 곧 설계다: Contract → 게이트 → (선택) 스테이지 채점.
 * 관문을 먼저 두는 이유는 싸기 때문이다 — 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다.
 *
 * ⚠️ 하네스 객체가 아니라 **부품**을 받는다. `PluggableHarness` 는 게이트를 밖으로 열어 주지
 *    않으므로(코어를 고칠 수 없다), 게이트 함수와 evaluator 를 그대로 받아 부른다.
 */
import { createLocalIO, runSequentialGates } from '@core/fe-agent-harness';
import type {
  IContractEvaluator,
  IContractVerdict,
  ISignal,
  IStageDefinition,
  IStageIO,
  IStaticRule,
} from '@core/fe-agent-harness';

export interface INextVerifyOptions {
  repoRoot: string;
  evaluator: IContractEvaluator;
  buildAndTest: (io: IStageIO) => Promise<ISignal[]>;
  /** Contract 정적 레인에 얹을 규칙(플러그인이 들고 있는 것). */
  staticRules: IStaticRule[];
  /** 변경분을 어디에 견줄 것인가. 기본 `HEAD`. */
  baseRef?: string;
  /** 스테이지 채점 축까지 볼 것인가. */
  stage?: IStageDefinition | null;
  log?: (message: string) => void;
}

export interface INextVerifyResult {
  verdict: IContractVerdict | null;
  gates: ISignal[];
  checks: ISignal[];
  ok: boolean;
}

/** 워킹트리에서 바뀐 소스 파일. 추적되지 않은 새 파일도 포함한다(안 하면 새 컴포넌트가 판정을 피한다). */
const changedFiles = async (io: IStageIO, baseRef: string): Promise<string[]> => {
  const tracked = await io.exec(`git --no-pager diff --name-only ${baseRef} -- . ":(exclude)node_modules"`);
  const untracked = await io.exec('git ls-files --others --exclude-standard');
  return [...new Set(`${tracked.stdout}\n${untracked.stdout}`.split('\n'))]
    .map((line) => line.trim())
    .filter((line) => /\.(ts|tsx|js|jsx|mjs)$/.test(line));
};

export const verifyWorkingTree = async (options: INextVerifyOptions): Promise<INextVerifyResult> => {
  const log = options.log ?? ((message: string) => console.log(message));
  const io = createLocalIO(options.repoRoot);
  const stage = options.stage ?? null;

  /* ── 1) Contract — 바뀐 파일만 본다. 안 바꾼 파일의 오래된 위반으로 작업을 막지 않는다. */
  const paths = await changedFiles(io, options.baseRef ?? 'HEAD');
  const files = (
    await Promise.all(
      paths.map(async (filePath) => ({ path: filePath, content: await io.read(filePath).catch(() => '') })),
    )
  ).filter((file) => file.content !== '');

  const verdict =
    files.length === 0
      ? null
      : await options.evaluator.evaluate({
          stageId: stage?.id ?? 'verify',
          intent: stage?.intent ?? '작업자가 고친 코드가 계약을 지키는지 본다.',
          lanes: stage?.contractLanes ?? { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: false },
          files,
          extraRules: options.staticRules,
        });

  if (verdict?.status === 'REJECTED') {
    log(`[CONTRACT REJECTED]\n${verdict.feedback}`);
    log('\n⛔ 게이트는 돌리지 않았다 — 관문에서 막힌 채로 20분짜리 빌드를 돌릴 이유가 없다.');
    return { verdict, gates: [], checks: [], ok: false };
  }
  log(verdict ? `[CONTRACT ALLOWED] 변경 파일 ${files.length}개` : '[CONTRACT SKIPPED] 변경된 소스가 없다');

  /* ── 2) 게이트 — 하나라도 죽으면 뒤는 돌리지 않는다. */
  const gates = await options.buildAndTest(io);
  for (const signal of gates) {
    log(formatSignal(signal));
  }
  const gatesOk = gates.every((signal) => signal.ok);

  /* ── 3) 스테이지 채점 축 — 게이트가 전부 초록일 때만. 죽은 빌드 위의 수치는 거짓이다. */
  let checks: ISignal[] = [];
  if (stage && gatesOk) {
    checks = await runSequentialGates([() => stage.verify(io)]).catch(() => [] as ISignal[]);
    for (const signal of checks) {
      log(formatSignal(signal));
    }
  } else if (stage && !gatesOk) {
    log('\n(게이트가 빨간불이라 스테이지 채점은 건너뛴다)');
  }

  const ok = gatesOk && (checks.length === 0 || checks.every((signal) => signal.ok));
  log(ok ? '\n[SOLVED]' : '\n[NOT YET]');
  return { verdict, gates, checks, ok };
};

const formatSignal = (signal: ISignal) =>
  `${signal.ok ? '✅' : '❌'} ${signal.name} ${signal.measured ?? ''} ${signal.detail ? `\n      ${signal.detail}` : ''}`.trimEnd();
