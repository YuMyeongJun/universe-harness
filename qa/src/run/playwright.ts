/**
 * Playwright JSON 리포터 → 주행 결과 계약 어댑터. **순수 함수다.**
 *
 * ⛔ 이 파일은 Playwright 를 **돌리지 않는다.** 이미 나온 JSON 객체를 받아서 옮길 뿐이다.
 * `@playwright/test` 를 import 하지 않는 것도 같은 이유다 — 구조적 타입만 쓴다.
 *
 * ⚠️ 옮기면서 뜻이 바뀌기 쉬운 자리 둘:
 *  · `flaky` 를 **통과로 접지 않는다.** 조건이 같은데 결과가 갈렸으면 그 관측은
 *    아무것도 재지 못한 것이다 → ⚪.
 *  · **테스트 0개는 「위반 없음」이 아니다.** 그래서 `tests-discovered` 를 전제로 세운다.
 */
import type { Attribution, CaseOrigin, ICaseInput, IPrecondition } from './contract.js';
import type { IRunInput } from './report.js';

/** Playwright JSON 리포터 중 이 어댑터가 쓰는 부분만. 버전 차이를 견디려고 전부 optional 이다. */
export interface IPwAttachment {
  name?: string;
  path?: string | null;
  contentType?: string;
}
export interface IPwResult {
  status?: string;
  attachments?: IPwAttachment[];
  error?: { message?: string } | null;
}
export interface IPwTest {
  status?: string;
  expectedStatus?: string;
  results?: IPwResult[];
  annotations?: Array<{ type?: string; description?: string }>;
}
export interface IPwSpec {
  title?: string;
  file?: string;
  ok?: boolean;
  tests?: IPwTest[];
}
export interface IPwSuite {
  title?: string;
  file?: string;
  specs?: IPwSpec[];
  suites?: IPwSuite[];
}
export interface IPwJsonReport {
  suites?: IPwSuite[];
  errors?: unknown[];
}

export interface IOriginEntry {
  origin: CaseOrigin;
  originRef?: string | null;
}

export interface IAdapterOptions {
  /**
   * TC id → 출처. ⛔ **여기 없는 TC 는 `unknown` 이 되고 검증 분모에서 빠진다.**
   * 출처를 모르는 TC 는 무엇을 검증하는지 모르는 TC 다.
   */
  origins?: Record<string, IOriginEntry>;
  /** TC id → 누구 탓. 어댑터는 알 수 없으므로 밖에서 받는다. 없으면 `unknown`. */
  attributionOf?: (id: string) => Attribution;
  /** 주행 전에 확인한 전제들 (브라우저 바이너리 · 세션 생존 등). 어댑터의 전제와 합쳐진다. */
  preconditions?: IPrecondition[];
}

const TC_ID = /\bTC-[A-Za-z0-9][A-Za-z0-9_-]*\b/;

/** 케이스 id — 제목의 `TC-…` 를 쓴다. 없으면 파일+제목으로 **유일하게** 만든다. */
export const caseIdOf = (spec: IPwSpec, suiteFile?: string): string => {
  const title = spec.title ?? '';
  const fromAnnotation = spec.tests
    ?.flatMap((t) => t.annotations ?? [])
    .find((a) => a.type === 'tc' || a.type === 'TC')?.description;
  const hit = TC_ID.exec(fromAnnotation ?? '') ?? TC_ID.exec(title);
  if (hit) return hit[0];
  return `${spec.file ?? suiteFile ?? '?'} › ${title || '(제목 없음)'}`;
};

const walk = (suites: IPwSuite[] | undefined, file: string | undefined, out: Array<{ spec: IPwSpec; file?: string }>): void => {
  for (const suite of suites ?? []) {
    const here = suite.file ?? file;
    for (const spec of suite.specs ?? []) out.push({ spec, file: here });
    walk(suite.suites, here, out);
  }
};

const screenshotOf = (test: IPwTest | undefined): string | null => {
  for (const r of test?.results ?? []) {
    for (const a of r.attachments ?? []) {
      if (a.name === 'screenshot' && a.path) return a.path;
    }
  }
  return null;
};

/**
 * Playwright 의 test.status 를 판정 3종으로 옮긴다.
 *
 * ⛔ `flaky` 는 **통과가 아니다.** 재시도에서 초록이 됐다는 것은 조건이 같은데 결과가
 * 갈렸다는 뜻이고, 그 관측은 아무것도 증명하지 못한다 → ⚪.
 */
export const statusOf = (
  pwStatus: string | undefined,
): { status: ICaseInput['status']; flaky: boolean; reason?: string } => {
  switch (pwStatus) {
    case 'expected':
      return { status: 'passed', flaky: false };
    case 'unexpected':
      return { status: 'failed', flaky: false };
    case 'flaky':
      return {
        status: 'unmeasured',
        flaky: true,
        reason: '재시도에서 결과가 갈렸다 — 같은 조건에서 갈리는 관측은 통과로 세지 않는다',
      };
    case 'skipped':
      return { status: 'unmeasured', flaky: false, reason: 'Playwright 가 건너뛰었다' };
    default:
      return {
        status: 'unmeasured',
        flaky: false,
        reason: `모르는 Playwright 상태다: ${String(pwStatus)}`,
      };
  }
};

/** Playwright JSON → `buildRunReport` 에 넣을 입력. */
export const fromPlaywrightJson = (
  report: IPwJsonReport,
  options: IAdapterOptions = {},
): IRunInput => {
  const found: Array<{ spec: IPwSpec; file?: string }> = [];
  walk(report.suites, undefined, found);

  const cases: ICaseInput[] = found.map(({ spec, file }) => {
    const id = caseIdOf(spec, file);
    const test = spec.tests?.[0];
    const mapped = statusOf(test?.status);
    const origin = options.origins?.[id];
    return {
      id,
      origin: origin?.origin ?? 'unknown',
      originRef: origin?.originRef ?? null,
      status: mapped.status,
      attribution: options.attributionOf?.(id) ?? 'unknown',
      evidence: {
        url: null,
        httpStatus: null,
        screenshot: screenshotOf(test),
      },
      verdict: null,
      ...(mapped.flaky ? { flaky: true } : {}),
      ...(mapped.reason ? { unmeasuredReason: mapped.reason } : {}),
    };
  });

  const runErrors = report.errors ?? [];
  const preconditions: IPrecondition[] = [
    ...(options.preconditions ?? []),
    {
      id: 'playwright-run-clean',
      ok: runErrors.length === 0,
      detail:
        runErrors.length === 0
          ? '주행 자체는 에러 없이 끝났다'
          : `주행이 ${runErrors.length}건의 에러를 냈다 — 케이스 결과는 제품 신호가 아니다`,
    },
    {
      id: 'tests-discovered',
      ok: cases.length > 0,
      detail:
        cases.length > 0
          ? `${cases.length}건을 찾았다`
          : '테스트 0개다 — 0개는 "위반 없음"이 아니라 **아무것도 안 본 것**이다',
    },
  ];

  return { preconditions, cases };
};
