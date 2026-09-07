/**
 * JSX 여는 태그 훑개 — **문자열·주석·중괄호를 안다.**
 *
 * ⛔ 왜 부품인가(R117): 이 지식이 `tossQuality.ts` 안에 묻혀 있어서, 밖에서 무언가를 재려면
 * 매번 정규식을 새로 썼다. 그리고 **매번 틀렸다.**
 *   · R116: 중괄호 안의 식별자(`onExcelExport={() => …}`)를 축약 prop 으로 세어 41 을 냈다.
 *     진짜는 8이었고, 「우리 것 하나를 못 잡는다」는 **결론까지 냈다가** 표본을 열어 보고 되돌렸다.
 *   · 응집 법칙이 이미 같은 함정을 적어 뒀다 — 「제네릭 인자 목록이 여는 태그와 똑같이 생겼다」.
 *     적어 뒀는데도 또 밟았다. **적는 것으로는 안 되고 부품이라야 한다.**
 *
 * 재는 법: 엔진 계약 시험(`npm run selftest`)이 known-positive·known-negative 로 잰다.
 */

/** 따옴표 문자열의 끝 다음 위치. 이스케이프를 건너뛴다. */
export const skipQuoted = (source: string, from: number): number => {
  const quote = source[from];
  let index = from + 1;
  while (index < source.length && source[index] !== quote) {
    index += source[index] === '\\' ? 2 : 1;
  }
  return index + 1;
};
/** 주석의 끝 다음 위치. 주석이 아니면 `from` 을 그대로 돌려준다. */
export const skipComment = (source: string, from: number): number => {
  if (source[from] === '/' && source[from + 1] === '/') {
    const newline = source.indexOf('\n', from);
    return newline < 0 ? source.length : newline;
  }
  if (source[from] === '/' && source[from + 1] === '*') {
    const close = source.indexOf('*/', from);
    return close < 0 ? source.length : close + 2;
  }
  return from;
};

/** 여는 태그의 속성 구간을 닫는 `>` 의 위치. 못 찾으면 -1. */
export const jsxTagEnd = (source: string, from: number): number => {
  let index = from;
  let depth = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '/') {
      const after = skipComment(source, index);
      if (after !== index) {
        index = after;
        continue;
      }
    }
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (depth === 0 && char === '>') {
      return index;
    } else if (depth === 0 && char === '<') {
      return -1;
    }
    index += 1;
  }
  return -1;
};

/** `{…}` 의 끝 다음 위치(문자열 안의 중괄호는 세지 않는다). */
const skipBraced = (source: string, from: number): number => {
  let index = from;
  let depth = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
    index += 1;
  }
  return index;
};

/**
 * 여는 태그의 속성 구간 → boolean prop 이름들.
 * 축약형(`fitContent`)과 리터럴(`showCloseButton={false}`)을 **둘 다** 센다.
 * `isTypeArgs` 가 켜지면 이것은 JSX 가 아니라 제네릭 인자 목록이다 — 버려야 한다.
 */
export const booleanPropsOf = (attrs: string): { names: string[]; isTypeArgs: boolean } => {
  const names: string[] = [];
  let isTypeArgs = false;
  let index = 0;

  while (index < attrs.length) {
    /* 공백·주석 건너뛰기 */
    for (;;) {
      if (index < attrs.length && /\s/.test(attrs[index])) {
        index += 1;
        continue;
      }
      const after = skipComment(attrs, index);
      if (after !== index) {
        index = after;
        continue;
      }
      break;
    }
    if (index >= attrs.length) {
      break;
    }
    /* 최상위 쉼표는 JSX 속성 목록에 없다 — 제네릭이다. */
    if (attrs[index] === ',') {
      isTypeArgs = true;
      index += 1;
      continue;
    }
    if (attrs[index] === '{') {
      index = skipBraced(attrs, index); // {...spread}
      continue;
    }
    const name = /^[A-Za-z_$][\w$]*(?:[-:][\w$]+)*/.exec(attrs.slice(index))?.[0];
    if (name === undefined) {
      index += 1;
      continue;
    }
    index += name.length;
    if (name === 'extends' || name === 'keyof' || name === 'typeof') {
      isTypeArgs = true;
    }
    while (index < attrs.length && /\s/.test(attrs[index])) {
      index += 1;
    }
    if (attrs[index] !== '=' || attrs[index + 1] === '=') {
      names.push(name); // 축약형 = 암묵 true
      continue;
    }
    index += 1;
    while (index < attrs.length && /\s/.test(attrs[index])) {
      index += 1;
    }
    if (attrs[index] === '{') {
      const start = index;
      index = skipBraced(attrs, index);
      if (/^\{\s*(?:true|false)\s*\}$/.test(attrs.slice(start, index))) {
        names.push(name);
      }
    } else if (attrs[index] === '"' || attrs[index] === "'") {
      index = skipQuoted(attrs, index);
    } else {
      while (index < attrs.length && !/\s/.test(attrs[index])) {
        index += 1;
      }
    }
  }
  return { names, isTypeArgs };
};

/* ── `quality/copy-state` 의 인자 검사 ────────────────────────────────────────
 * `useEffect(() => setX(…))` 를 통째로 잡던 시절 실측 은하에서 19건이 나왔고 **눈으로 세니
 * 12건이 오탐**이었다(63%). 오탐은 한 종류였다 — **인자가 전부 리터럴인 호출**:
 *   `setFiles([])` · `setTemplate(undefined)` · `setPhoneNumber('')` · `setMounted(true)`
 *   `setValue('categoryCode', ' ')`(react-hook-form 이지 React state 도 아니다)
 * 이것들은 「복사」가 아니라 **초기화·리셋·마운트 통지**다. 규칙이 붙여 주는 처방
 * (「파생값은 계산으로 만들어라」)이 아예 성립하지 않는다 — 계산할 파생값이 없다.
 * 그래서 **식별자를 하나도 참조하지 않는 호출은 세지 않는다.** 19건 → 6건. */
const LITERAL_WORDS = new Set(['true', 'false', 'null', 'undefined']);

/** `set…(` 바로 뒤부터 짝 맞는 `)` 까지 읽어, **식별자를 참조하는가**를 본다. */
export const callArgsReferenceIdentifier = (source: string, from: number): boolean => {
  let index = from;
  let depth = 1;
  let args = '';
  while (index < source.length && depth > 0) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    args += char;
    index += 1;
  }
  const words = args.match(/[A-Za-z_$][\w$]*/g) ?? [];
  return words.some((word) => !LITERAL_WORDS.has(word));
};

