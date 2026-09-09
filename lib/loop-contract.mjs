/**
 * 「이 은하는 끝났는가」의 **판정 계약** — 순수 함수다. 파일도 네트워크도 Playwright 도 모른다.
 *
 * ## 왜 여기 있는가 (2026-09-09)
 *
 * `observatory/loop-state.mjs` 가 이 판정을 **`qa/dist/run/cli.js` 에 spawn 으로 위임**하고
 * 있었다. 그 `qa/`(흡수한 TC 도구)는 화면과 함께 `feat/console-screens` 로 나갔고,
 * **배달된 적도 없다**(`package.json` 의 `files` 에 없다).
 * ⇒ 소비 저장소에서 `universe loop` 을 치면 ⚪ 도 아니고 **날 Node 스택**으로 죽었고,
 *   이 저장소에서 도는 것은 `qa/dist` 가 **gitignore 된 잔해**로 남아 있어서였다.
 *
 * ⛔ **행동만 보고 다시 쓰지 않았다.** `feat/console-screens` 의 `qa/src/run/{contract,report,
 * playwright}.ts` 를 옮긴 것이고, 경계 규칙은 옮기기 전에 잔해 `qa/dist` 에 **직접 물어서**
 * 확인했다(출처별 분모 · 판정 없는 fail · 귀속 없는 fail).
 *
 * ## 이 계약이 지키는 것
 *
 *   1. 전제를 먼저 본다 → 안 서면 케이스를 **전부 ⚪ 로 접는다.** 그 다음에 센다.
 *      ⛔ 순서를 바꾸면 세션이 죽은 주행이 「전부 fail」로 세어진다.
 *   2. **검증 분모**를 따로 낸다 — 출처가 `derived-from-code`·`unknown` 인 TC 는 빠진다.
 *      구현에서 나온 TC 는 구현이 하는 일을 적은 것이라 **정의상 통과**한다.
 *   3. 종료 조건은 **「fail 0」이 아니라 「판단하지 않은 fail 0」**이다.
 *      「fail 0」을 목표로 두면 가장 싼 해법이 **단언을 무르게 만드는 것**이 된다.
 *
 * 재는 법:
 *   node observatory/probe-loop.sh
 */

/** 검증으로 세지 않는 출처. 여기 있는 것은 통과해도 아무것도 증명하지 않는다. */
export const NON_VERIFYING_ORIGINS = ['derived-from-code', 'unknown'];

/**
 * `accepted` 사유의 최소 길이.
 * ⛔ **사유 없는 `accepted` 는 판단이 아니라 치운 것이다.** 「나중에」·「일단 OK」로는
 * 다음 사람이 왜 넘어갔는지 못 되짚는다.
 */
export const MIN_ACCEPTED_WHY = 30;
const PLACEHOLDER = /^(TBD|미정|미작성|N\/A|없음|나중에|일단|추후)$/i;

/**
 * 판단이 판단인지 본다.
 * ⛔ `accepted` 인데 사유가 짧으면 여기서 무르게 하는 것이고, 그러면
 * 「판단하지 않은 fail 0」이라는 종료 조건이 그대로 무의미해진다.
 */
export const validateVerdict = (verdict) => {
  if (verdict === null || verdict === undefined) {
    return { valid: false, reason: '판단하지 않았다 (verdict === null)' };
  }
  if (verdict.kind !== 'fixed' && verdict.kind !== 'test-wrong' && verdict.kind !== 'accepted') {
    return { valid: false, reason: `모르는 판단 종류다: ${String(verdict.kind)}` };
  }
  const why = (verdict.why ?? '').trim();
  if (verdict.kind !== 'accepted') {
    /* fixed · test-wrong 은 **행위가 증거**다. 그래도 빈 사유는 되짚을 수 없다. */
    if (why === '') {
      return { valid: false, reason: `${verdict.kind} 인데 사유가 비어 있다` };
    }
    return { valid: true };
  }
  if (PLACEHOLDER.test(why)) {
    return { valid: false, reason: `accepted 사유가 자리표시자다: "${why}"` };
  }
  if (why.length < MIN_ACCEPTED_WHY) {
    return {
      valid: false,
      reason: `accepted 인데 사유가 ${why.length}자다 (최소 ${MIN_ACCEPTED_WHY}자). `
        + '사유 없는 accepted 는 판단이 아니라 **치운 것**이다.',
    };
  }
  return { valid: true };
};

/**
 * 전제가 섰는가. **`true` 만 섰다.** `null`(확인 못 함)도 안 선 것으로 본다.
 * ⛔ 선언이 **0개면 못 잰 것이다.** 「전제를 안 적었다」가 「전제가 다 섰다」로 접히면
 * 아무것도 확인하지 않은 주행이 측정 가능으로 보인다.
 */
