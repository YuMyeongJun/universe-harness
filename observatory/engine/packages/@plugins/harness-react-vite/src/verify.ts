/**
 * `fe-harness verify` — **사람(또는 도구를 가진 개발 에이전트)이 고친 코드를 검증한다.**
 *
 * `run` 과 헷갈리지 마라:
 *   - `run <stage>`  : 격리 워크트리에 결함을 주입하고 **도구 없는 에이전트**가 고치게 한다(훈련).
 *   - `verify`       : **지금 워킹트리**를 그대로 재고 판정한다(작업 검증).
 *
 * 순서가 곧 설계다: Contract → 게이트 → (선택) 스테이지 채점.
 * 관문을 먼저 두는 이유는 싸기 때문이다 — 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다.
 */
import { measuredSignals, runSequentialGates } from '@core/fe-agent-harness';
import type { IContractVerdict, ISignal, IStageIO } from '@core/fe-agent-harness';

import type { ReactViteHarness } from './ReactViteHarness.ts';

export interface IVerifyOptions {
  harness: ReactViteHarness;
  /** 변경분을 어디에 견줄 것인가. 기본 `HEAD`. */
  baseRef?: string;
  /** 스테이지 채점 축까지 볼 것인가. */
  stageId?: string;
  log?: (message: string) => void;
}

export interface IVerifyResult {
  verdict: IContractVerdict | null;
  gates: ISignal[];
  checks: ISignal[];
  ok: boolean;
  /** 돌지 않은 축. ⛔ 비어 있지 않은데 `ok` 가 `true` 면 **「전부 봤다」가 아니다**(R146). */
  unmeasured: ISignal[];
}

/** 워킹트리에서 바뀐 소스 파일. 추적되지 않은 새 파일도 포함한다(안 하면 새 컴포넌트가 판정을 피한다). */
const changedFiles = async (io: IStageIO, baseRef: string): Promise<string[]> => {
  const tracked = await io.exec(`git --no-pager diff --name-only ${baseRef} -- . ":(exclude)node_modules"`);
  const untracked = await io.exec('git ls-files --others --exclude-standard');
  return [...new Set(`${tracked.stdout}\n${untracked.stdout}`.split('\n'))]
    .map((line) => line.trim())
    .filter((line) => /\.(ts|tsx)$/.test(line) || /\.github\/workflows\/.*\.ya?ml$/.test(line));
};

export const verifyWorkingTree = async (options: IVerifyOptions): Promise<IVerifyResult> => {
  const log = options.log ?? ((message: string) => console.log(message));
  const io = options.harness.workingTreeIO();
  const stage = options.stageId ? options.harness.findStage(options.stageId) : null;

  /* ── 1) Contract — 바뀐 파일만 본다. 안 바꾼 파일의 오래된 위반으로 작업을 막지 않는다. */
  const paths = await changedFiles(io, options.baseRef ?? 'HEAD');
  const files = await Promise.all(
    paths.map(async (filePath) => ({ path: filePath, content: await io.read(filePath).catch(() => '') })),
  );
  const verdict = await options.harness.evaluateFiles(
    files.filter((file) => file.content !== ''),
    stage,
  );

  if (verdict?.status === 'REJECTED') {
    log(`[CONTRACT REJECTED]\n${verdict.feedback}`);
    log('\n⛔ 게이트는 돌리지 않았다 — 관문에서 막힌 채로 20분짜리 빌드를 돌릴 이유가 없다.');
    /* 게이트는 한 칸도 안 돌았다 — 위 줄이 그렇게 말하고 있다(초록으로 셀 것이 애초에 없다). */
    return { verdict, gates: [], checks: [], ok: false, unmeasured: [] };
  }
  log(verdict ? `[CONTRACT ALLOWED] 변경 파일 ${files.length}개` : '[CONTRACT SKIPPED] 변경된 소스가 없다');

  /* ── 2) 게이트 — 하나라도 죽으면 뒤는 돌리지 않는다. */
  const gates = await options.harness.runGates(io);
  for (const signal of gates) {
    log(formatSignal(signal));
  }
  /* ⛔ **못 잰 축을 초록으로 세지 않는다**(R146). `every(ok)` 하나로 뭉치면
     안 돈 축이 통과로 세어지고, 그것이 이 칸을 만든 이유였다(§8). */
  const gatesOk = measuredSignals(gates).every((signal) => signal.ok);

  /* ── 3) 스테이지 채점 축 — 게이트가 전부 초록일 때만. 죽은 빌드 위의 수치는 거짓이다. */
  let checks: ISignal[] = [];
  if (stage && gatesOk) {
    checks = await runSequentialGates([{ name: stage.id, run: () => stage.verify(io) }]).catch(() => [] as ISignal[]);
    for (const signal of checks) {
      log(formatSignal(signal));
    }
  } else if (stage && !gatesOk) {
    log('\n(게이트가 빨간불이라 스테이지 채점은 건너뛴다)');
  }

  /**
   * **못 잰 축을 판정 앞에 세워 말한다.**
   *
   * ⚠️⚠️ 실측(R146): 이 줄이 없을 때 진짜 은하의 화면은 `❌ lint` 한 줄과 `[NOT YET]` 뿐이었다.
   * build·test 가 통과했는지 아예 안 돌았는지 **읽는 사람이 가릴 방법이 없었다** —
   * 없는 줄은 초록불처럼 읽힌다. 반대쪽에서는 `test` 를 선언도 안 한 은하가
   * `✅ test exit 0` 을 받아 **테스트가 0개인데 통과**로 보였다.
   * ⇒ 판정([SOLVED]/[NOT YET])은 **잰 것으로만** 내리고, 못 잰 것은 **따로 이름을 부른다.**
   */
  const unmeasured = gates.filter((signal) => signal.unmeasured);
  if (unmeasured.length > 0) {
    log(`\n⚠️ 못 잰 축 ${unmeasured.length}개 — **통과가 아니다. 아무도 안 봤다는 뜻이다.**`);
    for (const signal of unmeasured) {
      log(`   ⚪ ${signal.name} — ${signal.unmeasured}`);
    }
  }

  const ok = gatesOk && measuredSignals(checks).every((signal) => signal.ok);
  log(ok ? '\n[SOLVED]' : '\n[NOT YET]');
  if (ok && unmeasured.length > 0) {
    log(`⚠️ 다만 위 ${unmeasured.length}개 축은 재지 않았다 — 초록불이 「전부 봤다」는 뜻이 아니다.`);
  }
  return { verdict, gates, checks, ok, unmeasured };
};

/**
 * ⚪ 는 초록도 빨강도 아니다 — **안 잰 것**이다.
 * ⛔ 이 세 글자를 둘로 줄이지 마라. 줄이는 순간 「못 쟀다」가 「통과」로 둔갑한다(§8).
 */
const formatSignal = (signal: ISignal) =>
  signal.unmeasured
    ? `⚪ ${signal.name} — 못 쟀다: ${signal.unmeasured}`
    : `${signal.ok ? '✅' : '❌'} ${signal.name} ${signal.measured ?? ''} ${signal.detail ? `\n      ${signal.detail}` : ''}`.trimEnd();
