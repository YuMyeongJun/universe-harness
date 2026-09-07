/**
 * **이름이 경로가 되지 않게 한다.**
 *
 * ⚠️⚠️ 실측(R76): `universe galaxy "../../탈출"` 이 **우주 밖 부모 폴더에 파일을 만들었다.**
 * 별 이름은 PascalCase 로 막혀 있었는데 **은하 이름은 아무 검사도 없었다** —
 * 그 이름이 그대로 `galaxies/<이름>.json` 에 이어 붙었기 때문이다.
 *
 * ⛔ 이름은 **파일 이름 한 조각**이다. 경로 구분자도, `..` 도, 숨김 파일도 아니다.
 * 도구가 남의 저장소에 파일을 쓰는 이상 이건 예의가 아니라 **안전**의 문제다.
 */
/**
 * ⚠️ 처음엔 **허용할 글자를 열거**했다(`[A-Za-z0-9._-]`). 그러자 **한글 이름이 막혔다** —
 * 이 우주의 첫 예시 은하 이름이 「실측 은하 A」였는데도. 관측 법칙 §9 가 금한 그 방식이다.
 * ⇒ **위험한 것만** 막는다: 경로 구분자 · `..` · 숨김 · 제어 문자 · 파일 이름에 못 쓰는 글자.
 * 나머지는 사람의 말이다.
 */
const FORBIDDEN = /[\u0000-\u001f<>:"|?*]/;

/** @returns {string|null} 문제가 있으면 사람이 읽을 사유, 없으면 `null`. */
export const nameProblem = (name) => {
  if (typeof name !== 'string' || name.trim() === '') {
    return '비어 있다';
  }
  if (name.includes('/') || name.includes('\\')) {
    return '경로 구분자가 들어 있다 — 이름은 파일 이름 한 조각이다';
  }
  if (name === '.' || name === '..' || name.startsWith('..')) {
    return '`..` 로 시작한다 — 우주 밖으로 나간다';
  }
  if (name.startsWith('.')) {
    return '`.` 로 시작한다 — 숨김 파일이 된다';
  }
  if (FORBIDDEN.test(name)) {
    return '파일 이름에 쓸 수 없는 글자가 들어 있다';
  }
  return null;
};
