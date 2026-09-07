/**
 * 진짜 브라우저를 한 번 돌리는 자리. **제품을 재지 않는다 — 배선을 잰다.**
 *
 * ⛔ 이 저장소는 Playwright 를 한 번도 안 돌려 봤다. 계약(`src/run/`)도 픽스처도 판정
 *    화면도 다 섰지만 **진짜 브라우저가 낸 리포트를 넣어 본 적이 없다.** 그래서 「돈다」가
 *    짐작이었다. 이 파일이 그 짐작을 실측으로 바꾼다.
 *
 * ⚠️ **통과만 두면 「fail 이 계약으로 어떻게 오는가」를 못 잰다.** 그래서 TC-902 는
 *    **일부러 실패한다.** 표적 HTML 에 `#burn-badge` 를 안 넣었다 — 단언을 무르게 해서
 *    초록으로 만들면 이 파일이 재려던 것이 통째로 사라진다. ⛔ 고치지 마라.
 *
 * ⛔ 파일명이 `*.e2e.ts` 인 이유: vitest 의 기본 include 가 `**\/*.{test,spec}.ts` 라
 *    `*.spec.ts` 로 두면 **vitest 가 이 파일을 집어 들고 239건이 깨진다.** 두 주자가
 *    같은 이름을 노린다 — 이름으로 갈랐다.
 */
import { expect, test } from '@playwright/test';

/** file:// — 서버도 네트워크도 없다. 깨질 이유가 우리 배선밖에 없어야 잰 것이 된다. */
const TARGET = new URL('./fixtures/limit.html', import.meta.url).href;

test('TC-901 한도가 소진되면 발송 버튼이 잠긴다', async ({ page }) => {
  await page.goto(TARGET);
  await expect(page.locator('#send')).toBeDisabled();
});

test('TC-902 소진 배지가 보인다', async ({ page }) => {
  await page.goto(TARGET);
  // ⛔ 일부러 실패한다. 표적에 `#burn-badge` 가 없다.
  //    ⚠️ 이 단언을 무르게 하면 「fail 이 계약으로 어떻게 오는가」를 다시 못 잰다.
  await expect(page.locator('#burn-badge')).toBeVisible({ timeout: 1500 });
});

test('TC-903 건너뛴 케이스는 ⚪ 로 온다', async () => {
  // ⚪ 는 별도 상태다 — 2상태면 **못 잰 것이 통과로 세어진다**(`src/run/contract.ts`).
  test.skip(true, '이번 주행에서는 재지 않는다 — ⚪ 가 계약에 어떻게 오는지 보려고 남겼다');
});
