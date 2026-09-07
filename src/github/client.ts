/**
 * `gh` CLI 얇은 래퍼.
 *
 * 설계 원칙 둘:
 *
 * ⭐ **실행 결과를 그냥 믿지 않는다.** 종료 코드 0 이어도 rate limit·부분 성공일 수 있다.
 * ⭐ **실행기를 주입받는다.** 그래야 시험이 네트워크 없이 돈다 — 네트워크에 기대는 시험은
 *    실패했을 때 「코드가 틀렸나 망이 끊겼나」를 구별 못 한다.
 */
import { execFileSync } from 'node:child_process';

import { assertNotRateLimited, UnmeasuredError, type IRepoCoordinate } from './guards.js';
import { repoCoordinateOf } from './guards.js';

export interface IExecResult {
  status: number;
  stdout: string;
  stderr: string;
  /** 응답 헤더 (`gh api -i` 로 받은 경우) */
  headers?: Record<string, string | undefined>;
}

/** 명령 실행기. 시험은 가짜를 넣는다. */
export type Executor = (command: string, args: string[]) => IExecResult;

export const systemExecutor: Executor = (command, args) => {
  try {
    const stdout = execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
};

export interface IClientOptions {
  exec?: Executor;
  /** 쓰기를 실제로 하지 않는다. 무엇을 하려 했는지만 기록한다. */
  dryRun?: boolean;
}

export interface IPlannedWrite {
  method: string;
  path: string;
  body?: unknown;
}

export class GitHubClient {
  private readonly exec: Executor;
  readonly dryRun: boolean;
  /** dryRun 일 때 **하려던 쓰기**를 남긴다 — 조용히 아무것도 안 한 것과 구별하기 위해서다 */
  readonly planned: IPlannedWrite[] = [];

  constructor(options: IClientOptions = {}) {
    this.exec = options.exec ?? systemExecutor;
    this.dryRun = options.dryRun ?? false;
  }

  /** `git remote get-url origin` — 저장소 주소를 코드에 적지 않는다 */
  originUrl(): string {
    const result = this.exec('git', ['remote', 'get-url', 'origin']);
    return result.status === 0 ? result.stdout.trim() : '';
  }

  coordinate(): IRepoCoordinate | null {
    return repoCoordinateOf(this.originUrl());
  }

  /** 토큰 스코프 — 없는 스코프로 쓰려다 조용히 실패하는 것을 막는다 */
  scopes(): string[] {
    const result = this.exec('gh', ['api', '/user', '-i']);
    if (result.status !== 0) {
      throw new UnmeasuredError(`[github] 토큰 스코프를 읽지 못했다: ${result.stderr.trim() || '알 수 없음'}`);
    }
    const line = result.stdout
      .split(/\r?\n/)
      .find((l) => l.toLowerCase().startsWith('x-oauth-scopes:'));
    if (line === undefined) {
      throw new UnmeasuredError('[github] 응답에 x-oauth-scopes 헤더가 없다 — 스코프를 못 쟀다.');
    }
    return line
      .slice(line.indexOf(':') + 1)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }

  /** 읽기. JSON 을 돌려준다. */
  read<T>(label: string, args: string[]): T {
    const result = this.exec('gh', ['api', ...args]);
    assertNotRateLimited(label, { status: result.status === 0 ? 200 : 403, headers: result.headers });
    if (result.status !== 0) {
      throw new Error(`[github] ${label}: 조회 실패 — ${result.stderr.trim() || `exit ${result.status}`}`);
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new Error(
        `[github] ${label}: 응답이 JSON 이 아니다(${result.stdout.length}바이트). ` +
          '조회가 성공한 것처럼 보여도 잰 것이 없다.',
      );
    }
  }

  /**
   * 쓰기.
   *
   * ⚠️ **이것만으로는 쓰기 확인이 아니다.** 부른 쪽이 반드시 다시 읽어
   *    `assertWriteVerified` 로 확인해야 한다. 부분 성공 + 0 종료가 제일 위험하다.
   */
  write<T>(label: string, method: string, path: string, body?: unknown): T | null {
    if (this.dryRun) {
      this.planned.push(body === undefined ? { method, path } : { method, path, body });
      return null;
    }
    const args = ['api', '-X', method, path];
    if (body !== undefined) args.push('--input', '-');
    const result =
      body === undefined
        ? this.exec('gh', args)
        : this.execWithInput('gh', args, JSON.stringify(body));
    assertNotRateLimited(label, { status: result.status === 0 ? 200 : 403, headers: result.headers });
    if (result.status !== 0) {
      throw new Error(`[github] ${label}: 쓰기 실패 — ${result.stderr.trim() || `exit ${result.status}`}`);
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      return null; // 본문 없는 성공(204 등)
    }
  }

  private execWithInput(command: string, args: string[], input: string): IExecResult {
    // 주입된 실행기가 stdin 을 못 받으므로, 본문을 마지막 인자로 넘겨 가짜가 볼 수 있게 한다.
    return this.exec(command, [...args, `--stdin=${input}`]);
  }
}
