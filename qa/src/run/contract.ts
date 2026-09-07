/**
 * 주행 결과 계약 — **Playwright 가 뱉은 것을 우주가 받을 수 있는 모양으로 바꾼다.**
 *
 * ⛔ 이 파일이 지키는 것은 넷이다. 넷 다 "초록으로 보이는 자리"를 막는다.
 *
 * 1. **`preconditions` 가 `cases` 보다 먼저다.** 전제가 하나라도 안 서면 그 주행의 결과는
 *    ⚪ 다 — ❌ 가 아니다. 실측(다른 팀): 로그인 세션 수명이 1시간이라 루프 중간에 죽고,
 *    그때 화면은 로그인 페이지를 재고 **「전부 fail」** 을 뱉었다. 제품 결함이 아닌데도.
 * 2. **`origin: 'derived-from-code'` 는 검증으로 세지 않는다.** TC 가 구현에서 나오면
 *    그 TC 는 구현이 하는 일을 적은 것이라 **정의상 통과**한다. 아무것도 검증하지 않는다.
 *    (같은 규율의 다른 자리: `bigbang/bigbang.mjs` — 「처음부터 통과하는 계약은 거부한다」)
 * 3. **`attribution`** — 별 탓/은하 탓/환경 탓을 안 가르면 자동 수정이 **못 고치는 것을
 *    고치려 든다.**
 * 4. **종료 조건은 「fail 0」이 아니라 「판단하지 않은 fail 0」이다.** fail 0 을 목표로 두면
 *    가장 싼 해법이 **단언을 무르게 하는 것**이 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이다.
 */

/**
 * TC 가 어디서 나왔는가.
 *
 * ⛔ `derived-from-code` 는 **검증이 아니다.** 구현을 읽고 쓴 TC 는 구현이 하는 일을
 * 그대로 적은 것이라 화면 테스트를 아무리 돌려도 통과만 한다 — 자기 채점이다.
 *
 * ⚠️ `unknown` 은 계약을 넓힌 자리다. 출처를 못 밝힌 TC 를 만났을 때 남은 길은 셋뿐이었다:
 * (a) `derived-from-code` 로 적는다 = **거짓말**, (b) 케이스에서 뺀다 = **분모를 잃는다**,
 * (c) 죽는다 = 한 건 때문에 주행 전체를 버린다. 셋 다 나쁘다. 그래서 `unknown` 을 두고
 * `derived-from-code` 와 **같은 취급**을 한다 — 검증 분모에서 빠진다.
 */
export type CaseOrigin = 'policy' | 'human' | 'derived-from-code' | 'unknown';

/** 검증으로 세지 않는 출처. 여기 있는 것은 통과해도 아무것도 증명하지 않는다. */
export const NON_VERIFYING_ORIGINS: readonly CaseOrigin[] = ['derived-from-code', 'unknown'];

/** ⚪ 를 별도 상태로 두는 이유: 2상태면 **못 잰 것이 통과로 세어진다.** */
export type CaseStatus = 'passed' | 'failed' | 'unmeasured';

/** 누구 탓인가. 이걸 안 가르면 자동 수정이 환경 탓을 코드에서 고치려 든다. */
export type Attribution = 'star' | 'galaxy' | 'environment' | 'unknown';

/** 판단의 종류. `accepted` 만 사유 길이를 요구한다 — 나머지는 행위가 증거다. */
export type VerdictKind = 'fixed' | 'test-wrong' | 'accepted';

/**
 * `accepted` 사유의 최소 길이.
 *
 * ⛔ **사유 없는 `accepted` 는 판단이 아니라 치운 것이다.** 「나중에」·「일단 OK」로는
 * 다음 사람이 왜 넘어갔는지 못 되짚는다. 이 저장소가 다른 자리에서 요구하는 것과 같은 30자.
 */
export const MIN_ACCEPTED_WHY = 30;

export interface IPrecondition {
  id: string;
  /** `true` 만 「섰다」다. `false` 는 안 섰다, `null` 은 **확인 못 했다** — 둘 다 ⚪ 로 접는다. */
  ok: boolean | null;
  detail?: string;
}

export interface IEvidence {
  url?: string | null;
  httpStatus?: number | null;
  screenshot?: string | null;
}

export interface IVerdict {
  kind: VerdictKind;
  why: string;
}

