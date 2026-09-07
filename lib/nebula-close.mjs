/**
 * 성운 줄에 **줄을 긋는다** — 닫힘을 기계가 잇는 자리.
 *
 * ⛔ 실측(R96): 승격은 기계가 하는데(`round close`) **닫는 것은 사람이 손으로** 줄을 그어야 했다.
 * 한쪽만 자동이면 기록은 한쪽으로만 자란다 — 성운이 **이미 고친 것을 열려 있다고** 말하고 있었다
 * (R85 는 R87 이, R89 는 R95 가 닫았는데 두 줄 다 떠 있었다).
 *
 * ⚠️ **줄을 긋는 라운드와 고친 라운드가 다를 수 있다.** 한꺼번에 넷을 그었는데 실제로 고친 것은
 * R87·R88·R95 였다 — 「닫힘 — R96」은 틀린 말이다. 그래서 `closer` 를 따로 받는다.
 *
 * 재는 법: `node lib/selftest.mjs`
 */

/**
 * @param {string} body    성운 문서 전체
 * @param {string} target  출처 문구 (예: `R89 변경 정직성`)
 * @param {string|null} closer 실제로 고친 라운드 (없으면 긋는 라운드를 적는다)
 * @param {string} roundId 줄을 긋는 라운드
 * @returns {{body: string, found: boolean}} 못 찾으면 `found: false` — **조용히 넘어가지 않는다.**
 */
export const strikeNebulaRow = (body, target, closer, roundId) => {
  /* 이미 그어진 줄은 건드리지 않는다 — 두 번 그으면 표시가 겹친다. */
  const line = body.split('\n').find((l) => l.startsWith('|') && l.includes(target) && !l.includes('~~'));
  if (!line) {
    return { body, found: false };
  }
  const cells = line.split('|');
  const struck = line
    .replace(cells[1], ` ~~${cells[1].trim()}~~ `)
    .replace(/\|([^|]*)\|\s*$/, closer
      ? `| ✅ **닫힘 — ${closer}** (${roundId} 이 이었다) |`
      : `| ✅ **닫힘 — ${roundId}** |`);
  return { body: body.replace(line, struck), found: true };
};

/**
 * 성운의 **열린 줄**을 내놓는다 — 세는 곳과 보는 곳이 같아야 한다.
 *
 * ⛔ 실측(R97): 나는 성운을 `grep` 으로 훑어 「열린 13줄」이라 적었다. **틀렸다 — 18줄이다.**
 * 내 정규식이 `**B**` 같은 **판정 표기가 있는 줄만** 골랐고, 표기 없는 줄을 빠뜨렸다.
 * 도구는 처음부터 18을 찍고 있었는데 내가 손으로 다시 셌다.
 * ⛔ **이 세션에서 세 번째 §9다**(R91 진입점 목록 · R92 도구 훑개 · R97 성운 훑개) —
 * 내가 훑개를 손으로 만들 때마다 열거가 된다. R88 이 `round which` 로 그랬듯, 손으로 세지
 * 않게 **도구가 내놓는다.**
 */
export const openNebulaRows = (body) => body.split('\n').filter((line) => /^\|/.test(line)
  && !/^\|\s*-+/.test(line)
  && !/관측\s*\|/.test(line)
  && !/무엇을 봤나/.test(line)
  /* ⛔ **취소선도 닫힘이다(R108).** 관측은 `~~` 로, 여기는 「닫힘」으로 각각 걸렀다 —
     같은 지식이 두 자리에 있으면 한 자리만 고쳐진 채 갈린다. 한 자리로 모았다. */
  && !line.includes('~~')
  && !line.includes('닫힘'));

/** 열린 줄에서 출처(`R89 변경 정직성`)를 뽑는다. 없으면 `null` — **없는 것도 말한다.** */
export const sourceOf = (line) => /\|\s*(R\d+\s+[^|*]+?)\s*(?:\*\*[^*]+\*\*)?\s*\|/.exec(line)?.[1]?.trim() ?? null;
