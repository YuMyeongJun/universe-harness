/**
 * 빨간불 관문 — **자기 채점 방지의 유일한 방벽.**
 *
 * 에이전트가 TC 도 쓰고 스크립트도 쓰면 자기 채점이다.
 * 그래서 생성된 spec 을 **한 번 돌려 반드시 실패하는지** 본다.
 *
 *   exit === 0  → ⛔ 거부. "처음부터 통과 = 아무것도 재지 않는다"
 *   exit !== 0  → ✅ 수용
 *   spec 미수령 → 재시도 1회 → 그래도 없으면 UNMEASURED
 *
 * ⚠️ 조용히 그냥 진행하지 마라. "재 달라고 했는데 안 재고 통과로 보이는" 자리가 여기다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export type RedFirstVerdict = 'accepted' | 'rejected' | 'unmeasured';

export interface IRedFirstResult {
  verdict: RedFirstVerdict;
  specPath: string;
  exitCode: number | null;
  reason: string;
  output: string;
}

export interface IRedFirstOptions {
  /** spec 을 돌리는 명령. 프로젝트마다 다르므로 반드시 받는다. */
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * spec 이 없을 때 **딱 한 번** 불리는 재생성 훅.
   * 없으면 재시도 없이 바로 ⚪ 로 나간다 — 어느 쪽이든 조용히 통과시키지는 않는다.
   */
  onMissing?: (specPath: string) => void;
}

const runOnce = (
  specPath: string,
  opts: IRedFirstOptions,
): { exitCode: number | null; output: string } => {
  const result = spawnSync(opts.command, [...opts.args, specPath], {
    cwd: opts.cwd ?? process.cwd(),
    encoding: 'utf8',
    timeout: opts.timeoutMs ?? 180_000,
    env: opts.env ?? process.env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { exitCode: result.status, output };
};

/**
 * spec 하나를 판정한다. **구현·기능이 아직 없는 상태에서** 부르는 것이 전제다.
 */
export const verifyRedFirst = (specPath: string, opts: IRedFirstOptions): IRedFirstResult => {
  // spec 미수령 — 재생성 훅이 있으면 1회만 다시 부른다. 조용히 통과시키지 않는다.
  if (!existsSync(specPath)) {
    opts.onMissing?.(specPath);
    if (!existsSync(specPath)) {
      return {
        verdict: 'unmeasured',
        specPath,
        exitCode: null,
        reason:
          'spec 파일이 없다. 재시도 후에도 받지 못했다 — 실패도 통과도 아니다. ' +
          '여기서 조용히 진행하면 "재 달라고 했는데 안 재고 통과"가 된다.',
        output: '',
      };
    }
  }

  const { exitCode, output } = runOnce(specPath, opts);

  if (exitCode === null) {
    return {
      verdict: 'unmeasured',
      specPath,
      exitCode,
      reason: '실행이 타임아웃되거나 죽었다 — 판정할 수 없다.',
      output,
    };
  }

  if (exitCode === 0) {
    return {
      verdict: 'rejected',
      specPath,
      exitCode,
      reason:
        '구현이 없는데 처음부터 통과한다 — 이 spec 은 아무것도 재지 않는다. ' +
        '부정 검증이 약하거나, 관측 대상이 조건과 무관하게 항상 존재할 가능성이 높다.',
      output,
    };
  }

  return {
    verdict: 'accepted',
    specPath,
    exitCode,
    reason: '구현 전 상태에서 실패했다 — 무언가를 재고 있다.',
    output,
  };
};