/** 입력 케이스 — 어댑터/사람이 채워 넣는 모양. `status` 접힘은 아직 안 일어났다. */
export interface ICaseInput {
  id: string;
  origin: CaseOrigin;
  originRef?: string | null;
  status: CaseStatus;
  attribution: Attribution;
  evidence?: IEvidence;
  /** `null` 이면 **판단하지 않음.** 「빈 객체」와 구별한다. */
  verdict: IVerdict | null;
  /** 같은 케이스가 재시도에서 갈렸다 — 통과로도 실패로도 세지 않는 축이다. */
  flaky?: boolean;
  /** 이미 ⚪ 인 케이스가 왜 ⚪ 인가. */
  unmeasuredReason?: string;
}

/** 계산이 끝난 케이스 — 접힘·검증 여부가 박혀 있다. */
export interface ICase extends ICaseInput {
  /** 이 케이스가 **검증 분모에 드는가.** 출처가 구현이거나 못 쟀으면 안 든다. */
  countsAsVerification: boolean;
  /** 전제가 안 서서 접힌 케이스인가. 원래 상태를 잃지 않으려고 따로 적는다. */
  foldedFrom?: CaseStatus;
}

/** Playwright 어휘를 그대로 쓴다 — 옮겨 적으면서 뜻이 바뀌는 것을 막는다. */
export interface IStats {
  total: number;
  expected: number;
  unexpected: number;
  skipped: number;
  flaky: number;
}

export interface IVerification {
  /** ⛔ **분모.** 이 수가 0이면 그 주행은 아무것도 검증하지 않았다. */
  denominator: number;
  /** 분모에서 뺀 것들 — 왜 뺐는지 나눠서 적는다. 합쳐 두면 「0건」의 뜻을 잃는다. */
  excluded: {
    derivedFromCode: number;
    unknownOrigin: number;
    unmeasured: number;
  };
  /** 자기 채점 케이스의 id — 이름을 불러야 지워진다. */
  selfScoringIds: string[];
}

export interface IRunReport {
  tool: 'tc-run';
  ran: true;
  preconditions: IPrecondition[];
  /** 전제가 **하나라도** 안 서면 `false`. 선언이 0개여도 `false` 다. */
  measurable: boolean;
  /** 왜 못 재는가. 빈 배열이면 잴 수 있다. */
  unmeasurableBecause: string[];
  stats: IStats;
  verification: IVerification;
  cases: ICase[];
}

/** 판단 검증 결과. `valid: false` 면 **판단하지 않은 것으로 센다.** */
export interface IVerdictCheck {
  valid: boolean;
  reason?: string;
}

const PLACEHOLDER = /^(TBD|미정|미작성|N\/A|없음|나중에|일단|추후)$/i;

/**
 * 판단이 판단인지 본다.
 *
 * ⛔ `accepted` 인데 사유가 짧으면 **판단이 아니라 치운 것이다.** 여기서 무르게 하면
 * 「판단하지 않은 fail 0」이라는 종료 조건이 그대로 무의미해진다.
 */
export const validateVerdict = (verdict: IVerdict | null | undefined): IVerdictCheck => {
  if (verdict === null || verdict === undefined) {
    return { valid: false, reason: '판단하지 않았다 (verdict === null)' };
  }
  if (verdict.kind !== 'fixed' && verdict.kind !== 'test-wrong' && verdict.kind !== 'accepted') {
    return { valid: false, reason: `모르는 판단 종류다: ${String((verdict as IVerdict).kind)}` };
  }
  const why = (verdict.why ?? '').trim();
  if (verdict.kind !== 'accepted') {
    // fixed · test-wrong 은 **행위가 증거**다. 그래도 빈 사유는 되짚을 수 없다.
    if (why === '') return { valid: false, reason: `${verdict.kind} 인데 사유가 비어 있다` };
    return { valid: true };
  }
  if (PLACEHOLDER.test(why)) {
    return { valid: false, reason: `accepted 사유가 자리표시자다: "${why}"` };
  }
  if (why.length < MIN_ACCEPTED_WHY) {
    return {
      valid: false,
      reason:
        `accepted 인데 사유가 ${why.length}자다 (최소 ${MIN_ACCEPTED_WHY}자). ` +
        '사유 없는 accepted 는 판단이 아니라 **치운 것**이다.',
    };
  }
  return { valid: true };
};
