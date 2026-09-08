/**
 * 「**깃 주소를 받아 저장소를 받아 온다**」 — 콘솔의 서버 쪽.
 *
 * ## ⛔⛔ 여기서 받아 오지 않는다 — `bin/clone.mjs` 를 부른다
 *
 * 받는 규율(토큰을 인자로 안 받는다 · 자격이 박힌 주소를 거절한다 · 안 빈 자리를 안 덮는다)은
 * 이미 그 도구가 안다. 서버가 그것을 **다시 구현하면 두 자리가 조용히 갈린다** —
 * 이 저장소가 R47·R91 에서 반복해서 데인 자리다. ⇒ **부르고, 도구가 한 말을 그대로 나른다.**
 *
 * ## ⛔ 토큰은 **서버도 안 본다**
 *
 * 화면에 토큰 칸을 두지 않는다. 인증은 **그 기계의 git 이 이미 아는 것**으로 한다
 * (`gh auth login` · SSH 키 · credential helper). 자격이 없으면 git 이 거절하고,
 * 콘솔은 **그 거절을 그대로 보여 준다** — 대신 물어보지 않는다.
 * ⚠️ 자격이 박힌 주소(`https://<토큰>@…`)도 도구가 거절한다. 그 순간 토큰이 **인자**가 되기 때문이다.
 *
 * ## ⛔ 받는 자리는 `.data/` 안이다
 *
 * 남의 저장소를 이 저장소 아무 데나 풀면 **커밋 대상으로 올라온다.** `.data/` 는 gitignore 다.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { dataDir, HARNESS_ROOT } from './paths.js';
import { runNodeTool } from './run-tool.js';

/** 받아 온 저장소가 쌓이는 자리 — **gitignore 되는 곳**이다. */
export const clonesDir = (): string => join(dataDir(), 'clones');

/** 이름은 **서버가 정하지 않는다** — 주소에서 뽑는 것은 도구의 몫이다. 여기선 모양만 본다. */
export const cloneInputProblem = (url: unknown, name: unknown): string | null => {
  if (typeof url !== 'string' || url.trim() === '') return '깃 주소를 주세요.';
  if (url.length > 500) return '주소가 너무 깁니다.';
  /* ⛔ 자격이 박힌 주소는 **여기서도** 막는다 — 도구도 막지만, 그 값이 서버 로그에 남기 전에 끊는다. */
  if (/^[a-z+]+:\/\/[^/@]*[:@]/i.test(url) && !/^ssh:\/\//i.test(url)) {
    return '주소에 자격이 박혀 있습니다 — 토큰을 빼고 주소만 주세요. 인증은 이 기계의 git 이 합니다.';
  }
  if (name !== undefined && (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name))) {
    return '은하 이름은 영소문자·숫자·하이픈만 됩니다.';
  }
  return null;
};

export interface ICloneResult {
  /** 도구가 실제로 끝난 코드. ⛔ 0 이 아니면 **받아 오지 못한 것**이다. */
  exitCode: number | null;
  ok: boolean;
  /** 시간 제한에 끊겼는가. ⛔ 이건 「못 받았다」가 아니라 **못 쟀다**다. */
  killed: boolean;
  /** 도구가 사람에게 한 말 — **그대로** 나른다. 서버가 요약하지 않는다. */
  say: string;
  /** 받아 온 자리(성공했을 때만). */
  into: string | null;
  /** 좌표 초안 파일(도구가 만들었을 때만). */
  draft: string | null;
}

/**
 * 받아 온다. ⛔ **덮지 않는다** — 같은 이름이 이미 있으면 도구가 거절하고 그 말을 그대로 전한다.
 */
/**
 * ⛔ **가지 이름의 모양을 좁힌다** — 사람이 준 값이 그대로 인자가 되는 자리다(R76).
 * ⚠️ `bin/clone.mjs` 안에도 **같은 검사**가 있다. 두 벌인 것은 사실이고 의도다:
 *    도구는 터미널에서도 불리고, 서버는 화면에서도 불린다 — **각자 자기 입구를 막는다.**
 */
