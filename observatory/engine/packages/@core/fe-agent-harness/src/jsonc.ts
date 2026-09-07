/**
 * JSONC(주석 있는 JSON)에서 주석을 걷어낸다 — **코어에 있다.**
 *
 * ⚠️ 두 플러그인에 같은 구현이 복제돼 있던 것을 올렸다.
 * 문자열 안의 `//` 를 주석으로 오인하지 않는 것이 이 함수의 전부다.
 *
 * ⚠️ 이 함수를 코어로 옮길 때 **중괄호를 세어 끝을 찾다가 틀렸다** —
 * 정규식 안의 `{` 를 코드로 셌기 때문이다. 「코드를 문자열로 세지 마라」를
 * 이 저장소가 매직 넘버 규칙에서 배웠는데 옮기다가 또 밟았다.
 */
export const stripJsonc = (raw: string): string => {
  let out = '';
  let inString = false;
  let index = 0;

  while (index < raw.length) {
    const char = raw[index];
    const next = raw[index + 1];

    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < raw.length && raw[index] !== '\n') {
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    out += char;
    index += 1;
  }

  /* 후행 쉼표 — 주석을 지우고 나면 `, }` 모양이 흔하게 남는다. */
  return out.replace(/,(\s*[}\]])/g, '$1');
};
