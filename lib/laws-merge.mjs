/**
 * 판올림이 **새 법칙을 목록에 잇는다** — 팀의 선택은 안 건드리고.
 *
 * ⛔ 실측(R119): `init --update` 가 `laws/derivation.md` 를 배달했는데 팀의
 * `universe.config.json` 은 안 고쳐서, 소비 저장소가 **설명할 수 없는 빨간불 둘**을 받았다 —
 * 「파일은 있는데 config 에 없다」·「아무 은하도 켤 수 없다」.
 *
 * ⚠️ **목록은 「있다」지 「켰다」가 아니다.** 어느 은하가 켜는가는 `galaxies/*.json` 이 정한다 —
 * 거기는 안 건드리므로 **팀의 수는 안 움직인다**(R108 에서 확인한 성질).
 * ⚠️ 팀이 **일부러 뺀 법칙**을 되살릴 수 있다. 그래서 무엇을 이었는지 돌려주고, 부르는 쪽이 말한다.
 *
 * 재는 법: `node lib/selftest.mjs`
 */

/**
 * @param {string[]} theirs   팀의 목록
 * @param {string[]} packaged 패키지가 아는 목록
 * @returns {{laws: string[], added: string[]}} 이은 결과와 **새로 이은 것**
 */
export const mergeLaws = (theirs = [], packaged = []) => {
  const added = packaged.filter((name) => !theirs.includes(name));
  return { laws: [...theirs, ...added], added };
};

/**
 * 목록이 있는 칸 **전부** — 법칙만이 아니다.
 *
 * ⛔ 실측(R120): 우주 형식 관문은 `laws` 뿐 아니라 **`forces`·`orbits` 도 똑같이** 본다
 * (「파일은 있는데 config 에 없다」). R119 는 법칙만 이었으므로 궤도나 힘이 늘면 **같은
 * 빨간불이 같은 자리에서** 난다 — 추측이 아니라 관문 코드를 읽어 확인했다.
 * ⚠️ **`galaxies` 는 잇지 않는다.** 그것은 팀이 등록하는 것이지 패키지가 주는 것이 아니다.
 */
export const CATALOGUE_FIELDS = ['laws', 'forces', 'orbits'];

/**
 * @param {object} theirs   팀의 config
 * @param {object} packaged 패키지의 config
 * @returns {{config: object, added: Record<string, string[]>}} 칸별로 **새로 이은 것**
 */
export const mergeCatalogues = (theirs, packaged) => {
  const config = { ...theirs };
  const added = {};
  for (const field of CATALOGUE_FIELDS) {
    const merged = mergeLaws(theirs?.[field] ?? [], packaged?.[field] ?? []);
    if (merged.added.length > 0) {
      config[field] = merged.laws;
      added[field] = merged.added;
    }
  }
  return { config, added };
};
