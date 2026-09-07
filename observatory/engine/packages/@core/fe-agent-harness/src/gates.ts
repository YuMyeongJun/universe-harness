/**
 * 게이트 부품 — **기존 하네스의 명령을 부르기만 한다.** 판정 로직을 여기서 다시 구현하지 않는다.
 *
 * ⛔ `yarn lint | tail` 금지. 파이프 뒤의 `$?` 는 마지막 명령의 것이라 **실패가 「0 error」로
 *    보인다.** 증거가 되는 것은 `--format json -o` 로 떨어뜨린 JSON 뿐이다.
 * ⛔ 게이트는 러너가 중앙에서 한 번만 돈다. 스테이지 setup 이나 에이전트 probe 액션에서
 *    빌드를 돌리게 두지 마라 — 산출물이 낡으면 조용히 틀린 수가 나온다.
 *
 * 여기 있는 것은 전부 **명령 문자열을 받는 부품**이다. 어떤 명령을 어떤 순서로 도느냐는
 * 플러그인(`executeBuildAndTest`)이 정한다.
 */
import path from 'node:path';

import type { IStageIO, ISignal } from './types.ts';

export interface IEslintFileResult {
  errorCount: number;
  warningCount: number;
  filePath: string;
  messages: { ruleId: string | null; line: number; message: string; severity: number }[];
}

export const tail = (text: string, lines: number): string => text.trim().split('\n').slice(-lines).join('\n');

/** 종료코드만 보는 게이트(build·test·typecheck). `parse` 로 산출에서 수치를 더 캘 수 있다. */
export const runCommandGate = async (
  io: IStageIO,
  options: { name: string; command: string; timeoutMs?: number; parse?: (stdout: string, stderr: string) => string | undefined },
): Promise<ISignal> => {
  const result = await io.exec(options.command, { timeoutMs: options.timeoutMs ?? 15 * 60_000 });
  const measured = options.parse?.(result.stdout, result.stderr);
  return {
    name: options.name,
    ok: result.code === 0,
    measured: measured ?? `exit ${result.code}${result.timedOut ? ' (timeout)' : ''}`,
    detail: result.code === 0 ? '' : tail(`${result.stdout}${result.stderr}`, 40),
  };
};

/**
 * ESLint 를 **JSON 으로 받아** error/warning 을 합산한다.
 * `command` 의 `<OUT>` 자리가 산출 파일 경로로 치환된다.
 */
export const runLintJsonGate = async (
  io: IStageIO,
  options: { name: string; command: string; timeoutMs?: number },
): Promise<ISignal> => {
  const outFile = path.join(io.root, '.harness', `lint-${options.name.replace(/[^a-z0-9]/gi, '-')}.json`);
  await io.exec(`mkdir -p ${path.dirname(outFile)}`);
  await io.exec(options.command.replaceAll('<OUT>', outFile), { timeoutMs: options.timeoutMs ?? 10 * 60_000 });

  const raw = await io.exec(`cat ${outFile} 2>/dev/null || echo "[]"`);
  let files: IEslintFileResult[] = [];
  try {
    files = JSON.parse(raw.stdout) as IEslintFileResult[];
  } catch {
    return { name: options.name, ok: false, detail: 'eslint JSON 을 읽지 못했다 — 명령과 `<OUT>` 치환을 확인하라.' };
  }

  const errorCount = files.reduce((sum, file) => sum + file.errorCount, 0);
  const warningCount = files.reduce((sum, file) => sum + file.warningCount, 0);
  const worst = files
    .flatMap((file) =>
      file.messages.filter((message) => message.severity === 2).map((message) => `${file.filePath}:${message.line} ${message.ruleId ?? ''}`),
    )
    .slice(0, 5);

  return {
    name: options.name,
    ok: errorCount === 0,
    measured: `error ${errorCount} · warning ${warningCount}`,
    detail: worst.join('\n'),
  };
};

/** vitest 요약에서 실패/통과 수를 캔다. 못 캐면 종료코드로 돌아간다. */
export const parseVitestSummary = (stdout: string): string | undefined => {
  const matched = /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed/.exec(stdout);
  return matched ? `failed ${matched[1]} · passed ${matched[2]}` : undefined;
};

/**
 * **못 쟀다**를 내는 신호. 명령이 없거나 앞이 막혀 축이 아예 안 돌았을 때 쓴다.
 * ⛔ `ok` 는 `false` 로 두지만 **빨간불이 아니다** — 세는 쪽이 `unmeasured` 를 보고 갈라야 한다.
 *    `true` 로 두면 안 잰 것이 통과로 세어지고, 그것이 이 칸을 만든 이유였다(§8).
 */
export const unmeasuredSignal = (name: string, why: string): ISignal => ({
  name,
  ok: false,
  unmeasured: why,
});

/** 잰 것만 센다. 못 잰 축은 **초록으로도 빨강으로도** 세지 않는다. */
export const measuredSignals = (signals: ISignal[]): ISignal[] => signals.filter((signal) => !signal.unmeasured);

/** 게이트 한 칸 — **이름을 들고 있다.** 안 돌았을 때 「무엇이 안 돌았는지」 말하려면 이름이 필요하다. */
export interface IGateStep {
  /** 이 칸이 낼 신호의 이름. 앞이 막혀 건너뛸 때 이 이름으로 「못 쟀다」를 낸다. */
  name: string;
  run: () => Promise<ISignal | ISignal[]>;
}

/**
 * 싼 것 → 비싼 것 순서로 돌고, **하나라도 죽으면 뒤는 돌리지 않는다.**
 *
 * ⚠️⚠️ 실측(R146): 예전엔 여기서 그냥 `return` 했다. 그래서 **안 돈 축은 화면에서 사라졌다** —
 * 진짜 은하에서 lint 가 빨간불이 나자 출력에는 `❌ lint` 한 줄뿐이었고, build·test 가
 * 「통과했는지」 「아예 안 돌았는지」 읽는 사람이 가릴 방법이 없었다.
 * 없는 줄은 초록불처럼 읽힌다. ⇒ 끊긴 뒤의 칸을 **「앞이 막혀 못 쟀다」로 적어서 낸다.**
 * 순서를 지키는 것(죽은 빌드 위의 수는 거짓이다)과 **말하지 않는 것은 다른 일이다.**
 */
export const runSequentialGates = async (steps: IGateStep[]): Promise<ISignal[]> => {
  const signals: ISignal[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const produced = await steps[i].run();
    signals.push(...(Array.isArray(produced) ? produced : [produced]));
    /* 이번 칸까지의 결과 중 **잰 것**에 빨간불이 있으면 뒤는 돌리지 않는다. */
    if (measuredSignals(signals).some((signal) => !signal.ok)) {
      for (const skipped of steps.slice(i + 1)) {
        signals.push(unmeasuredSignal(skipped.name, `앞의 게이트가 빨간불이라 돌지 않았다 — 죽은 빌드 위에서 잰 수는 거짓이다`));
      }
      return signals;
    }
  }
  return signals;
};
