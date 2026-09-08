/**
 * 좌표 — **절대 경로를 코드에 적지 않는다.**
 *
 * 이 저장소 규율이다(`tests/coordinates.test.ts` 가 구조로 막는다): 홈 아래 절대 경로가
 * 추적 파일에 들어가면 관문이 문다. 팀원마다 홈이 다르고 윈도우가 섞이기 때문이다.
 *
 * ⚠️⚠️ 전에는 이 파일이 **형제 폴더의 남의 저장소**(`qa-workflow-v2-main`)를 찾는
 * `SIBLING`·`workflowRoot`·`domainsDir`·`locate` 를 들고 있었다. 그 길과 그것을 쓰던
 * 라우트 13개를 **전부 끊었다** — 이 콘솔이 읽는 정본은 우주 자신뿐이다.
 * ⛔ `QA_WORKFLOW_DIR` 환경변수도 이제 **아무 데도 안 읽는다.** 어딘가에 남아 있어도
 *    조용히 무시되는 것이 아니라, **읽는 코드가 없다.**
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** dist/paths.js → app/universe → app → 저장소 루트 */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 이 콘솔이 붙은 우주의 뿌리.
 *
 * ⚠️ 기본은 **자기 위치에서 거슬러 올라간 자리**다 — 콘솔은 우주 **안에** 산다.
 * ⛔ 그런데 그 계산은 「우주가 실재하는가」를 **한 번도 안 묻는다.** 뿌리가 무엇이든
 *    `resolve` 는 언제나 문자열 하나를 돌려주므로, 없는 자리를 가리켜도 조용히 성공한다.
 *    ⇒ `/api/health` 가 `universe.config.json` 의 **실재를 재서** 답하고,
 *      `UNIVERSE_ROOT` 는 그 갈래를 **실제로 밟아 볼 수 있게** 하는 손잡이다
 *      (`observatory/probe-console.mjs` 가 없는 뿌리를 가리키고 관문에서 확인한다).
 * ⭐ 손잡이가 시험용만은 아니다: 다른 우주 체크아웃에 콘솔을 붙일 때 쓰는 자리이기도 하다.
 */
export const HARNESS_ROOT = process.env['UNIVERSE_ROOT']
  ? resolve(process.env['UNIVERSE_ROOT'])
  : resolve(HERE, '../../..');


/**
 * 화면이 만든 것이 떨어지는 자리 — 좌표 초안 · 주행 결과 · 사람이 붙인 판정.
 *
 * ⛔ **반드시 gitignore 되는 자리여야 한다.** 실측으로 확인한다:
 *      `git check-ignore -v app/universe/.data/x.json` → `app/universe/.gitignore:4:.data/` (막힌다)
 *    ⚠️ 콘솔이 `qa-harness` 에서 흡수돼 오면서 이 경로만 옛 이름(`app/knowledge`)에 남아 있었다.
 *      그 자리는 **어느 .gitignore 도 안 덮는다**(`git check-ignore` 가 exit 1 로 답한다).
 *
 * ⚠️ 전에는 이 주석이 「여기에 **계정 비밀번호**가 들어간다(`survey.entry.accountPw`)」였다.
 *    설문·수집을 지우면서 그 값은 **더 이상 여기 안 떨어진다.** 그래도 gitignore 규율은
 *    그대로 둔다 — 좌표 초안에는 남의 저장소의 로컬 경로가 들어가고, 그건
 *    「팀원마다 홈이 다르다」는 이 파일 머리말의 그 이유에 그대로 걸린다.
 */
export const dataDir = (): string => resolve(HARNESS_ROOT, 'app/universe/.data');
