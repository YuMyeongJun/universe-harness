/**
 * 자동 수집 — 브라우저를 **사람 눈앞에 띄워** 놓고, 화면 구조만 기계로 걷는다.
 *
 * ⚠️ **로그인을 대신하려 들지 않는다.** 콜브릿지처럼 로그인 방식이 아직 안 적힌 도메인은
 *    SSO·OTP 일 수 있고, 그걸 코드로 맞히려다 실패하면 **왜 실패했는지도 안 남는다.**
 *    그래서 브라우저를 headed 로 띄우고 **사람이 직접 로그인**한 뒤 「지금 화면부터 수집」을
 *    누르게 한다. 자격증명이 있으면 채워만 주고, 제출과 판단은 사람이 한다.
 *
 * ⚠️ 수집 결과는 **초안일 뿐 지식이 아니다.** 전부 `status: 'unmeasured'` 로 나가고,
 *    사람이 화면에서 확인해야 지식이 된다.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';

import { dataDir } from './paths.js';
import type { ISurveyItem } from './survey.js';

interface ISession {
  domain: string;
  browser: Browser;
  page: Page;
  /** 언제 열었나 — 세션 나이를 사람에게 보여주기 위한 것이다. ⛔ 시계로 살았는지 죽었는지 **판정하지 않는다.** */
  openedAt: string;
}

/** 한 번에 한 세션만 둔다 — 두 도메인을 섞으면 수집이 오염된다. */
let session: ISession | null = null;

export const sessionState = (): {
  open: boolean;
  domain: string | null;
  url: string | null;
  openedAt: string | null;
} => {
  if (!session) return { open: false, domain: null, url: null, openedAt: null };
  let url: string | null = null;
  try {
    url = session.page.url();
  } catch {
    url = null;
  }
  /**
   * ⚠️⚠️ 여기 URL 은 **새로고침하지 않은 화면**이다. SPA 는 세션이 갈려도 새로고침 전까지
   *    옛 계정이 그대로 남아 있어서, 이 값으로 「로그인돼 있다」를 판정하면 **거짓 초록**이 난다.
   *    살았는지를 재려면 `reloadSession` 을 써라 — 그건 반드시 새로고침한 뒤에 답한다.
   */
  return { open: true, domain: session.domain, url, openedAt: session.openedAt };
};

export const closeBrowser = async (): Promise<void> => {
  if (!session) return;
  const s = session;
  session = null;
  try {
    await s.browser.close();
  } catch {
    /* 이미 사람이 창을 닫았을 수 있다 */
  }
};

/**
 * 지금 열린 세션을 **새로고침한 뒤** 어디에 있는지 답한다.
 *
 * ⚠️⚠️ **새로고침이 이 함수의 존재 이유다.** SPA 는 세션이 갈려도 새로고침 전까지 옛 계정이
 *      화면에 남는다 — 새로고침 없이 재면 **죽은 세션이 초록으로 나온다.**
 * ⛔ 살았는지 죽었는지의 **판정은 여기서 하지 않는다.** 여기는 사실(URL·나이)만 주고,
 *    판정은 좌표(로그인 URL)를 아는 `preconditions.ts` 가 한다.
 */
export const reloadSession = async (
  domain: string,
): Promise<
  | { kind: 'none' }
  | { kind: 'other'; domain: string }
  | { kind: 'reloaded'; url: string; openedAt: string; ageMs: number }
  | { kind: 'error'; message: string }
> => {
  if (!session) return { kind: 'none' };
  if (session.domain !== domain) return { kind: 'other', domain: session.domain };
  const s = session;
  try {
    await s.page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    return {
      kind: 'reloaded',
      url: s.page.url(),
      openedAt: s.openedAt,
      ageMs: Date.now() - Date.parse(s.openedAt),
    };
  } catch (e) {
    /* 사람이 창을 닫았거나 네트워크가 끊겼다. **둘을 구별 못 하므로 단정하지 않는다.** */
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
};

/** 브라우저를 띄우고 로그인 화면까지 데려다 준다. 로그인은 사람이 한다. */
export const openBrowser = async (
  domain: string,
  opts: { loginUrl: string; accountId: string; accountPw: string; allowInsecureTls: boolean },
): Promise<{ url: string }> => {
  await closeBrowser();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // 사람이 ①에서 명시적으로 켰을 때만 무시한다.
    ignoreHTTPSErrors: opts.allowInsecureTls,
  });
  const page = await context.newPage();
  session = { domain, browser, page, openedAt: new Date().toISOString() };

  await page.goto(opts.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // 자격증명이 있으면 **채워만** 준다. 제출은 안 한다 — OTP·약관 등 다음 단계를 모른다.
  if (opts.accountId) {
    const id = page
      .locator('input[type="email"], input[name*="id" i], input[name*="user" i], input[type="text"]')
      .first();
    await id.fill(opts.accountId, { timeout: 5_000 }).catch(() => undefined);
  }
  if (opts.accountPw) {
    await page
      .locator('input[type="password"]')
      .first()
      .fill(opts.accountPw, { timeout: 5_000 })
      .catch(() => undefined);
  }
  return { url: page.url() };
};

