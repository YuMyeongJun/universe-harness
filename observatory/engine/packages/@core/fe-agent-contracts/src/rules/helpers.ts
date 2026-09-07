/**
 * 정적 규칙 부품. 규칙 하나하나는 **재현 가능**해야 한다 — 같은 파일이면 항상 같은 사유가 나온다.
 */
import type { IContractLanes, IContractReason, IPatchFile, IStaticRule } from '@core/fe-agent-harness';

export const lineOf = (content: string, index: number): number => content.slice(0, index).split('\n').length;

/**
 * **어느 확장자를 규칙에 여는가.** 규칙 20개가 전부 정규식이라, 여는 자리는 여기다.
 *
 * ⚠️ 실측으로 열었다: 같은 내용을 `.tsx` 와 `.jsx` 로 각각 먹여 보니 **양쪽 다 규칙 6개가 물었다**
 * (`quality/naming-intent` · `a11y/img-alt` · `a11y/button-type` · `a11y/input-label` ·
 *  `tailwind/arbitrary-value` · `tailwind/theme-hardcoded`).
 * ⇒ 「JS 를 못 읽는다」는 **규칙의 한계가 아니라 `applies` 한 줄**이었다.
 *
 * ⛔⛔ **확장자 목록은 여기 한 벌뿐이어야 한다 — 세 벌이었다가 갈렸다(R47·R91).**
 * 실측: `applies` 를 열었는데 관측은 **그대로였다.** 훑개(`@plugins/…/scan.ts`)가 **자기 목록을
 * 한 벌 더** 갖고 있었기 때문이다. 그동안 `census` 는 「.js 를 100% 읽는다」, `observe` 는
 * 「못 읽은 파일 2개」라고 **서로 반대말을 했고 아무도 몰랐다.**
 * ⇒ 훑개는 이제 아래 `isSourcePath`·`isBlindPath` 를 **가져다 쓴다. 목록을 다시 적지 마라.**
 * ⚠️ 남은 한 벌은 `lib/blind.mjs` 다 — 엔진 밖(우주 루트)이라 import 로 못 묶는다.
 *    **갈리는지 재는 검사**로 묶어야 한다(`lib/selftest.mjs`).
 */
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
/** JSX 를 담을 수 있는 확장자. */
const JSX_EXT = /\.(tsx|jsx)$/;
/**
 * **코드인데 규칙이 못 읽는 것.** ⛔ `SOURCE_EXT` 와 **겹치면 안 된다** — 겹치면 분모가 두 번 세어진다.
 *
 * ⛔⛔ **`.vue`·`.svelte`·`.astro` 를 여기 남긴 것은 깜빡한 것이 아니다.**
 * 문법이 다르다(`<template>`·`<script>`·`<style>` 블록). 정규식이 `<script>` 안의 JS 를
 * 우연히 맞힐 수는 있어도 **`<template>` 문법은 못 읽는다.** 열면 「읽는다고 말하면서
 * 못 읽는」 상태가 되고, 그건 **못 읽는다고 말하는 것보다 나쁘다** — 분모에서 빠져
 * 아무도 모르게 된다. 여는 조건: 블록을 갈라 템플릿을 따로 읽는 파서가 생겼을 때.
 */
const BLIND_EXT = /\.(vue|svelte|astro)$/;

/**
 * **경로 문자열만으로 판정한다.** 훑개는 파일을 **열기 전에** 물어야 해서 `IPatchFile` 을 못 만든다
 * (내용을 읽고 나서 거르면 안 읽을 파일까지 전부 읽게 된다).
 */
export const isSourcePath = (filePath: string): boolean => SOURCE_EXT.test(filePath);
/** 코드처럼 생겼는데 규칙이 못 읽는 자리인가. **못 읽는 것은 「위반 없음」이 아니라 「안 재진 것」이다.** */
export const isBlindPath = (filePath: string): boolean => BLIND_EXT.test(filePath);

