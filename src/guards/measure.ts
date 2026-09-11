/**
 * 측정 가드 — 프로젝트를 알지 않는다. 순수 함수다.
 *
 * 여기 있는 것은 전부 **"아무것도 안 재고 통과"를 막는 자리**다.
 * 실측 근거는 docs/tc-lessons.md §1 참고.
 */

/**
 * 측정 대상 개수를 단언한다.
 *
 * **0개는 "위반 없음"이 아니라 미도달·셀렉터 오류 신호다.**
 * 404 페이지엔 찾는 셀렉터가 아예 없어서 "위반 0건"이 된다.
 */
export const assertMeasured = (label: string, count: number, opts: { min?: number } = {}): number => {
  const min = opts.min ?? 1;
  if (!Number.isFinite(count) || count < min) {
    throw new Error(
      `[measure] ${label}: 측정 대상이 ${count}개다(최소 ${min}). ` +
        '0개는 "위반 없음"이 아니라 **미도달·셀렉터 오류** 신호다. 이 결과로 PASS 를 선언하지 마라.',
    );
  }
  return count;
};

/**
 * "A 가 B 를 따라간다"를 단언한다.
 *
 * ⚠️ **일치만으로는 증명이 안 된다.** 두 값이 하한·기본값·fallback 에 나란히 앉아 있으면
 * 연동이 전혀 없어도 같은 값이 나온다. 실측 사고: `canvas 220 / wrap 220` 이 PASS 였는데
 * 래퍼가 `min-height` 하한에 앉아서 생긴 일치였다.
 *
 * @param floor 하한값. 측정값이 여기 앉아 있으면 그 일치는 증거가 아니다.
 */
export const assertFollows = (
  label: string,
  { measured, expected, floor }: { measured: number; expected: number; floor?: number },
): true => {
  if (measured !== expected) {
    throw new Error(`[measure] ${label}: ${measured} ≠ ${expected} — 따라가지 않는다.`);
  }
  if (floor !== undefined && measured === floor) {
    throw new Error(
      `[measure] ${label}: ${measured} 로 일치하지만 그 값이 **하한(${floor})** 이다. ` +
        '하한에 앉은 두 값의 일치는 "따라간다"를 증명하지 못한다. 하한을 벗어난 입력으로 다시 재라.',
    );
  }
  return true;
};

/**
 * 조건이 바뀌면 결과도 바뀌는가를 단언한다.
 *
 * **요소가 항상 존재하면 셀렉터가 정확해도 아무것도 재지 않는다.**
 * "소진 배지가 보인다"는 배지가 늘 떠 있어도 통과한다.
 * 그래서 조건 A 와 조건 B 에서 **달라야** 한다.
 */
export const assertContrast = <T>(
  label: string,
  { whenA, whenB }: { whenA: T; whenB: T },
): true => {
  if (Object.is(whenA, whenB)) {
    throw new Error(
      `[measure] ${label}: 조건 A 와 B 에서 결과가 같다(${String(whenA)}). ` +
        '조건을 바꿔도 안 달라지는 관측은 아무것도 재지 않는다.',
    );
  }
  return true;
};
