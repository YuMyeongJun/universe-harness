/**
 * 수집 대상 식별 — **사람 기억이 아니라 서버에서 확인한다.**
 *
 * ⚠️ 이걸 만든 이유는 실제 사고다. 포트 5000 에 **담당자 것이 아닌 다른 브랜치**의
 *    dev 서버가 떠 있었고, `reuseExistingServer: true` 로 e2e 를 돌렸으면
 *    **그걸 재고 자기 브랜치 결과로 기록**했을 것이다. **에러 없이** 그렇게 된다.
 *
 * 「(로컬 5000)」 이라고 손으로 적으면 그 사고가 안 잡힌다. 포트를 물고 있는 프로세스의
 * 작업 디렉터리를 찾아 **거기 git HEAD 를 읽으면** 잡힌다.
 *
 * ⚠️ **로컬 대상에서만 된다.** 원격 주소는 알 수 없고, **알 수 없으면 안다고 하지 않는다.**
 */
import { execFileSync } from 'node:child_process';

export interface IProvenance {
  detected: boolean;
  /** 사람이 읽고 문서에 박을 한 줄 */
  ref: string | null;
  /** 왜 못 알아냈는지 — 못 알아냈으면 반드시 채운다 */
  reason: string | null;
  detail: { port: number; pid: number; cwd: string; branch: string; commit: string; dirty: boolean } | null;
}

const run = (cmd: string, args: string[], cwd?: string): string | null => {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...(cwd ? { cwd } : {}),
    }).trim();
  } catch {
    return null;
  }
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** 포트를 **LISTEN** 하고 있는 프로세스들. 첫 줄만 집으면 엉뚱한 것(AirPlay 등)이 잡힌다. */
const listenerPids = (port: number): number[] => {
  const out = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp']);
  if (out === null) return [];
  return out
    .split('\n')
    .filter((l) => l.startsWith('p'))
    .map((l) => Number(l.slice(1)))
    .filter((n) => Number.isFinite(n));
};

const cwdOf = (pid: number): string | null => {
  const out = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  if (out === null) return null;
  const line = out.split('\n').find((l) => l.startsWith('n'));
  return line ? line.slice(1) : null;
};

export const detect = (baseUrl: string): IProvenance => {
  const none = (reason: string): IProvenance => ({ detected: false, ref: null, reason, detail: null });

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return none('주소를 읽지 못했습니다.');
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    // 원격은 원리적으로 알 수 없다. 모르는 것을 아는 척하지 않는다.
    return none(`원격 주소(${url.hostname})라 어느 빌드인지 기계가 알 수 없습니다. 직접 적어 주세요.`);
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

  const pids = listenerPids(port);
  if (pids.length === 0) return none(`포트 ${port} 에서 LISTEN 하는 프로세스를 찾지 못했습니다.`);

  // 여러 개가 물고 있으면 **고르지 않는다.** 잘못 고르면 틀린 커밋을 자신 있게 박게 된다.
  const candidates = pids
    .map((pid) => ({ pid, cwd: cwdOf(pid) }))
    .filter((c): c is { pid: number; cwd: string } => c.cwd !== null && c.cwd !== '/')
    .filter((c) => run('git', ['-C', c.cwd, 'rev-parse', '--is-inside-work-tree']) === 'true');

  if (candidates.length === 0) {
    return none(
      `포트 ${port} 를 물고 있는 프로세스(${pids.join(', ')})가 git 작업 트리에서 돌고 있지 않습니다. ` +
        '시스템 서비스일 수 있습니다 (macOS 는 5000 을 AirPlay 가 잡습니다).',
    );
  }
  if (candidates.length > 1) {
    return none(
      `포트 ${port} 에 서버가 ${candidates.length}개 있습니다: ` +
        `${candidates.map((c) => `pid ${c.pid} (${c.cwd})`).join(' · ')}. ` +
        '어느 쪽을 걷고 있는지 기계가 못 고릅니다 — 직접 적어 주세요.',
    );
  }

  const hit = candidates[0] as { pid: number; cwd: string };
  const branch = run('git', ['-C', hit.cwd, 'rev-parse', '--abbrev-ref', 'HEAD']) ?? '(브랜치 불명)';
  const commit = run('git', ['-C', hit.cwd, 'rev-parse', '--short', 'HEAD']) ?? '(커밋 불명)';
  // 커밋만으로는 부족하다 — 미커밋 변경이 있으면 그 커밋의 화면이 아니다.
  const dirty = (run('git', ['-C', hit.cwd, 'status', '--porcelain'], hit.cwd) ?? '') !== '';

  const folder = hit.cwd.split('/').filter(Boolean).slice(-1)[0] ?? hit.cwd;
  return {
    detected: true,
    ref: `${branch} @ ${commit}${dirty ? ' +미커밋변경' : ''} (${folder}, 포트 ${port})`,
    reason: null,
    detail: { port, pid: hit.pid, cwd: hit.cwd, branch, commit, dirty },
  };
};
