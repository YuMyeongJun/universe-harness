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
import { readFile } from 'node:fs/promises';
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
    if (typeof galaxy.path === 'string' && !path.isAbsolute(galaxy.path)) {
      galaxy.path = path.resolve(root, galaxy.path);
    }
    return { galaxy };
  } catch (error) {
    /* ⚠️ **여기서 「없다」고 말하면 안 된다.** 파일은 있다 — 읽을 수 없을 뿐이다. */
    return {
      problem: `⛔ 좌표를 못 읽었다 (없는 은하가 아니다): ${path.relative(root, file)}\n   ${error.message}`,
    };
  }
};
