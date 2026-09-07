/**
 * **엔진의 내부 배치를 아는 유일한 자리.**
 *
 * ⚠️⚠️ 실측(R47): 「`packages/@core/…/dist`」라는 같은 지식이 **세 자리에 복사**돼 있었다
 * (`bigbang/engine.mjs` · `observatory/observe.mjs` · `observatory/verify.mjs`).
 * `bigbang/engine.mjs` 는 자기가 **「유일한 경로」**라고 적어 뒀지만 쓰는 곳이 하나뿐이었다 —
 * 주석이 사실이 아니었다.
 *
 * ⛔ 같은 지식이 여러 자리에 있으면 **한 자리만 고쳐진 채로 갈린다.** R46 이 정확히 그 모양이었다:
 * `verify.mjs` 만 `resolveEngine` 을 안 써서 소비 저장소에서 날 스택으로 죽었다.
 *
 * 엔진의 배치가 바뀌면 **여기만** 고친다.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveEngine } from './home.mjs';

/** 엔진 안의 자리. ⛔ 이 표 밖에서 `packages/…` 를 손으로 잇지 마라. */
const DIST = {
  contracts: 'packages/@core/fe-agent-contracts/dist/index.js',
  harness: 'packages/@core/fe-agent-harness/dist/index.js',
  scan: 'packages/@plugins/harness-react-vite/dist/scan.js',
  reactVite: 'packages/@plugins/harness-react-vite/dist/ReactViteHarness.js',
  verifyTree: 'packages/@plugins/harness-react-vite/dist/verify.js',
};

/**
 * 엔진을 연다. 무엇을 열지는 이름으로 고른다 — 부르는 쪽이 경로를 알 필요가 없다.
 * @param {string[]} want `DIST` 의 키들. 주지 않으면 계약·하네스 둘을 연다.
 */
export const openEngine = async (root, config, want = ['contracts', 'harness']) => {
  const enginePath = await resolveEngine(root, config?.observatory?.path);
  const opened = { enginePath };
  for (const key of want) {
    if (!DIST[key]) {
      throw new Error(`엔진에 그런 자리가 없다: ${key} (아는 것: ${Object.keys(DIST).join(' · ')})`);
    }
    /* eslint-disable-next-line no-await-in-loop */
    opened[key] = await import(pathToFileURL(path.join(enginePath, DIST[key])).href);
  }
  return opened;
};

export const ENGINE_DIST = DIST;