/** 브라우저 안에서 도는 수집기. 앱을 모르므로 **후보를 넓게 걷고** 판단은 사람에게 넘긴다. */
const SCRAPE = `() => {
  const seen = new Set();
  const out = [];
  const push = (label, url, where) => {
    const l = (label || '').replace(/\\s+/g, ' ').trim();
    if (!l || l.length > 40) return;
    const key = l + '|' + url;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: l, url, where });
  };
  // 내비게이션으로 볼 만한 자리를 넓게 잡는다 — 앱마다 마크업이 다르다.
  const zones = document.querySelectorAll(
    'nav, aside, [class*="lnb" i], [class*="gnb" i], [class*="sidebar" i], [class*="menu" i], [role="navigation"]'
  );
  for (const zone of zones) {
    const where = zone.tagName.toLowerCase() + (zone.className ? '.' + String(zone.className).split(/\\s+/)[0] : '');
    for (const a of zone.querySelectorAll('a[href]')) {
      const r = a.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;   // 안 보이는 것은 화면이 아니다
      push(a.textContent, a.getAttribute('href') || '', where);
    }
    // 링크가 아닌 메뉴(버튼·li)도 흔하다. URL 은 비워 두고 사람이 채우게 한다.
    for (const b of zone.querySelectorAll('button, [role="menuitem"], li > span')) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      push(b.textContent, '', where);
    }
  }
  // ⚠️ 메뉴만 세지 않는다. **이 화면에 정말 도착했는지**도 같이 잰다.
  //    404 페이지는 본문이 짧고 입력·버튼이 거의 없어서, 메뉴를 못 찾은 것을
  //    "메뉴가 없는 화면"으로 착각하게 만든다.
  return {
    url: location.href,
    title: document.title,
    items: out,
    textLength: (document.body && document.body.innerText ? document.body.innerText : '').trim().length,
    inputs: document.querySelectorAll('input, textarea, select').length,
    buttons: document.querySelectorAll('button, [role="button"]').length,
  };
}`;

export interface IScan {
  url: string;
  title: string;
  shot: string | null;
  items: ISurveyItem[];
  /** 도달 신호 — 이게 없으면 "0건"이 무슨 뜻인지 알 수 없다 */
  reach: { textLength: number; inputs: number; buttons: number; thin: boolean };
  /**
   * **못 쟀다고 볼 이유.** 비어 있으면 잰 것이다.
   * ⭐ 0건을 "메뉴 없는 화면"으로 세지 않기 위한 축이다 — 훨씬 흔한 원인은 미도달·셀렉터 오류다.
   */
  unmeasured: string | null;
}

/** 지금 열려 있는 화면을 걷는다. 로그인 여부는 **사람이 판단**하고 이걸 누른다. */
export const scan = async (domain: string): Promise<IScan> => {
  if (!session || session.domain !== domain) {
    throw new Error('브라우저가 열려 있지 않습니다. 「브라우저 열기」를 먼저 누르세요.');
  }
  const page = session.page;
  // ⚠️ 문자열을 주면 Playwright 는 **식으로 평가**한다. 화살표 함수 문자열을 그대로 주면
  //    함수 자체가 값이 되어 결과가 비어 돌아온다. 반드시 즉시 호출해서 넘긴다.
  const raw = (await page.evaluate(`(${SCRAPE})()`)) as {
    url: string;
    title: string;
    items: { label: string; url: string; where: string }[];
    textLength: number;
    inputs: number;
    buttons: number;
  };

  const shotDir = join(dataDir(), 'shots', domain);
  mkdirSync(shotDir, { recursive: true });
  const name = `scan-${Date.now()}.png`;
  let shot: string | null = null;
  try {
    await page.screenshot({ path: join(shotDir, name), fullPage: false });
    shot = name;
  } catch {
    // 스크린샷 실패가 수집 실패는 아니다. 다만 **없다고 표시**하고 넘어간다.
    shot = null;
  }

  const items: ISurveyItem[] = raw.items.map((it, i) => ({
    id: `auto-${Date.now()}-${i}`,
    kind: 'lnb',
    label: it.label,
    url: it.url,
    detail: `수집 위치: ${it.where}`,
    origin: 'auto',
    // ⭐ 수집됐다는 것과 맞다는 것은 다르다. 전부 미확인으로 나간다.
    status: 'unmeasured',
  }));

  // `src/guards/reach.ts` 와 같은 하한을 쓴다 — 404·에러 페이지의 특징이다.
  const MIN_BODY = 200;
  const thin = raw.textLength < MIN_BODY;

  /**
   * ⭐ 여기가 이 도구에서 가장 중요한 판정이다.
   *
   * 「메뉴 0건」을 **성공으로 세지 않는다.** 실제로 메뉴가 없는 화면일 수도 있지만,
   * 훨씬 흔한 원인은 **미도달(404·로그인 튕김)** 이나 **셀렉터 오류**다.
   * 이 저장소가 데인 사고가 정확히 그것이다 — 404 페이지는 요소가 없어서
   * "수집 성공, 항목 없음"처럼 보인다.
   */
  const unmeasured =
    thin && items.length === 0
      ? `본문이 ${raw.textLength}자로 짧고 메뉴 후보도 0건이다. 404·로그인 튕김일 가능성이 높다 (입력 ${raw.inputs}개 · 버튼 ${raw.buttons}개).`
      : items.length === 0
        ? `메뉴 후보가 0건이다. 이 화면에 정말 메뉴가 없는지, 아니면 못 찾은 것인지 사람이 확인해야 한다 (본문 ${raw.textLength}자 · 입력 ${raw.inputs}개).`
        : thin
          ? `메뉴 후보는 ${items.length}건 찾았지만 본문이 ${raw.textLength}자로 짧다. 도착한 화면이 맞는지 확인하라.`
          : null;

  return {
    url: raw.url,
    title: raw.title,
    shot,
    items,
    reach: { textLength: raw.textLength, inputs: raw.inputs, buttons: raw.buttons, thin },
    unmeasured,
  };
};
