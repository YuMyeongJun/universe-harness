/**
 * 샌드박스 — 결함 주입과 측정을 **원본 워크트리 밖**에서 한다.
 *
 * 근거: 측정 갈래와 수정 갈래를 같은 워크트리에서 돌리면 HMR·산출물이 측정을 오염시킨다.
 * 스테이지는 정의상 파일을 망가뜨리므로 **반드시 격리**한다.
 *
 * 의존성은 설치하지 않고 원본의 `node_modules` 를 링크한다(설치 1회 ≈ 수 분).
 * ⚠️ 링크 방식의 한계: 워크트리에서 `package.json` 의 의존성을 **바꾸는** 스테이지는 못 만든다.
 *    그런 스테이지가 필요하면 `install: true` 로 만들어 설치를 돌려라(느리다).
 *
 * ⚠️ 링크할 경로는 **프로젝트마다 다르다.** 코어는 모른다 — `linkPaths` 로 받는다.
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { IExecOptions, IExecResult, ISandbox, IStageIO } from './types.ts';

const execFileAsync = promisify(execFile);

/**
 * 자식 명령에서 `--preserve-symlinks` 를 걷어낸다.
 *
 * 왜: 하네스를 `portal:`/`link:` 로 얹으면 CLI 는 그 플래그가 있어야 돈다. 그런데 그것이
 * `NODE_OPTIONS` 로 새어 들어가면 **측정 대상 빌드의 모듈 해석까지 바뀐다**(심링크된 공유
 * 패키지가 두 벌로 로드되는 등). 게이트가 재는 것은 저장소의 평소 모습이어야 한다.
 */
const cleanNodeOptions = (value: string | undefined): string | undefined => {
  if (!value) {
    return value;
  }
  const kept = value
    .split(/\s+/)
    .filter((token) => token !== '--preserve-symlinks' && token !== '--preserve-symlinks-main')
    .join(' ')
    .trim();
  return kept === '' ? undefined : kept;
};

/**
 * 명령 실행기 한 벌. 샌드박스와 **워킹트리 검증(`verify`)이 같은 구현을 쓴다** —
 * 둘이 갈라지면 "샌드박스에서는 되는데 로컬에서는 안 되는" 차이가 조용히 생긴다.
 */
export const createExecutor = (root: string) =>
  (command: string, opts?: IExecOptions): Promise<IExecResult> =>
    new Promise((resolve) => {
      const child = spawn(command, {
        cwd: opts?.cwd ?? root,
        shell: true,
        env: {
          ...process.env,
          CI: '1',
          FORCE_COLOR: '0',
          NODE_OPTIONS: cleanNodeOptions(process.env.NODE_OPTIONS),
        },
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          child.kill('SIGKILL');
        },
        opts?.timeoutMs ?? 15 * 60_000,
      );

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr, timedOut });
      });
    });

/**
 * 격리 없이 **지금 워킹트리를 그대로** 읽고 도는 IO.
 * ⚠️ 결함 주입 스테이지에는 절대 쓰지 마라 — 사용자의 저장소를 망가뜨린다. `verify` 전용이다.
 */
export const createLocalIO = (root: string): IStageIO => {
  const exec = createExecutor(root);
  return {
    root,
    exec,
    read: (relPath: string) => fs.readFile(path.join(root, relPath), 'utf8'),
    write: async (relPath: string, content: string) => {
      const absolute = path.join(root, relPath);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content, 'utf8');
    },
    exists: (relPath: string) =>
      fs
        .stat(path.join(root, relPath))
        .then(() => true)
        .catch(() => false),
    log: (message: string) => console.log(message),
  };
};

export interface ISandboxOptions {
  repoRoot: string;
  runId: string;
  baseRef?: string;
  linkPaths?: string[];
  install?: boolean;
  installCommand?: string;
}

/**
 * **죽은 샌드박스를 치운다.**
 *
 * ⚠️ 실측: 에피소드가 10분 상한에 걸려 **SIGKILL** 되자 `close()` 가 못 돌아
 * `.harness/runs/<runId>/` 와 git worktree 가 남았다. 손으로 치웠다.
 *
 * ⛔ **SIGKILL 은 못 잡는다.** 신호 처리기로는 이 경우를 못 막는다 —
 * 그래서 **다음 `reset` 이 치운다.** 죽음을 막는 대신 시체를 치우는 쪽이다.
 *
 * ⚠️ **살아 있는 것을 지우면 안 된다.** 같은 저장소에서 두 에피소드가 동시에 돌 수 있다.
 * 그래서 나이가 아니라 **주인이 살아 있는가**로 가른다 — 샌드박스마다 `.owner` 에
 * 만든 프로세스의 pid 를 적어 두고, 그 pid 가 죽었을 때만 치운다.
 * `.owner` 가 없는 것은 이 기능 이전에 생긴 것이므로 치운다.
 */
