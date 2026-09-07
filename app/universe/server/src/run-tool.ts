/**
 * 저장소의 도구(`bin/*.mjs` · `observatory/*.mjs`)를 **부르는 한 자리.**
 *
 * ⛔ 자리가 둘이면 하나만 고쳐진다(R47·R91). cwd 를 저장소 뿌리로 고정하는 것 · 시간 제한 ·
 *    버퍼 · 종료코드를 읽는 방식이 라우트마다 달라지면, 어떤 라우트는 매달리고 어떤 라우트는
 *    잘린 stdout 을 「빈 결과」로 읽는다. ⇒ 여기 하나만 둔다.
 */
import { execFile, type ExecFileException } from 'node:child_process';

import { HARNESS_ROOT } from './paths.js';

export interface IToolRun {
  /**
   * 프로세스의 **실제 종료코드**. `null` 은 「코드로 끝나지 않았다」다 —
   * 신호로 죽었거나(시간 제한) 아예 못 띄웠다. ⛔ `0` 으로 접지 마라.
   */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** 시간 제한에 걸려 끊겼는가. 이건 결과가 아니라 **못 잰 것**이다. */
  killed: boolean;
}

/**
 * node 로 스크립트 하나를 돌린다. **cwd 는 언제나 저장소 뿌리**다 —
 * 도구가 찍는 상대 경로가 부르는 자리마다 달라지면 재현이 안 된다.
 *
 * ⛔ **stdout 과 stderr 를 섞지 않는다.** `observe --json` 은 stdout 만 JSON 이고
 *    사람용 줄은 stderr 로 간다. 섞으면 JSON 파싱이 깨지고, 그 깨짐은 화면에서
 *    「위반 0건」처럼 보인다(부모가 실제로 `2>&1` 로 한 번 헛짚은 자리다).
 */
export const runNodeTool = (
  script: string,
  args: string[],
  opts: { timeoutMs?: number; maxBuffer?: number } = {},
): Promise<IToolRun> =>
  new Promise((done) => {
    execFile(
      process.execPath,
      [script, ...args],
      {
        cwd: HARNESS_ROOT,
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024,
      },
      (err: ExecFileException | null, stdout: string, stderr: string) => {
        const exitCode = typeof err?.code === 'number' ? err.code : err ? null : 0;
        done({ exitCode, stdout, stderr, killed: err?.killed === true });
      },
    );
  });