export const branchProblem = (branch: unknown): string | null => {
  if (branch === undefined || branch === null || branch === '') return null;
  if (typeof branch !== 'string') return '가지 이름은 문자열이라야 합니다.';
  if (!/^(?!-)(?!.*\.\.)[^\s~^:?*[\\\u0000-\u001f]{1,255}$/.test(branch)) {
    return `가지 이름이 아닙니다: ${branch}`;
  }
  return null;
};

/**
 * @param branch ⚠️ 안 주면 git 이 **원격의 기본 가지**를 받는다. 잴 대상이 `main` 이 아닌 경우가
 *   흔하므로(작업 가지) 화면이 고를 수 있게 열어 둔다. ⛔ 우주가 짐작해서 채우지 않는다.
 */
export const cloneRepo = async (url: string, name?: string, branch?: string): Promise<ICloneResult> => {
  const into = join(clonesDir(), name ?? url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() ?? 'repo');
  const args = [url, '--into', into];
  if (name !== undefined) args.push('--name', name);
  if (branch !== undefined && branch !== '') args.push('--branch', branch);
  const run = await runNodeTool(join(HARNESS_ROOT, 'bin/clone.mjs'), args, { timeoutMs: 300_000 });
  const draft = join(into, 'universe-galaxy.json');
  return {
    exitCode: run.exitCode,
    ok: run.exitCode === 0,
    /* ⛔ **끊긴 것은 결과가 아니라 못 잰 것**이다(§8). 큰 저장소는 5분을 넘길 수 있다. */
    killed: run.killed,
    /* ⛔ stdout 과 stderr 를 **둘 다** 준다 — git 의 거절은 stderr 로 온다.
       ⚠️ 여기서 섞는 것은 **사람에게 보여 줄 말**이라서다. JSON 을 파싱하는 자리가 아니다. */
    say: `${run.stdout}${run.stderr}`.trim(),
    into: run.exitCode === 0 ? into : null,
    draft: run.exitCode === 0 && existsSync(draft) ? draft : null,
  };
};

export interface IBranchList {
  /** ⛔ `false` 는 「가지가 없다」가 **아니다** — 「못 쟀다」(⚪)다. */
  ok: boolean;
  branches: string[];
  say: string;
  exitCode: number | null;
}

/**
 * 그 저장소의 가지 목록. ⛔ **받아 오지 않는다** — 묻기만 한다.
 * ⚠️ 원격에 붙으므로 느릴 수 있다. 시간 제한에 걸린 것은 결과가 아니라 **못 잰 것**이다.
 */
export const listBranches = async (url: string): Promise<IBranchList> => {
  const run = await runNodeTool(join(HARNESS_ROOT, 'bin/branches.mjs'), [url, '--json'], { timeoutMs: 60_000 });
  try {
    const parsed = JSON.parse(run.stdout) as { ok: boolean; branches: string[]; say: string };
    return { ...parsed, exitCode: run.exitCode };
  } catch {
    /* ⛔ JSON 이 아니면 **못 쟀다**다 — 빈 목록으로 접으면 「가지가 없다」로 보인다. */
    return {
      ok: false,
      branches: [],
      say: `${run.stdout}${run.stderr}`.trim() || '가지 목록을 못 읽었습니다.',
      exitCode: run.exitCode,
    };
  }
};

/**
 * **채운 초안을 은하로 들인다** — `bin/adopt.mjs` 를 부른다.
 *
 * ⛔⛔ 들이는 규율(`TODO:` 가 남으면 거절 · 덮어쓰지 않음 · 커밋되는 `galaxies/` 에 안 씀)은
 * 그 도구가 안다. 서버가 다시 구현하면 **두 자리가 조용히 갈린다**(R47·R91).
 * ⚠️ 이 자리가 없으면 사람은 **CLI 를 아는 사람만** 계획을 끝까지 밟는다 —
 * 화면에서 저장소를 받아 놓고 **등록은 터미널에서** 해야 했다.
 */
export interface IAdoptResult {
  exitCode: number | null;
  ok: boolean;
  killed: boolean;
  /** 도구가 사람에게 한 말 — **그대로** 나른다. 서버가 요약하지 않는다. */
  say: string;
}

/** 초안 파일 경로만 받는다. ⛔ 이름은 도구가 초안에서 읽는다 — 서버가 정하지 않는다. */
export const adoptInputProblem = (draft: unknown): string | null => {
  if (typeof draft !== 'string' || draft.trim() === '') return '초안 파일 경로를 주세요.';
  /* ⛔ **받아 온 자리 안에서만** 들인다 — 아무 경로나 받으면 우주 밖 파일을 읽는 자리가 된다(R76). */
  const at = resolve(draft);
  if (!at.startsWith(`${clonesDir()}/`)) {
    return '이 콘솔이 받아 온 저장소 안의 초안만 들일 수 있습니다.';
  }
  if (!existsSync(at)) return '그런 초안 파일이 없습니다.';
  return null;
};

export const adoptDraft = async (draft: string): Promise<IAdoptResult> => {
  const run = await runNodeTool(join(HARNESS_ROOT, 'bin/adopt.mjs'), [resolve(draft)], { timeoutMs: 60_000 });
  return {
    exitCode: run.exitCode,
    ok: run.exitCode === 0,
    killed: run.killed,
    say: `${run.stdout}${run.stderr}`.trim(),
  };
};

/**
 * **이 기계의 `gh` 가 아는 레포 목록** — `bin/repos.mjs --json` 을 부른다.
 *
 * ⛔⛔ **서버가 gh 를 직접 부르지 않는다.** 토큰 방어(‘`gh auth token` 을 안 부른다’ ·
 * ‘토큰처럼 생긴 것을 지운다’)가 그 도구 안에 있다. 서버가 gh 를 따로 부르면 **그 방어가
 * 안 따라온다** — 이 저장소가 「옮긴 자리에 방어가 안 따라온다」로 여러 번 데인 자리다(R162).
 * ⇒ 부르고, **그 도구가 낸 JSON 을 그대로** 나른다.
 *
 * ⛔ 못 읽으면 「0개」가 아니라 **못 쟀다**로 나른다(§8). gh 가 없거나 로그인이 안 됐을 수 있고,
 * 토큰에 `repo` 가 없으면 **비공개가 안 보인다** — 「없다」와 「안 보인다」는 다른 사실이다.
 */
export interface IRepoList {
  ok: boolean;
  /** 도구가 그대로 낸 것. ⛔ 서버가 모양을 바꾸지 않는다. */
  data: unknown;
  /** 못 읽었을 때 사람이 읽을 말. */
  say: string;
  exitCode: number | null;
}

/**
 * ⛔ **소유자 이름의 모양을 좁힌다.** 사람이 준 문자열이 그대로 인자가 되는 자리라
 * `--` 로 시작하는 값이 오면 **플래그로 읽힌다**(R76 의 그 자리와 같은 결).
 * GitHub 의 계정·조직 이름 규칙: 영숫자와 하이픈, 39자 이하, 하이픈으로 시작·끝나지 않는다.
 */
export const ownerProblem = (owner: unknown): string | null => {
  if (owner === undefined || owner === null || owner === '') return null;
  if (typeof owner !== 'string') return '소유자 이름은 문자열이라야 합니다.';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    return `소유자 이름이 GitHub 의 이름 모양이 아닙니다: ${owner}`;
  }
  return null;
};

