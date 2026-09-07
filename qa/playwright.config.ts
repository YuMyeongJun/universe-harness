/**
 * ⛔ **CI 에 넣지 않았다.** 관문 등재는 부모가 판단한다 — 느린 관문은 아무도 안 본다.
 *
 * ⚠️ `testDir: './e2e'` 는 두 주자를 가르는 벽이다. 이게 없으면 Playwright 가
 *    `tests/*.test.ts`(vitest 239건)까지 집어 든다.
 * ⚠️ `retries: 0` — 재시도를 켜면 `flaky` 가 생기고, 이 주행이 재려는 것은
 *    **통과·실패·건너뜀이 계약으로 어떻게 오는가**다. `flaky` 축은 이번에 못 쟀다.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // ⛔ vitest 와 이름이 겹치지 않게 `*.e2e.ts` 만 집는다.
  testMatch: '**/*.e2e.ts',
  retries: 0,
  reporter: [
    ['list'],
    // ⛔ `test-results/` 는 이미 뿌리 .gitignore 가 막는다 — 스크린샷과 리포트가 실려 나가지 않는다.
    ['json', { outputFile: 'test-results/run.json' }],
  ],
  use: {
    // 실패한 케이스의 증거를 계약의 `evidence.screenshot` 으로 흘려보내는 배선을 같이 잰다.
    screenshot: 'only-on-failure',
  },
});
