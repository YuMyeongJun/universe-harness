/**
 * **못 읽는 파일을 갈라 본다** — 「코드인데 안 재진 것」과 「애초에 대상이 아닌 것」.
 *
 * ⚠️⚠️ 왜 필요한가: 저장소 12곳을 세어 보니 못 읽는 파일 468개 중 **243개가 생성물**
 * (storybook-static · dist · public), 45개가 설정·빌드 스크립트였다. 그걸 다 합쳐
 * 「16% 를 못 읽는다」고 말하면 **경고가 늑대소년이 된다** — 그리고 사람은 관문을
 * 무시하는 법부터 배운다(`rules/tailwind.ts` R25).
 *
 * ⛔ 여기 쓰는 이름은 **도구가 정한 이름**(`.eslintrc` · `*.config.js` · `dist/`)이라
 * 낡지 않는다. 사람이 정하는 이름을 열거하는 것과 다르다(관측 법칙 §9).
 * 그래도 목록이므로 **밖에서 온 것이 「코드」로 떨어진다** — 안전한 방향이다.
 */

/** 규칙이 읽는 것. 넓히려면 여기가 아니라 규칙 쪽부터 재라. */
export const READABLE = /\.(ts|tsx)$/;

/** 코드처럼 생겼는데 지금 규칙이 못 읽는 것. */
export const CODE_BUT_BLIND = /\.(js|jsx|mjs|cjs|vue|svelte|astro)$/;

const GENERATED = /(^|\/)(dist|build|out|public|storybook-static|coverage|typedocs)\//;
const CONFIG = /(^|\/)(\.?[\w.-]*\.config\.(js|cjs|mjs)|\.eslintrc(\.\w+)?|\.prettierrc(\.\w+)?|\.stylelintrc(\.\w+)?)$/;
const SCRIPT = /(^|\/)scripts?\//;

/**
 * @param {string} relPath 저장소 기준 상대경로
 * @returns {'생성물'|'설정'|'스크립트'|'코드'} — `'코드'` 만 「안 재진 UI」다.
 */
export const classifyBlind = (relPath) => {
  const p = `/${relPath.split('\\').join('/')}`;
  if (GENERATED.test(p)) {
    return '생성물';
  }
  if (CONFIG.test(p)) {
    return '설정';
  }
  if (SCRIPT.test(p)) {
    return '스크립트';
  }
  return '코드';
};
