/**
 * **궤적이 어느 레인으로 돌았는가** — 그리고 그것을 모를 때 뭐라고 말할 것인가.
 *
 * ⚠️⚠️ 왜 생겼나(실측 R159): `universe extract` 는 **성공한 궤적을 전부** 카드로 뽑는다.
 * 그런데 성공 176건 중 **진짜 모델 주행은 1건**이었고 나머지 175건은 관문이 돌린
 * **같은 대본**(`--lane script`)이다. 대본은 결정론이라 175번을 돌려도 하는 말이 같다 —
 * 그대로 뽑으면 **같은 카드 175장에 모델 175번**이다. 돈이 나가고 지식은 안 는다.
 *
 * ⛔ 그때 대본 주행을 가릴 방법이 **하나도 없었다** — 궤적에 레인을 안 적었기 때문이다.
 *    화면에는 「🛤 레인 — 대본」이라고 한 번 찍고 끝이었다. 화면은 흘러가고 궤적은 남는다.
 *    **남는 자리에 안 적으면 나중에 아무도 못 잰다.**
 *
 * ⚠️ 이 파일은 **판단하지 않는다.** 셋으로 가르기만 한다 —
 * 「뺀다」와 「모른다」를 부르는 쪽이 갈라서 말해야 하기 때문이다(§8).
 */

/** 결정론 대본 레인의 이름 — `bigbang new --lane script`. */
export const SCRIPT_LANE = 'script';

/**
 * 궤적 줄들에서 레인을 읽는다.
 *
 * ⛔ **안 적혀 있으면 `null` 이다 — 「대본이 아니다」가 아니라 「모른다」다.**
 * 레인을 적기 시작한 것은 R160 이라, 그 앞의 궤적에는 이 칸이 없다. 없는 것을
 * 「모델 주행이었다」로 읽으면 옛 대본 175건이 그대로 카드가 된다 — 고치려던 그 결함이다.
 * 반대로 「대본이었다」로 읽으면 **진짜 모델 주행 1건까지 조용히 사라진다.**
 * ⇒ 어느 쪽으로도 짐작하지 않는다. `null` 을 그대로 돌려주고 부르는 쪽이 ⚪ 로 말한다.
 *
 * @param {{kind?: string, lane?: unknown}[]} rows 궤적 한 건의 줄들
 * @returns {string|null} 레인 이름 · 안 적혀 있으면 `null`(**모른다**)
 */
export const laneOf = (rows) => {
  for (const row of rows ?? []) {
    if (row?.kind === 'nebula-start' && typeof row.lane === 'string' && row.lane.trim() !== '') {
      return row.lane;
    }
  }
  return null;
};

/**
 * 성공 궤적을 **셋**으로 가른다. ⛔ 둘이 아니다.
 *
 *   `model`   — 레인이 적혀 있고 대본이 아니다. 카드 후보다.
 *   `script`  — 대본이다. **뺀다**(같은 대본이 같은 카드를 낸다).
 *   `unknown` — 레인이 안 적혀 있다. **통과도 제외도 아니다** — 이름을 부른다.
 *
 * @template {{lane?: string|null}} T
 * @param {T[]} items
 * @returns {{model: T[], script: T[], unknown: T[]}}
 */
export const partitionByLane = (items) => {
  const model = [];
  const script = [];
  const unknown = [];
  for (const item of items ?? []) {
    const lane = item?.lane ?? null;
    if (lane === null) {
      unknown.push(item);
    } else if (lane === SCRIPT_LANE) {
      script.push(item);
    } else {
      model.push(item);
    }
  }
  return { model, script, unknown };
};