/**
 * @param owner 계정 또는 **조직**. ⚠️ 안 주면 `gh` 의 **활성 계정 자신**을 본다 —
 *   실측으로 데인 자리다: 계정이 조직에만 속해 있으면 자기 소유 레포가 **0개**라
 *   화면이 「저장소가 없다」처럼 보인다. 그건 못 본 것이지 없는 것이 아니다(§8).
 */
export const listRepos = async (limit?: number, owner?: string): Promise<IRepoList> => {
  const args = ['--json'];
  /* ⛔ 사람이 준 값을 그대로 인자에 넣지 않는다 — 정수로 좁힌다(R76 의 그 자리). */
  if (Number.isInteger(limit) && (limit as number) > 0) args.push('--limit', String(limit));
  if (owner !== undefined && owner !== '') args.push(owner);
  const run = await runNodeTool(join(HARNESS_ROOT, 'bin/repos.mjs'), args, { timeoutMs: 60_000 });
  if (run.exitCode !== 0) {
    return { ok: false, data: null, say: `${run.stdout}${run.stderr}`.trim(), exitCode: run.exitCode };
  }
  try {
    return { ok: true, data: JSON.parse(run.stdout), say: '', exitCode: 0 };
  } catch {
    /* ⛔ JSON 이 아니면 **못 쟀다**다 — 빈 목록으로 접으면 「레포가 없다」로 보인다. */
    return { ok: false, data: null, say: `목록을 못 읽었습니다(JSON 이 아닙니다): ${run.stdout.slice(0, 200)}`, exitCode: run.exitCode };
  }
};
