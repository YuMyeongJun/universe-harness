/**
 * ⛔ **CI 에 넣지 않았다.** 관문 등재는 부모가 판단한다 — 느린 관문은 아무도 안 본다.
 *
 * ⚠️ `testDir: './e2e'` 는 두 주자를 가르는 벽이다. 이게 없으면 Playwright 가
 *    `tests/*.test.ts`(vitest 239건)까지 집어 든다.
 * ⚠️ `retries: 0` — 재시도를 켜면 `flaky` 가 생기고, 이 주행이 재려는 것은
 *    **통과·실패·건너뜀이 계약으로 어떻게 오는가**다. `flaky` 축은 이번에 못 쟀다.
 */
import { defineConfig } from '@playwright/test';

/**
 * **사람이 보면서 돌릴 때만** 느리게 한다 — `UNIVERSE_WATCH_SLOWMO=<밀리초>`.
 *
 * ⛔⛔ **기본 주행을 건드리지 않는다.** 안 주면 `0` 이고, 그때 `launchOptions` 는
 *    아예 안 붙는다 — 관문이 재는 것과 **똑같은 주행**이어야 「보면서 잰 것」이
 *    「관문이 잰 것」과 같은 사실이 된다. 둘이 갈리면 화면에서 본 초록불이
 *    관문의 초록불을 보증하지 못한다.
 * ⛔ 이 값을 **화면이 정하지 않는다** — 은하가 선언한 축(`commands.e2eWatch`)이 정한다.
 */
const watchSlowMo = Number(process.env['UNIVERSE_WATCH_SLOWMO'] ?? '0');

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
    /* ⛔ 0 이면 **아무것도 안 붙인다** — 기본 주행은 예전과 한 글자도 다르지 않다. */
    ...(Number.isFinite(watchSlowMo) && watchSlowMo > 0
      ? { launchOptions: { slowMo: watchSlowMo } }
      : {}),
  },
});
