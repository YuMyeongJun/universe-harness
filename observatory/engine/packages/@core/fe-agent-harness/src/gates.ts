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

/** 싼 것 → 비싼 것 순서로 돌고, **하나라도 죽으면 뒤는 돌리지 않는다.** */
export const runSequentialGates = async (
  steps: (() => Promise<ISignal | ISignal[]>)[],
): Promise<ISignal[]> => {
  const signals: ISignal[] = [];
  for (const step of steps) {
    const produced = await step();
    signals.push(...(Array.isArray(produced) ? produced : [produced]));
    if (signals.some((signal) => !signal.ok)) {
      return signals;
    }
  }
  return signals;
};
