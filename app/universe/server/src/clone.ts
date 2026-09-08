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
import { join } from 'node:path';

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
export const cloneRepo = async (url: string, name?: string): Promise<ICloneResult> => {
  const into = join(clonesDir(), name ?? url.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).pop() ?? 'repo');
  const args = [url, '--into', into];
  if (name !== undefined) args.push('--name', name);
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
