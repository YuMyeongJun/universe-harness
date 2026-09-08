/**
 * **backoffice — 로그인 뒤 화면.**
 *
 * ## ⛔ 이 파일은 두 종류의 시험을 **갈라서** 담는다
 *
 * 이 저장소의 계약은 **TC 가 어디서 나왔는가**를 묻는다(`qa/src/run/contract.ts`):
 * 구현을 읽고 쓴 TC 는 구현이 하는 일을 그대로 적은 것이라 **아무리 돌려도 통과만 한다** —
 * 자기 채점이다. 그래서 검증 분모에서 빠진다.
 *
 *  · **연기 시험**(아래 첫 번째) — 화면을 보고 쓴 것이다. 솔직히 `derived-from-code` 다.
 *    ⛔ 그래도 지운다면 손해다: 「흰 화면」·「던져진 예외」는 이것만 잡는다.
 *  · **`TC-BO-…`** — 그 저장소의 **글**에서 나온 것이다(`docs/ui/shell-chrome.md`).
 *    출처를 `qa/e2e/origins.json` 에 **줄로 적어** 두었다. 이쪽이 **검증 분모**가 된다.
 *
 * ## ⚠️ 세션이 있어야 도는 시험이 있다
 *
 * `universe session backoffice` 가 만든 `.harness/session.json` 을 설정이 물려준다.
 * ⛔ 세션이 없으면 **⚪ 로 물러난다**(`test.skip`) — 로그인 안 된 화면을 재고 「통과」라고
 * 말하면 그게 거짓 초록이다. ⚠️ Playwright 의 `skipped` 는 통과가 **아니고**, 이 저장소의
 * 계약이 그것을 **⚪ 못 쟀다**로 나른다.
 */
import { expect, test } from '@playwright/test';

/** 로그인이 풀렸을 때 그 앱이 띄우는 말 — 실측으로 확인한 문장이다. */
const LOGGED_OUT = /장시간 사용 이력이 없어 자동 로그아웃|다시 로그인/;

/**
 * ⛔ **세션이 물렸는가**를 시험이 스스로 안다. 설정이 `storageState` 를 넣었으면
 * 브라우저에 쿠키가 있다 — 없으면 이 주행은 **로그인 뒤 화면을 못 잰다.**
 */
const loggedIn = async (page: import('@playwright/test').Page): Promise<boolean> => {
  const text = await page.locator('body').innerText().catch(() => '');
  return !LOGGED_OUT.test(text);
};

test('화면이 뜬다 — 마운트 · 제목 · 던져진 예외 0건', async ({ page }) => {
  /* ⛔ 예외는 **가기 전에** 걸어야 한다 — 붙이기 전에 던져진 것은 영영 못 본다. */
  const thrown: string[] = [];
  page.on('pageerror', (e) => thrown.push(String(e)));

  const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(res?.status(), '개발 서버가 200 으로 답해야 한다').toBe(200);

  /**
   * ① 마운트 — 흰 화면을 잡는 칸.
   * ⚠️⚠️ **「보이는가」로 재면 안 된다 — 실측으로 틀렸다.** 이 앱의 `#root` 첫 자식이
   * `<div class="Toastify">`(크기 0)라 언제나 `hidden` 이다. 자식 **수**로 잰다.
   */
  await expect
    .poll(async () => page.locator('#root > *').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  await expect(page).toHaveTitle('BIZ MSG CENTER');
  await expect(page.getByText('BIZ MSG', { exact: false }).first()).toBeVisible();

  /* ⛔ **콘솔 오류가 아니라 던져진 예외만** 본다 — 남의 API 가 죽은 날 우리 시험이 빨개지면
     사람이 화면을 고치러 간다. 그 둘은 다른 사실이다. */
  expect(thrown, `화면이 예외를 던졌다:\n${thrown.join('\n')}`).toHaveLength(0);
});

/**
 * **TC-BO-001** — 로그인한 사람에게 **좌측 메뉴(LNB)가 보인다.**
 *
 * ⭐ 출처: `docs/ui/shell-chrome.md` — 그 문서 전체가 **LNB·footer 를 앱 크롬의 표준**으로
 * 규정하고, 「접힌 LNB 메뉴」·「Footer triggers」처럼 **LNB 가 있다는 전제** 위에 쓰여 있다.
 * ⛔ 화면을 보고 고른 문장이 아니다 — 문서가 먼저 있었고 그것을 시험으로 옮겼다.
 */
test('TC-BO-001 로그인하면 좌측 메뉴가 보인다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);

  /* ⛔ 세션이 없으면 **재지 않는다.** 「메뉴가 없다」로 실패시키면 그건 제품 결함이 아니다. */
  test.skip(!(await loggedIn(page)), '세션이 없다 — `universe session backoffice` 를 먼저 돌려라. ⚪ 못 쟀다이지 실패가 아니다.');

  /* 문서가 앱 크롬의 표준으로 규정한 그 LNB. 하나라도 서 있어야 한다. */
  const menu = page.getByText(/서비스운영관리|모니터링|콘텐츠 관리/).first();
  await expect(menu, 'shell-chrome.md 가 표준으로 규정한 LNB 가 안 보인다').toBeVisible({ timeout: 15_000 });
});

/**
 * **TC-BO-002** — **production 이 아닐 때만** DEV 전용 footer(「템플릿 상태관리」)가 보인다.
 *
 * ⭐ 출처: `docs/ui/shell-chrome.md:41` —
 *   「Don't: production에서 DEV-only footer(템플릿 상태관리) 노출 (`VITE_PROCESS_ENV !== 'production'`)」
 * ⛔ 이건 **글로 적힌 금지**다. 구현을 읽고 쓴 것이 아니라 **문서를 읽고 쓴 것**이고,
 *   그래서 이 TC 는 검증으로 세어진다.
 * ⚠️ 이 주행은 `staging` 모드로 돈다(`VITE_PROCESS_ENV=staging`) — 즉 **보여야** 맞다.
 *   ⛔ production 에서 이 시험을 돌리면 **반대를 물어야** 한다. 그건 이 주행이 못 재는 칸이다.
 */
test('TC-BO-002 production 이 아니면 DEV footer 가 보인다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3_000);

  test.skip(!(await loggedIn(page)), '세션이 없다 — `universe session backoffice` 를 먼저 돌려라. ⚪ 못 쟀다이지 실패가 아니다.');

  await expect(
    page.getByText('템플릿 상태관리').first(),
    'staging 인데 DEV footer 가 안 보인다 — shell-chrome.md:41 의 금지는 production 에만 걸린다',
  ).toBeVisible({ timeout: 15_000 });
});