export const measurabilityOf = (preconditions) => {
  if (preconditions.length === 0) {
    return {
      measurable: false,
      because: ['전제가 0개 선언됐다 — 아무것도 확인하지 않은 주행은 잰 것이 아니다'],
    };
  }
  const because = preconditions
    .filter((p) => p.ok !== true)
    .map((p) => {
      const state = p.ok === false ? '안 섰다' : '확인 못 했다(null)';
      return `${p.id}: ${state}${p.detail ? ` — ${p.detail}` : ''}`;
    });
  return { measurable: because.length === 0, because };
};

const foldCase = (c, reason) => ({
  ...c,
  status: 'unmeasured',
  foldedFrom: c.status,
  unmeasuredReason: c.unmeasuredReason ?? reason,
  countsAsVerification: false,
});

const markCase = (c) => ({
  ...c,
  countsAsVerification: c.status !== 'unmeasured' && !NON_VERIFYING_ORIGINS.includes(c.origin),
});

const countStats = (cases) => ({
  total: cases.length,
  expected: cases.filter((c) => c.status === 'passed').length,
  unexpected: cases.filter((c) => c.status === 'failed').length,
  skipped: cases.filter((c) => c.status === 'unmeasured').length,
  flaky: cases.filter((c) => c.flaky === true).length,
});

const countVerification = (cases) => {
  const selfScoring = cases.filter(
    (c) => c.status !== 'unmeasured' && NON_VERIFYING_ORIGINS.includes(c.origin),
  );
  return {
    denominator: cases.filter((c) => c.countsAsVerification).length,
    excluded: {
      derivedFromCode: cases.filter((c) => c.origin === 'derived-from-code' && c.status !== 'unmeasured').length,
      unknownOrigin: cases.filter((c) => c.origin === 'unknown' && c.status !== 'unmeasured').length,
      unmeasured: cases.filter((c) => c.status === 'unmeasured').length,
    },
    selfScoringIds: selfScoring.map((c) => c.id),
  };
};

/** 입력을 계약 모양의 보고서로 만든다. **접는 것이 세는 것보다 먼저다.** */
export const buildRunReport = (input) => {
  const { measurable, because } = measurabilityOf(input.preconditions ?? []);
  const reason = `전제가 서지 않았다 (${because.join(' · ')}) — 이 주행의 결과는 제품 신호가 아니다`;
  const cases = measurable
    ? (input.cases ?? []).map(markCase)
    : (input.cases ?? []).map((c) => foldCase(c, reason));
  return {
    tool: 'tc-run',
    ran: true,
    preconditions: input.preconditions ?? [],
    measurable,
    unmeasurableBecause: because,
    stats: countStats(cases),
    verification: countVerification(cases),
    cases,
  };
};

/**
 * 끝났는가.
 * ⛔ **「fail 0」을 종료 조건으로 두지 않는다.** fail 이 100건이어도 100건 다
 * `fixed`/`test-wrong`/사유 붙은 `accepted` 면 끝난 것이고, fail 1건이 판단 없이 남아 있으면
 * 안 끝난 것이다.
 */
export const evaluateDone = (report) => {
  const unattributed = report.cases
    .filter((c) => c.status === 'failed' && c.attribution === 'unknown')
    .map((c) => c.id);

  if (!report.measurable) {
    return {
      done: false,
      exitCode: 3,
      unjudged: [],
      unattributed,
      reason: `못 쟀다 — 전제가 서지 않았다: ${report.unmeasurableBecause.join(' · ')}. `
        + '이 주행의 케이스는 전부 ⚪ 다. ❌ 로 세면 제품 결함이 아닌 것을 고치려 든다.',
    };
  }

  if (report.verification.denominator === 0) {
    /**
     * ⚠️ **원본의 사유 문구를 고쳤다.** 원본은 여기서 늘 「전부 구현에서 나온 TC 다」라고
     * 말했는데, 실제로 이 자리에 오는 흔한 경우는 **출처를 아예 모르는 것**이다
     * (생 Playwright 리포트는 전부 `unknown` 이다 — 실측으로 확인했다).
     * ⛔ 원인을 잘못 짚는 처방은 사람을 헛짓으로 보낸다. 그래서 **무엇이 뺐는지 수로 말한다.**
     */
    const ex = report.verification.excluded;
    return {
      done: false,
      exitCode: 3,
      unjudged: [],
      unattributed,
      reason: '못 쟀다 — 검증 분모가 0이다. '
        + `잰 케이스 ${report.stats.total}건 중 출처를 모르는 것 ${ex.unknownOrigin}건 · `
        + `구현에서 나온 것 ${ex.derivedFromCode}건 · 못 잰 것 ${ex.unmeasured}건이라 `
        + '검증으로 셀 것이 남지 않았다'
        + (report.verification.selfScoringIds.length > 0
          ? ` (자기 채점: ${report.verification.selfScoringIds.join(' · ')})`
          : '')
        + '. 분모 없는 수는 뜻이 없다.',
    };
  }

  const unjudged = [];
  for (const c of report.cases) {
    if (c.status !== 'failed') {
      continue;
    }
    const check = validateVerdict(c.verdict);
    if (!check.valid) {
      unjudged.push({ id: c.id, attribution: c.attribution, reason: check.reason ?? '판단 없음' });
    }
  }

  if (unjudged.length > 0) {
    return {
      done: false,
      exitCode: 1,
      unjudged,
      unattributed,
      reason: `판단하지 않은 fail ${unjudged.length}건 / 검증 ${report.verification.denominator}건. `
        + '⛔ 「끝났다」고 말하지 않는다.',
    };
  }

  return {
    done: true,
    exitCode: 0,
    unjudged: [],
    unattributed,
    reason: `판단하지 않은 fail 0건 / 검증 ${report.verification.denominator}건 `
      + `(fail ${report.stats.unexpected}건은 전부 판단이 붙었다). `
      + '⛔ 「fail 0」이라서가 아니다.',
  };
};

