/**
 * **backoffice — 실제로 이동하고 · 조회하고 · 클릭한다.**
 *
 * ## ⛔⛔ 왜 이 파일이 생겼는가 — 사람이 보다가 잡았다
 *
 * 먼저 쓴 `shell.e2e.ts` 는 셋 다 **`/` 를 열고 쳐다보는 것**뿐이었다. 라우터 이동도,
 * 조회도, 클릭도, 기능 검사도 없었다. 그런데 화면에는 **「✅ 끝났다 — 판단하지 않은 fail 0」**
 * 이 떴다. ⛔ 그건 **거짓 초록**이다 — 아무것도 안 하고 통과하는 시험은 통과가 아니다.
 * ⇒ 이 파일은 **손을 쓴다.** 링크를 누르고 · 폼을 채우고 · 조회를 누르고 · 결과를 센다.
 *
 * ## 출처 — 구현이 아니라 **글**에서 나왔다
 *
 * · `docs/ui/search-form-standard.md:82-83` — 조회 버튼은 `isSearchButton`(폼 하단 오른쪽),
 *   초기화는 `isSearchResetButton` + `onReset`(조회 왼쪽). **둘 다 있어야 한다는 계약**이다.
 * · `docs/ui/list-page-standard.md` — 리스트 골격은 **필터 + 총건수 + 표**이고,
 *   총건수는 `SearchTableTotalCaption` 이 낸다. **표시된 건수와 실제 표가 맞아야** 뜻이 있다.
 *
 * ⚠️ 그래서 이 파일의 TC 는 `policy` 다(`qa/e2e/origins.json`). 화면을 보고 지은 것이 아니다.
 *
 * ## ⚠️ 이 시험이 **못 재는 것**
 *
 * · **데이터가 옳은가** — 서버가 준 2건이 맞는 2건인지는 여기서 못 잰다. 재는 것은
 *   「화면이 말한 수」와 「화면이 그린 줄 수」가 **서로 맞는가**다. 그 둘이 어긋나는 것은
 *   ⛔ 사람이 목록을 잘못 읽게 만드는 결함이고, 그건 여기서 잡힌다.
 * · **빈 결과** — 지금 이 환경에 2건이 있어서 「0건일 때의 화면」은 안 밟는다. 적어 둔다.
 */
import { expect, test } from '@playwright/test';

const LOGGED_OUT = /장시간 사용 이력이 없어 자동 로그아웃|다시 로그인/;

const requireSession = async (page: import('@playwright/test').Page): Promise<void> => {
  const text = await page.locator('body').innerText().catch(() => '');
  /* ⛔ 세션이 없으면 **재지 않는다** — 로그인 안 된 화면을 재고 「통과」라고 하면 거짓 초록이다. */
  test.skip(LOGGED_OUT.test(text), '세션이 없다 — `universe session backoffice` 를 먼저 돌려라. ⚪ 못 쟀다이지 실패가 아니다.');
};

/** 「검색결과 N건」에서 N 을 뽑는다. ⛔ 못 뽑으면 `null` — 0 으로 때우지 않는다(§8). */
const countOnScreen = async (page: import('@playwright/test').Page): Promise<number | null> => {
  const text = await page.locator('body').innerText().catch(() => '');
  const hit = /검색결과\s*([\d,]+)\s*건/.exec(text);
  return hit ? Number(hit[1].replace(/,/g, '')) : null;
};

/**
 * **TC-BO-010** — 대시보드에서 **눌러서** 리스트 화면으로 간다.
 * ⭐ 라우터 이동을 **주소를 쳐서가 아니라 클릭으로** 밟는다 — 사람이 하는 것이 그것이다.
 */
test('TC-BO-010 대시보드에서 눌러서 리스트로 이동한다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4_000);
  await requireSession(page);

  const before = page.url();
  await page.getByText('사업자등록증 검증', { exact: false }).first().click();
  await page.waitForURL(/\/service\/business-license/, { timeout: 15_000 });

  expect(page.url(), '눌렀는데 주소가 안 바뀌었다').not.toBe(before);
  await expect(page.getByText('사업자등록증 검증').first()).toBeVisible();
});

/**
 * **TC-BO-011** — 검색 폼에 **조회·초기화 버튼이 둘 다** 있다.
 * ⭐ 출처: `search-form-standard.md:82-83` 의 계약. ⛔ 화면을 보고 고른 문구가 아니다.
 */
test('TC-BO-011 검색 폼에 조회와 초기화가 둘 다 있다', async ({ page }) => {
  await page.goto('/service/business-license', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4_000);
  await requireSession(page);

  await expect(page.getByRole('button', { name: '조회' }).first(), '조회 버튼이 없다 — search-form-standard 계약').toBeVisible();
  await expect(page.getByRole('button', { name: '초기화' }).first(), '초기화 버튼이 없다 — search-form-standard 계약').toBeVisible();
});

