/**
 * 주행 결과를 **접고 세는** 자리. 순수 함수다 — 파일도 네트워크도 Playwright 도 모른다.
 *
 * 순서가 중요하다:
 *   1. 전제를 본다 → 안 서면 케이스를 **전부 ⚪ 로 접는다**
 *   2. 그 다음에 센다 → 접힌 뒤의 상태로 센다
 *   3. 검증 분모를 따로 낸다 → 구현에서 나온 TC 는 빠진다
 *   4. 종료 조건을 본다 → **「fail 0」이 아니라 「판단하지 않은 fail 0」**
 *
 * ⛔ 1번을 2번 뒤로 옮기면 세션이 죽은 주행이 「전부 fail」로 세어진다. 이 순서가 계약이다.
 */
import {
  NON_VERIFYING_ORIGINS,
  validateVerdict,
  type ICase,
  type ICaseInput,
  type IPrecondition,
  type IRunReport,
  type IStats,
  type IVerification,
} from './contract.js';

export interface IRunInput {
  preconditions: IPrecondition[];
  cases: ICaseInput[];
}

/**
 * 전제가 섰는가. **`true` 만 섰다.** `null`(확인 못 함)도 안 선 것으로 본다.
 *
 * ⛔ 선언이 **0개면 못 잰 것이다.** 「전제를 안 적었다」가 「전제가 다 섰다」로 접히면
 * 아무것도 확인하지 않은 주행이 측정 가능으로 보인다 — 이 저장소가 파일 0개를 훑고
 * 「0건」을 기준선으로 심었던 바로 그 형태다.
 */
export const measurabilityOf = (
  preconditions: IPrecondition[],
): { measurable: boolean; because: string[] } => {
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

const foldCase = (c: ICaseInput, reason: string): ICase => ({
  ...c,
  status: 'unmeasured',
  foldedFrom: c.status,
  unmeasuredReason: c.unmeasuredReason ?? reason,
  countsAsVerification: false,
});

const markCase = (c: ICaseInput): ICase => ({
  ...c,
  countsAsVerification:
    c.status !== 'unmeasured' && !NON_VERIFYING_ORIGINS.includes(c.origin),
});

const countStats = (cases: ICase[]): IStats => ({
  total: cases.length,
  expected: cases.filter((c) => c.status === 'passed').length,
  unexpected: cases.filter((c) => c.status === 'failed').length,
  skipped: cases.filter((c) => c.status === 'unmeasured').length,
  flaky: cases.filter((c) => c.flaky === true).length,
});

const countVerification = (cases: ICase[]): IVerification => {
  const selfScoring = cases.filter(
    (c) => c.status !== 'unmeasured' && NON_VERIFYING_ORIGINS.includes(c.origin),
  );
  return {
    denominator: cases.filter((c) => c.countsAsVerification).length,
    excluded: {
      derivedFromCode: cases.filter(
        (c) => c.origin === 'derived-from-code' && c.status !== 'unmeasured',
      ).length,
      unknownOrigin: cases.filter((c) => c.origin === 'unknown' && c.status !== 'unmeasured')
        .length,
      unmeasured: cases.filter((c) => c.status === 'unmeasured').length,
    },
    selfScoringIds: selfScoring.map((c) => c.id),
  };
};

/** 입력을 계약 모양의 보고서로 만든다. **접는 것이 세는 것보다 먼저다.** */
export const buildRunReport = (input: IRunInput): IRunReport => {
  const { measurable, because } = measurabilityOf(input.preconditions);
  const reason = `전제가 서지 않았다 (${because.join(' · ')}) — 이 주행의 결과는 제품 신호가 아니다`;
  const cases = measurable
    ? input.cases.map(markCase)
    : input.cases.map((c) => foldCase(c, reason));

  return {
    tool: 'tc-run',
    ran: true,
    preconditions: input.preconditions,
    measurable,
    unmeasurableBecause: because,
    stats: countStats(cases),
    verification: countVerification(cases),
    cases,
  };
};

/** 판단이 필요한데 안 한 케이스 하나. */
export interface IUnjudged {
  id: string;
  attribution: ICase['attribution'];
  reason: string;
}

export interface IDoneResult {
  /** ⛔ **「fail 0」이 아니다.** 판단하지 않은 fail 이 0건일 때만 `true`. */
  done: boolean;
  /** `0` 끝났다 / `1` 판단하지 않은 fail 이 있다 / `3` **못 쟀다** */
  exitCode: 0 | 1 | 3;
  unjudged: IUnjudged[];
  /** 실패는 아니지만 자동 수정이 못 다루는 것 — 이름을 부른다. */
  unattributed: string[];
  reason: string;
}

/**
 * 끝났는가.
 *
 * ⛔ **「fail 0」을 종료 조건으로 두지 않는다.** 그렇게 두면 가장 싼 해법이
 * **단언을 무르게 하는 것**이 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이 된다.
 * 그래서 조건은 **「판단하지 않은 fail 0」** 이다. fail 이 100건이어도 100건 다
 * `fixed`/`test-wrong`/사유 붙은 `accepted` 면 끝난 것이고, fail 1건이 판단 없이 남아 있으면
 * 안 끝난 것이다.
 */
export const evaluateDone = (report: IRunReport): IDoneResult => {
  const unattributed = report.cases
    .filter((c) => c.status === 'failed' && c.attribution === 'unknown')
    .map((c) => c.id);

  if (!report.measurable) {
    return {
      done: false,
      exitCode: 3,
      unjudged: [],
      unattributed,
      reason:
        `못 쟀다 — 전제가 서지 않았다: ${report.unmeasurableBecause.join(' · ')}. ` +
        '이 주행의 케이스는 전부 ⚪ 다. ❌ 로 세면 제품 결함이 아닌 것을 고치려 든다.',
    };
  }

  if (report.verification.denominator === 0) {
    return {
      done: false,
      exitCode: 3,
      unjudged: [],
      unattributed,
      reason:
        '못 쟀다 — 검증 분모가 0이다. 잰 케이스가 없거나 전부 구현에서 나온 TC 다' +
        (report.verification.selfScoringIds.length > 0
          ? ` (자기 채점: ${report.verification.selfScoringIds.join(' · ')})`
          : '') +
        '. 분모 없는 수는 뜻이 없다.',
    };
  }

  const unjudged: IUnjudged[] = [];
  for (const c of report.cases) {
    if (c.status !== 'failed') continue;
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
      reason:
        `판단하지 않은 fail ${unjudged.length}건 / 검증 ${report.verification.denominator}건. ` +
        '⛔ 「끝났다」고 말하지 않는다.',
    };
  }

  return {
    done: true,
    exitCode: 0,
    unjudged: [],
    unattributed,
    reason:
      `판단하지 않은 fail 0건 / 검증 ${report.verification.denominator}건 ` +
      `(fail ${report.stats.unexpected}건은 전부 판단이 붙었다). ` +
      '⛔ 「fail 0」이라서가 아니다.',
  };
};
