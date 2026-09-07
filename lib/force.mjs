/**
 * 도피구 판정 — **막지 않는다. 사유를 적게 한다.**
 *
 * ⛔ 실측(R105): 이 결정을 **거부 시험**으로 재려 했는데(R102), 그 시험은 「열린 라운드가
 * 있고 관문이 빨갛다」는 **주변 상태에 기댔다.** 라운드를 닫고 나니 「열린 라운드가 없다」로
 * 죽으면서 **다른 이유로 죽는 초록불**이 됐다 — 이 저장소가 §7·§3 에서 반복해 온 그 결함을
 * 내가 시험에 심은 것이다.
 * 결정은 순수 함수라 **상태 없이 잴 수 있다.** 뽑아냈다.
 *
 * 재는 법: `node lib/selftest.mjs`
 */

/**
 * @param {boolean} blocked  빨간 관문이 있는가
 * @param {boolean} forced   `--force` 를 줬는가
 * @param {string|undefined} why `--why` 값
 * @returns {'닫는다'|'막는다'|'사유를 요구한다'|'넘어간다'}
 */
export const forceVerdict = (blocked, forced, why) => {
  if (!blocked) {
    return '닫는다';           /* 관문이 초록이면 도피구를 볼 일이 없다 */
  }
  if (!forced) {
    return '막는다';           /* 빨간불인데 --force 도 없다 */
  }
  if (!why || String(why).trim() === '') {
    return '사유를 요구한다';   /* ⛔ 기록 없이 넘지 못하게 할 뿐 — 막는 것이 아니다 */
  }
  return '넘어간다';
};