/* ── Playwright JSON 어댑터 ─────────────────────────────────────────────
   ⛔ Playwright 를 **돌리지 않는다.** 이미 나온 JSON 객체를 받아 옮길 뿐이고,
   `@playwright/test` 를 import 하지 않는다 — 구조만 본다. */

const TC_ID = /\bTC-[A-Za-z0-9][A-Za-z0-9_-]*\b/;

/** 케이스 id — 제목의 `TC-…` 를 쓴다. 없으면 파일+제목으로 **유일하게** 만든다. */
export const caseIdOf = (spec, suiteFile) => {
  const title = spec.title ?? '';
  const fromAnnotation = spec.tests
    ?.flatMap((t) => t.annotations ?? [])
    .find((a) => a.type === 'tc' || a.type === 'TC')?.description;
  const hit = TC_ID.exec(fromAnnotation ?? '') ?? TC_ID.exec(title);
  if (hit) {
    return hit[0];
  }
  return `${spec.file ?? suiteFile ?? '?'} › ${title || '(제목 없음)'}`;
};

const walk = (suites, file, out) => {
  for (const suite of suites ?? []) {
    const here = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      out.push({ spec, file: here });
    }
    walk(suite.suites, here, out);
  }
};

const screenshotOf = (test) => {
  for (const r of test?.results ?? []) {
    for (const a of r.attachments ?? []) {
      if (a.name === 'screenshot' && a.path) {
        return a.path;
      }
    }
  }
  return null;
};

/**
 * Playwright 의 test.status 를 판정 3종으로 옮긴다.
 * ⛔ `flaky` 는 **통과가 아니다.** 재시도에서 초록이 됐다는 것은 조건이 같은데 결과가
 * 갈렸다는 뜻이고, 그 관측은 아무것도 증명하지 못한다 → ⚪.
 */
export const statusOf = (pwStatus) => {
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
      return { status: 'unmeasured', flaky: false, reason: `모르는 Playwright 상태다: ${String(pwStatus)}` };
  }
};

/** Playwright JSON → `buildRunReport` 에 넣을 입력. */
export const fromPlaywrightJson = (report, options = {}) => {
  const found = [];
  walk(report.suites, undefined, found);

  const cases = found.map(({ spec, file }) => {
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
      evidence: { url: null, httpStatus: null, screenshot: screenshotOf(test) },
      verdict: null,
      ...(mapped.flaky ? { flaky: true } : {}),
      ...(mapped.reason ? { unmeasuredReason: mapped.reason } : {}),
    };
  });

  const runErrors = report.errors ?? [];
  const preconditions = [
    ...(options.preconditions ?? []),
    {
      id: 'playwright-run-clean',
      ok: runErrors.length === 0,
      detail: runErrors.length === 0
        ? '주행 자체는 에러 없이 끝났다'
        : `주행이 ${runErrors.length}건의 에러를 냈다 — 케이스 결과는 제품 신호가 아니다`,
    },
    {
      id: 'tests-discovered',
      ok: cases.length > 0,
      detail: cases.length > 0
        ? `${cases.length}건을 찾았다`
        : '테스트 0개다 — 0개는 "위반 없음"이 아니라 **아무것도 안 본 것**이다',
    },
  ];

  return { preconditions, cases };
};

/** 한 자리 입구 — 주행 파일 하나를 받아 `{stats, cases, done}` 을 낸다. */
export const judgeRun = (raw, options = {}) => {
  const isPlaywright = Boolean(raw && typeof raw === 'object' && Array.isArray(raw.suites) && raw.config);
  const input = isPlaywright ? fromPlaywrightJson(raw, options) : raw;
  const report = buildRunReport(input);
  return { ...report, isPlaywright, done: evaluateDone(report) };
};
