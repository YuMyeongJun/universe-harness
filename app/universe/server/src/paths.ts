/**
 * 좌표 — **절대 경로를 코드에 적지 않는다.**
 *
 * 이 저장소 규율이다(`tests/coordinates.test.ts` 가 구조로 막는다): 홈 아래 절대 경로가
 * 추적 파일에 들어가면 관문이 문다. 팀원마다 홈이 다르고 윈도우가 섞이기 때문이다.
 *
 * 지식 저장소는 **형제 폴더 상대경로**로 찾는다 — `tc-lint` 를 소비 쪽이 부르는 규약과 같다.
 * 다른 곳에 두었으면 `QA_WORKFLOW_DIR` 환경변수로 덮는다 (그 값은 커밋되지 않는다).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** dist/paths.js → app/universe → app → 저장소 루트 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = resolve(HERE, '../../..');

/** 형제 폴더 이름. 클론하면 저장소 이름이 그대로 폴더명이 된다. */
const SIBLING = 'qa-workflow-v2-main';

export const workflowRoot = (): string =>
  process.env['QA_WORKFLOW_DIR']
    ? resolve(process.env['QA_WORKFLOW_DIR'])
    : resolve(HARNESS_ROOT, '..', SIBLING);

export const domainsDir = (): string => join(workflowRoot(), 'domains');

/**
 * 실측 초안은 **이 저장소 안**에 둔다 — 지식 저장소를 더럽히지 않는다.
 *
 * ⛔⛔ **여기에 계정 비밀번호가 들어간다**(`survey.entry.accountPw`). 그래서 이 자리는
 *    반드시 **gitignore 되는 자리**여야 한다. 실측으로 확인한다:
 *      `git check-ignore -v app/universe/.data/x.json` → `app/universe/.gitignore:4:.data/` (막힌다)
 *    ⚠️ 콘솔이 `qa-harness` 에서 흡수돼 오면서 이 경로만 옛 이름(`app/knowledge`)에 남아 있었다.
 *      그 자리는 **어느 .gitignore 도 안 덮는다**(`git check-ignore` 가 exit 1 로 답한다) —
 *      즉 첫 수집을 하는 순간 계정 정보가 **커밋 대상으로 올라온다.** 이름만 바뀐 것이 아니라
 *      **가려지는 자리에서 안 가려지는 자리로 옮겨진 것**이었다.
 */
export const dataDir = (): string => resolve(HARNESS_ROOT, 'app/universe/.data');

/**
 * 지식 저장소를 찾았는가. **못 찾았으면 조용히 빈 목록을 주지 않는다** —
 * 그건 "도메인 0개"로 보이고, 이 저장소가 가장 싫어하는 "안 잰 것이 통과로 세어지는" 자리다.
 */
export const locate = (): { ok: true; dir: string } | { ok: false; tried: string; hint: string } => {
  const dir = domainsDir();
  if (existsSync(dir)) return { ok: true, dir };
  return {
    ok: false,
    // 형제 경로 규약이 깨진 것이지 도메인이 없는 게 아니다 — 화면에 그대로 띄운다.
    tried: dir,
    hint: `두 저장소를 같은 부모 폴더 아래 두거나, QA_WORKFLOW_DIR 로 지식 저장소 경로를 지정하세요.`,
  };
};
