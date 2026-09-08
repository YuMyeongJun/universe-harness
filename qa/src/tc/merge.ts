/**
 * **양식(사람) + 주행(기계) 을 한 입력으로 합친다.** 순수 함수다.
 *
 * ## 누가 무엇을 아는가 — 이 경계가 이 파일의 전부다
 *
 *   기계(Playwright)만 아는 것 : `status` · `flaky` · `evidence` · 왜 ⚪ 인지
 *   사람(양식)만 아는 것       : `origin` · `originRef` · `attribution` · `verdict`
 *
 * ⛔ 섞으면 둘 다 잃는다. 기계가 `origin` 을 지어내면 **검증 분모가 거짓으로 늘고**,
 * 사람이 `status` 를 덮으면 **주행 결과가 사라진다.**
 *
 * ## ⛔ 안 맞는 짝을 조용히 버리지 않는다
 *
 *   · 양식에 있는데 주행에 없다 → ⚪ 로 둔다(통과도 실패도 아니다) **그리고 이름을 부른다.**
 *     ⚠️ 이것이 가장 위험한 자리다: TC 를 적어 놓고 spec 을 안 만들었는데 화면은 조용하다.
 *   · 주행에 있는데 양식에 없다 → 계약이 이미 `unknown` 으로 받아 **분모에서 뺀다.** 이름을 부른다.
 *   · 둘 다 있는데 **status 가 다르다** → 기계를 쓴다. ⛔ 그리고 **갈렸다고 말한다** —
 *     사람이 적어 온 결과를 말없이 덮으면 다음 사람은 자기가 적은 것이 반영된 줄 안다.
 */
import type { ICaseInput, IPrecondition } from '../run/contract.js';
import type { IRunInput } from '../run/report.js';

export interface IDisagreement {
  id: string;
  form: ICaseInput['status'];
  run: ICaseInput['status'];
}

export interface IMergeResult {
  input: IRunInput;
  /** 양식에는 있는데 주행이 안 돈 id — **spec 이 없는 TC 다.** */
  notRun: string[];
  /** 주행에는 있는데 양식이 모르는 id — 출처를 모르므로 계약이 분모에서 뺀다. */
  notInForm: string[];
  disagreed: IDisagreement[];
}

export interface IFormSide {
  cases: ICaseInput[];
  preconditions: IPrecondition[];
}

const NOT_RUN_REASON =
  '양식에는 있는데 **주행에서 이 id 를 못 찾았다** — 통과로도 실패로도 세지 않는다. ' +
  'spec 을 안 만들었거나 제목의 TC 번호가 다르다.';

/**
 * @param run 주행이 없으면 `null` — 그때는 양식에 적힌 결과가 그대로 결과다
 *            (사람이 손으로 돌리고 적어 온 경우).
 */
export const mergeFormWithRun = (form: IFormSide, run: IRunInput | null): IMergeResult => {
  if (run === null) {
    return {
      input: { preconditions: form.preconditions, cases: form.cases },
      notRun: [],
      notInForm: [],
      disagreed: [],
    };
  }

  const byId = new Map(run.cases.map((c) => [c.id, c]));
  const used = new Set<string>();
  const disagreed: IDisagreement[] = [];
  const notRun: string[] = [];

  const merged: ICaseInput[] = form.cases.map((mine) => {
    const machine = byId.get(mine.id);
    if (machine === undefined) {
      notRun.push(mine.id);
      return {
        ...mine,
        status: 'unmeasured',
        unmeasuredReason: NOT_RUN_REASON,
      };
    }
    used.add(mine.id);
    if (machine.status !== mine.status) {
      disagreed.push({ id: mine.id, form: mine.status, run: machine.status });
    }
    return {
      // 사람이 아는 것
      id: mine.id,
      origin: mine.origin,
      originRef: mine.originRef ?? null,
      attribution: mine.attribution,
      verdict: mine.verdict,
      // 기계가 아는 것
      status: machine.status,
      evidence: machine.evidence ?? mine.evidence,
      ...(machine.flaky === true ? { flaky: true } : {}),
      ...(machine.unmeasuredReason !== undefined
        ? { unmeasuredReason: machine.unmeasuredReason }
        : mine.unmeasuredReason !== undefined
          ? { unmeasuredReason: mine.unmeasuredReason }
          : {}),
    };
  });

  const notInForm = run.cases.filter((c) => !used.has(c.id)).map((c) => c.id);
  const orphans = run.cases.filter((c) => !used.has(c.id));

  return {
    input: {
      // 양식의 전제가 먼저, 주행이 세운 전제(브라우저·발견된 테스트 수)가 뒤.
      preconditions: [...form.preconditions, ...run.preconditions],
      cases: [...merged, ...orphans],
    },
    notRun,
    notInForm,
    disagreed,
  };
};
