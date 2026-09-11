/**
 * 도달 가드 — **캡처·측정 전에** 부른다.
 *
 * 반환값을 버리지 마라. 도달을 확인하지 않은 검사는 **통과처럼 보인다** —
 * 404 페이지엔 찾는 셀렉터가 아예 없어서 "위반 0건"이 되기 때문이다.
 *
 * 이 모듈은 특정 서비스를 알지 않는다. 404 판정 문구와 라우트 목록은 config 에서 온다.
 */
import type { IQaHarnessConfig, IRoute } from '../config/types.js';

/** Playwright Page 중 이 가드가 쓰는 부분만. @playwright/test 를 강제 의존하지 않기 위한 최소 계약. */
export interface IPageLike {
  url: () => string;
  goto: (url: string, options?: { waitUntil?: 'networkidle' | 'load' | 'domcontentloaded' }) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
}

export interface ITestInfoLike {
  annotations: Array<{ type: string; description?: string }>;
}

export interface IReachResult {
  landed: string;
  isNotFound: boolean;
  /** 본문이 하한보다 짧다 — 404·에러 페이지의 특징 */
  isThin: boolean;
  textLength: number;
  redirected: boolean;
}

const DEFAULT_MIN_BODY = 200;

export interface IReachApi {
  /** 이름 → 경로. **경로 문자열을 spec 에 손으로 적지 마라.** 오타는 여기서 즉시 죽는다. */
  routePath: (name: string) => string;
  route: (name: string) => IRoute;
  reportReach: (page: IPageLike, expectedPath: string, testInfo?: ITestInfoLike) => Promise<IReachResult>;
  /** goto + 도달 단언. 새 spec 은 `page.goto` 를 직접 부르지 말고 이것을 쓴다. */
  gotoReached: (
    page: IPageLike,
    routeName: string,
    testInfo?: ITestInfoLike,
    opts?: { expectRedirectTo?: string },
  ) => Promise<IReachResult>;
}

export const createReach = (config: IQaHarnessConfig): IReachApi => {
  const minBody = config.minBodyTextLength ?? DEFAULT_MIN_BODY;

  const route = (name: string): IRoute => {
    const hit = config.routes.find((r) => r.name === name);
    if (!hit) {
      throw new Error(
        `[reach] 레지스트리에 '${name}' 라우트가 없다. 있는 이름: ` +
          config.routes.map((r) => r.name).join(', '),
      );
    }
    return hit;
  };

  const routePath = (name: string): string => route(name).path;

  const reportReach = async (
    page: IPageLike,
    expectedPath: string,
    testInfo?: ITestInfoLike,
  ): Promise<IReachResult> => {
    const landed = new URL(page.url()).pathname;
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    const result: IReachResult = {
      landed,
      isNotFound: config.notFoundPatterns.some((re) => re.test(text)),
      isThin: text.length < minBody,
      textLength: text.length,
      redirected: landed !== expectedPath,
    };
    if (testInfo && (result.redirected || result.isNotFound || result.isThin)) {
      // 리포트에 남긴다 — 조용히 지나가지 못하게.
      testInfo.annotations.push({
        type: result.isNotFound ? '404' : result.isThin ? 'thin-body' : 'redirect',
        description: `${expectedPath} → ${result.landed} (본문 ${result.textLength}자)`,
      });
    }
    return result;
  };

  const gotoReached = async (
    page: IPageLike,
    routeName: string,
    testInfo?: ITestInfoLike,
    opts: { expectRedirectTo?: string } = {},
  ): Promise<IReachResult> => {
    const target = route(routeName);
    await page.goto(target.path, { waitUntil: 'networkidle' });
    const expectedPath = opts.expectRedirectTo ? routePath(opts.expectRedirectTo) : target.path;
    const reach = await reportReach(page, expectedPath, testInfo);

    if (target.expect404) {
      if (!reach.isNotFound) {
        throw new Error(`[reach] ${routeName}: 404 여야 하는데 아니다 (착지 ${reach.landed}).`);
      }
      return reach;
    }
    if (reach.isNotFound) {
      throw new Error(
        `[reach] ${routeName} (${target.path}) 가 404 페이지다 — 여기서 잰 값은 전부 무효다.`,
      );
    }
    if (reach.isThin) {
      throw new Error(
        `[reach] ${routeName}: 본문이 ${reach.textLength}자로 하한(${minBody})보다 짧다. ` +
          '에러 화면일 수 있다 — 여기서 "위반 0건"은 미도달과 구별되지 않는다.',
      );
    }
    if (reach.redirected) {
      throw new Error(
        `[reach] ${routeName}: ${target.path} 로 갔는데 ${reach.landed} 에 착지했다. ` +
          '의도한 리다이렉트라면 expectRedirectTo 로 명시하라.',
      );
    }
    return reach;
  };

  return { routePath, route, reportReach, gotoReached };
};
