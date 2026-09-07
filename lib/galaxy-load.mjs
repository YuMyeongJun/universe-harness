/**
 * 은하 좌표 읽기 — **없는 것**과 **못 읽은 것**을 가른다.
 *
 * ⛔ 실측(R90): 좌표 JSON 에 쉼표 하나가 남았을 때 `universe new` 는
 * 「없는 은하: tiny-galaxy」라 하고 **바로 다음 줄에 등록된 은하로 tiny-galaxy 를 나열**했다.
 * 사람은 등록을 뒤지러 간다 — 문제는 문법인데. `observe` 는 더 나빠서 **생 스택트레이스**로
 * 죽었다. 이유를 안 말하는 것보다 **틀린 이유를 대는 것이 더 오래 헤매게 한다.**
 *
 * ⚠️ R69 가 「명령이 실패한 것」과 「명령을 못 돌린 것」을 가른 것과 같은 종류다 —
 * 하나를 가렸다고 다 가려지는 게 아니라, 자리마다 다시 가려야 한다.
 *
 * 재는 법: `node observatory/verify-checks.mjs` (말 시험 — 깨진 좌표에 무슨 말을 하는가)
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @param {string} root        우주의 집
 * @param {string} name        은하 이름
 * @param {string[]} registered config 에 올라온 은하 이름들 (메시지에 쓴다)
 * @returns {Promise<{galaxy: object} | {problem: string}>}
 *   읽었으면 `{galaxy}`, 못 읽었으면 **사람이 읽을 사유**가 담긴 `{problem}`.
 */
export const loadGalaxy = async (root, name, registered = []) => {
  const file = path.join(root, 'galaxies', `${name}.json`);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return {
      problem: `없는 은하: ${name}\n등록된 은하: ${registered.join(', ') || '(없음)'}\n   좌표 파일이 없다: ${path.relative(root, file)}`,
    };
  }
  try {
    const galaxy = JSON.parse(text);
    /* ⚠️ **좌표가 절대 경로면 클론이 원본을 문다**(R142). 클론에서 부품 시험을 돌렸더니
     * 좌표가 가리키는 **원본 저장소의 픽스처**가 고쳐졌다 — 클론 안의 사본이 아니라.
     * 그래서 **상대 경로를 우주 뿌리 기준으로** 푼다. 저장소 안의 픽스처 은하는 상대로 적어라.
     * 절대 경로는 남의 저장소(진짜 은하)를 가리킬 때만 쓴다 — 그건 옮겨 다니지 않는다. */
    return { galaxy: resolveGalaxyPath(root, galaxy) };
  } catch (error) {
    /* ⚠️ **여기서 「없다」고 말하면 안 된다.** 파일은 있다 — 읽을 수 없을 뿐이다. */
    return {
      problem: `⛔ 좌표를 못 읽었다 (없는 은하가 아니다): ${path.relative(root, file)}\n   ${error.message}`,
    };
  }
};

/**
 * 은하 좌표의 `path` 를 **우주 뿌리 기준으로** 절대화한다.
 * ⚠️ R142 에서 「좌표를 읽는 입구는 `loadGalaxy` 하나」라고 적었는데 **틀렸다**(R143) —
 * `verify.mjs`·`observe.mjs`·`learn.mjs`·`light-speed.mjs`·`lint-drift.mjs` 는 JSON 을 직접 읽는다.
 * 그래서 상대 좌표가 그 자리들에서 **한 번 더 붙어** `fixtures/x/fixtures/x/.harness/` 가 됐고,
 * 게이트의 lint 산출이 엉뚱한 데 쌓이는 동안 귀속은 묵은 파일을 근거라 불렀다.
 * 직접 읽는 자리는 **반드시 이 함수를 거쳐라.** 부품 시험이 안 거친 자리를 문다.
 */
export const resolveGalaxyPath = (root, galaxy) => {
  if (galaxy && typeof galaxy.path === 'string' && !path.isAbsolute(galaxy.path)) {
    return { ...galaxy, path: path.resolve(root, galaxy.path) };
  }
  return galaxy;
};

/**
 * 은하 좌표를 되쓴다 — **원본 파일에 적힌 `path` 형태를 그대로 지킨다.**
 *
 * ⛔ R144 실측: `observe --update`·`lint --update`·`speed --update` 세 자리가 **읽을 때 푼
 * 절대 경로를 그대로 저장했다.** 그래서 저장소 안의 은하가 절대 경로로 되돌아갔고,
 * R142·R143 의 작업이 `--update` 한 번에 조용히 무효가 됐다. 되쓰기가 세 곳이었는데
 * **셋 다 같은 방식으로 틀렸다** — 열거로는 못 막고 짝이 되는 함수로 막는다.
 *
 * @param {string} file 좌표 파일 경로
 * @param {object} galaxy 저장할 은하 (path 가 풀려 있어도 된다)
 */
export const saveGalaxy = async (file, galaxy) => {
  const onDisk = await readFile(file, 'utf8').then((t) => JSON.parse(t)).catch(() => null);
  const kept = typeof onDisk?.path === 'string' ? { ...galaxy, path: onDisk.path } : galaxy;
  await writeFile(file, `${JSON.stringify(kept, null, 2)}\n`, 'utf8');
};
