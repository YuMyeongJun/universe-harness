/**
 * **은하의 코드가 어디 사는가** — 한 자리에서 정한다.
 *
 * ## 왜 이 파일이 생겼나
 *
 * 관측이 `` `${g.appDir}/src` `` 를 **세 자리에서** 만들고 있었다(훑기 · 출처 · 드리프트 진단).
 * 그래서 두 가지가 동시에 참이었다:
 *   · 훑개(`scanCodebase`)는 **`targets` 를 받아** 어디든 훑을 수 있는데,
 *   · 부르는 쪽이 **`src/` 를 박아** 그 능력을 못 쓰게 막고 있었다.
 * ⛔ 실측(R163): `src/` 관례를 안 쓰는 저장소(이 우주 자신)를 걸었더니 **파일 0개**를 보고도
 * 화면은 「토큰 0건 · 시맨틱 0건」이었다 — **깨끗한 저장소와 구별이 안 됐다.**
 *
 * ⚠️ 이것이 「범용」의 경계였다. `src/` 는 **관례이지 법이 아니다** —
 * `app/` (Next) · `lib/` · `packages/<이름>/src` 처럼 다른 자리에 사는 저장소가 흔하다.
 *
 * ## ⛔ 기본값을 바꾸지 않았다
 *
 * 기본은 여전히 `['src']` 다. 은하가 **말할 수 있게** 열어 둔 것이지, 자동으로 넓히지 않는다.
 * 자동으로 넓히면 `dist/`·`scripts/` 가 조용히 분모에 들어와 **기준선이 노이즈로 흔들린다** —
 * 「프로브를 하나 만들면 늘고 지우면 준다」가 정확히 그 사고였다(`blind-census` 의 그 자리).
 *
 * ⚠️ 여기 목록을 **다시 적지 마라.** 세 벌로 갈렸던 확장자 목록이 정확히 그렇게 났다(R163).
 */
import path from 'node:path';

/** 은하가 아무 말도 안 했을 때 훑는 곳. ⛔ 관례이지 법이 아니다 — 그래서 은하가 덮어쓸 수 있다. */
export const DEFAULT_CODE_DIRS = ['src'];

/**
 * 이 은하의 코드가 사는 곳 — **저장소 뿌리 기준 상대경로**로 돌려준다.
 *
 * ⚠️ 구분자는 항상 `/` 다. 이 값은 화면에도 나오고 `git -- <pathspec>` 에도 들어가는데,
 * git 은 윈도우에서도 `/` 를 쓴다. `path.join` 이 낸 `\` 를 그대로 넘기면 **조용히 0건**이 된다.
 */
export const codeTargets = (galaxy) => {
  const dirs = Array.isArray(galaxy?.codeDirs) && galaxy.codeDirs.length > 0
    ? galaxy.codeDirs
    : DEFAULT_CODE_DIRS;
  return dirs.map((dir) => path.join(galaxy?.appDir || '.', dir).split(path.sep).join('/'));
};

/** 사람에게 보여 줄 한 줄. 여러 곳이면 전부 말한다 — **어디를 안 봤는지**가 늘 문제였다. */
export const codeTargetLabel = (galaxy) => codeTargets(galaxy).join(' · ');