/** **JSX 를 담는 파일** — 태그를 보는 규칙(a11y·tailwind 일부)이 쓴다. */
export const isTsx = (file: IPatchFile): boolean => JSX_EXT.test(file.path);
/** **규칙이 읽는 소스 전부.** ⚠️ `lib/blind.mjs` 의 `READABLE` 과 **같이** 움직여야 한다 — 갈리면 분모가 거짓말한다. */
export const isSource = (file: IPatchFile): boolean => isSourcePath(file.path);
/**
 * 문자열·주석·정규식을 **길이를 지켜** 공백으로 지운다.
 *
 * ⚠️ 왜 길이를 지키나: 줄 번호와 열 위치가 어긋나면 증거가 엉뚱한 줄을 가리킨다.
 *
 * ⚠️ **실측으로 두 번 넓혔다.** 처음엔 따옴표 문자열과 주석만 지웠는데, 엔진 소스
 * 52개 파일에 걸어 보니 오탐이 쏟아졌다:
 *   · 정규식 리터럴 안의 수량자 — `/…{200,}/` 의 `200` 을 매직 넘버로 셌다
 *   · 템플릿 문자열 안의 픽스처 코드 — `` `useState(180)` `` 을 진짜 코드로 셌다
 * 작은 표본에서는 둘 다 안 나왔다. **작은 표본의 통과는 통과가 아니다.**
 *
 * ⛔ 템플릿 리터럴은 `${…}` 안까지 통째로 지운다. 그 안의 진짜 코드도 못 보게 되지만,
 * 이 저장소처럼 **코드를 문자열로 담는 파일**(시험 픽스처)이 많으면 그쪽 오탐이 훨씬 크다.
 * 어느 쪽을 택했는지 적어 둔다 — 반대 실측이 나오면 그때 옮긴다.
 */
export const maskStringsAndComments = (content: string): string => {
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ');
  return content
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/`(?:\\.|[^`\\])*`/g, blank)
    .replace(/'(?:\\.|[^'\\\n])*'/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"/g, blank)
    /* 정규식 리터럴 — 나눗셈과 헷갈리지 않게 **앞 토큰이 연산자/구분자일 때만** 본다. */
    .replace(/(^|[=(,:[!&|?+\-*%^~{;\s])\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g,
      (m, head) => head + blank(m.slice(head.length)));
};

export const isWorkflow = (file: IPatchFile): boolean => /\.github\/workflows\/.*\.ya?ml$/.test(file.path);

/** 매치 → 사유로 바꾸는 공통 헬퍼. `guard` 로 오탐을 걸러낸다. */
export const findAll = (
  file: IPatchFile,
  pattern: RegExp,
  rule: string,
  fix: string,
  guard?: (match: RegExpExecArray) => boolean,
): IContractReason[] => {
  const reasons: IContractReason[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match = regex.exec(file.content);

  while (match !== null) {
    if (!guard || guard(match)) {
      reasons.push({
        rule,
        where: `${file.path}:${lineOf(file.content, match.index)}`,
        evidence: match[0].slice(0, 160).replace(/\n/g, ' ⏎ '),
        fix,
      });
    }
    match = regex.exec(file.content);
  }
  return reasons;
};

/** 정규식 한 줄짜리 규칙을 만드는 설탕. */
export const patternRule = (input: {
  id: string;
  lane: keyof IContractLanes;
  applies: (file: IPatchFile) => boolean;
  pattern: RegExp;
  fix: string;
  guard?: (match: RegExpExecArray) => boolean;
  /**
   * 주석·문자열을 지운 사본에서 찾는다.
   *
   * ⚠️ 켜는 것만 켠다 — 전부 켜면 「문자열 안의 클래스명」을 보는 규칙(tailwind 쪽)이
   * 아무것도 못 찾게 된다. **어느 규칙이 코드를 보고 어느 규칙이 문자열을 보는지**가
   * 갈리는 자리다.
   *
   * ⚠️ 실측: `a11y/semantic-element` 가 **주석 처리된 `onClick`** 을 잡고 있었다 —
   * 남의 저장소 표본 넷 중 둘이 그것이었다. 주석 안의 코드는 안 도는 코드다.
   */
  mask?: boolean;
  /** 이 규칙이 벌하면 안 되는 모양들 — known-negative 에 `fp: <이름>` 이 있어야 한다(R127). */
  falsePositives?: string[];
}): IStaticRule => ({
  id: input.id,
  lane: input.lane,
  falsePositives: input.falsePositives,
  applies: input.applies,
  /* ⚠️ 패턴을 규칙 객체에 남긴다. 없으면 **밖에서 규칙이 바뀌었는지 알 수 없다** —
     `patternRule` 이 만드는 `scan` 클로저는 패턴이 달라도 소스가 똑같기 때문이다.
     실측으로 당했다: 규칙 지문이 규칙 변경을 못 잡았다(R31). */
  pattern: input.pattern,
  scan: (file) => findAll(
    input.mask ? { ...file, content: maskStringsAndComments(file.content) } : file,
    input.pattern, input.id, input.fix, input.guard,
  ),
});