export const sweepDeadSandboxes = async (repoRoot: string): Promise<string[]> => {
  const runsDir = path.join(repoRoot, '.harness', 'runs');
  const names = await fs.readdir(runsDir).catch(() => [] as string[]);
  const swept: string[] = [];

  for (const name of names) {
    const dir = path.join(runsDir, name);
    const owner = await fs.readFile(path.join(dir, '.owner'), 'utf8').catch(() => null);
    if (owner !== null) {
      const pid = Number(owner.trim());
      /* signal 0 은 죽이지 않고 **살아 있는지만** 묻는다. */
      const alive = Number.isFinite(pid) && (() => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      })();
      if (alive) { continue; }
    }
    await fs.rm(dir, { recursive: true, force: true });
    swept.push(name);
  }

  if (swept.length > 0) {
    /* worktree 목록에서도 지운다 — 디렉터리만 지우면 git 이 계속 붙들고 있다. */
    await execFileAsync('git', ['worktree', 'prune'], { cwd: repoRoot }).catch(() => undefined);
  }
  return swept;
};

export const createSandbox = async (options: ISandboxOptions): Promise<ISandbox> => {
  const {
    repoRoot,
    runId,
    baseRef = 'HEAD',
    linkPaths = ['node_modules'],
    install = false,
    installCommand = 'yarn install --mode=skip-build',
  } = options;
  const root = path.join(repoRoot, '.harness', 'runs', runId);

  await fs.mkdir(path.dirname(root), { recursive: true });
  /* 새 샌드박스를 만들기 전에 죽은 것을 치운다. */
  const swept = await sweepDeadSandboxes(repoRoot);
  if (swept.length > 0) {
    console.log(`🧹 죽은 샌드박스 ${swept.length}개를 치웠다 — ${swept.join(' · ')}`);
  }
  await execFileAsync('git', ['worktree', 'add', '--detach', root, baseRef], { cwd: repoRoot });

  /* 주인을 적어 둔다 — 이 프로세스가 죽으면 다음 reset 이 이 자리를 치운다. */
  await fs.writeFile(path.join(root, '.owner'), String(process.pid), 'utf8').catch(() => undefined);

  for (const target of linkPaths) {
    const source = path.join(repoRoot, target);
    const link = path.join(root, target);
    const hasSource = await fs
      .stat(source)
      .then(() => true)
      .catch(() => false);
    if (!hasSource) {
      continue;
    }
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(source, link, 'junction').catch(() => undefined);
  }

  const exec = createExecutor(root);

  if (install) {
    await exec(installCommand, { timeoutMs: 20 * 60_000 });
  }

  const write = async (relPath: string, content: string) => {
    const absolute = path.join(root, relPath);
    if (!absolute.startsWith(root)) {
      throw new Error(`샌드박스 밖으로 쓰려 했다: ${relPath}`);
    }
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf8');
  };

  const read = (relPath: string) => fs.readFile(path.join(root, relPath), 'utf8');

  const exists = (relPath: string) =>
    fs
      .stat(path.join(root, relPath))
      .then(() => true)
      .catch(() => false);

  const diff = async () => {
    /* 새로 만든 파일은 추적 대상이 아니라 `git diff` 에 안 나온다. 궤적에 "무엇을 만들었나" 가
       빠지면 WikiSkill 추출이 반쪽이 된다 — intent-to-add 로 목록에 올린 뒤 뜬다.
       버리는 워크트리이므로 인덱스를 건드려도 안전하다. */
    await exec('git add -N -- . ":(exclude)node_modules"');
    const result = await exec('git --no-pager diff -- . ":(exclude)node_modules"');
    return result.stdout;
  };

  const dispose = async () => {
    await execFileAsync('git', ['worktree', 'remove', '--force', root], { cwd: repoRoot }).catch(() => undefined);
  };

  return { root, runId, exec, read, write, exists, diff, dispose };
};