/**
 * **TC-BO-012** — **조회를 눌러** 목록을 받고, **화면이 말한 건수와 실제 줄 수가 맞는다.**
 *
 * ⭐ 출처: `list-page-standard.md` — 리스트는 **필터 + 총건수 + 표**가 한 벌이다.
 * ⛔ 여기가 이 파일의 핵심이다: 「건수」와 「줄」이 어긋나면 **사람이 목록을 잘못 읽는다.**
 *   그건 열어만 보는 시험으로는 절대 안 잡힌다.
 */
test('TC-BO-012 조회를 누르면 건수와 표 줄 수가 맞는다', async ({ page }) => {
  await page.goto('/service/business-license', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4_000);
  await requireSession(page);

  /* ⭐ 실제로 **누른다.** 서버가 다시 답해야 아래 수가 뜻이 있다. */
  await page.getByRole('button', { name: '조회' }).first().click();
  await page.waitForTimeout(4_000);

  const said = await countOnScreen(page);
  expect(said, '화면이 「검색결과 N건」을 안 적는다 — list-page-standard 의 총건수 계약').not.toBeNull();

  const rows = await page.locator('table tbody tr').count();
  /* ⚠️ 한 쪽에 다 안 들어오면(페이지네이션) 줄 수가 건수보다 **적을 수 있다** — 많으면 안 된다. */
  expect(rows, `화면은 ${said}건이라는데 표에 ${rows}줄이 있다 — 줄이 건수보다 많을 수는 없다`)
    .toBeLessThanOrEqual(said ?? 0);
  expect(rows, '건수가 1 이상인데 표가 비어 있다 — 사람은 「없다」로 읽는다').toBeGreaterThan(0);
});

/**
 * **TC-BO-013** — **초기화를 누르면** 검색 조건이 비워진다.
 * ⭐ 출처: `search-form-standard.md:70` — 「초기화가 필요하면 `isSearchResetButton` + `onReset` 을 같이 켠다」.
 * ⛔ 버튼이 **있는 것**과 **도는 것**은 다른 사실이다. TC-BO-011 은 있는가를, 여기는 **도는가**를 잰다.
 */
test('TC-BO-013 초기화를 누르면 입력한 조건이 지워진다', async ({ page }) => {
  await page.goto('/service/business-license', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4_000);
  await requireSession(page);

  /**
   * ⚠️⚠️ **자리로 찾지 않는다 — 처음엔 그래서 틀렸다.**
   * 처음엔 「readonly 가 아닌 입력칸 중 마지막」으로 집었는데, 그 화면의 입력칸은
   * `메뉴 검색 · 날짜 2개 · memberId · 선택(readonly) · 30개씩 보기(readonly)` 라
   * **엉뚱한 칸**이 잡혔다. 앱이 아니라 **시험이 틀린 것**이었다.
   * ⇒ 그 앱이 준 **이름(`name="memberId"`)** 으로 짚는다. 순서가 바뀌어도 안 깨진다.
   */
  const memberId = page.locator('input[name="memberId"]');
  await expect(memberId, '회원 ID 칸을 못 찾았다 — 검색 폼의 모양이 바뀌었다').toHaveCount(1);

  await memberId.fill('테스트조건');
  await expect(memberId).toHaveValue('테스트조건');

  await page.getByRole('button', { name: '초기화' }).first().click();
  await page.waitForTimeout(2_000);

  await expect(memberId, '초기화를 눌렀는데 값이 그대로다 — onReset 이 안 걸렸다').toHaveValue('');
});

/**
 * **TC-BO-014** — 목록의 **페이지 크기를 10 으로 고정하지 않는다.**
 *
 * ⭐ 출처: `docs/ui/list-page-standard.md` 의 **Anti-patterns** —
 *   「page size 10 고정 (도메인 예외는 문서화)」. 그리고 계약표가 `pageLimitValues` 를 못 박는다.
 * ⛔ 이건 **글로 적힌 금지**다. 화면을 보고 지은 것이 아니다.
 * ⚠️ 이 시험이 재는 것은 「고정되어 있지 않은가」이지 「몇 개가 옳은가」가 아니다 —
 *    옳은 수는 도메인이 정하고, 그건 여기서 못 잰다.
 */
test('TC-BO-014 페이지 크기가 10 으로 고정돼 있지 않다', async ({ page }) => {
  await page.goto('/service/business-license', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4_000);
  await requireSession(page);

  /**
   * ⚠️⚠️ **`innerText` 로 찾으면 못 찾는다 — 실측으로 틀렸다.**
   * 「30개씩 보기」는 **입력칸의 `value`** 라서 본문 글자에 안 잡힌다. 처음엔 본문에서 찾다가
   * 「화면에 없다」로 빨개졌는데, ⛔ 그건 앱이 아니라 **시험이 엉뚱한 데를 본 것**이었다.
   * ⇒ 입력칸의 값에서 읽는다.
   */
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((i) => i.value).filter((v) => /개씩 보기/.test(v)));
  expect(sizes.length, '「N개씩 보기」 칸이 화면에 없다 — list-page-standard 의 page size 계약')
    .toBeGreaterThan(0);
  const shown = /(\d+)/.exec(sizes[0] ?? '');
  expect(Number(shown?.[1]), 'page size 가 10 으로 고정돼 있다 — 문서가 안티패턴으로 못 박은 그것')
    .not.toBe(10);
});
