import type { IRunCase, IRunPayload } from '@api/types';
import { bucketOf, disagreements, type CaseBucket } from '@lib/run-judge';

import { DoneVerdict } from '@components/data-display/DoneVerdict';
import { PreconditionList } from '@components/data-display/PreconditionList';
import { RunCaseRow } from '@components/data-display/RunCaseRow';
import { RunTally } from '@components/data-display/RunTally';

/**
 * 주행 하나를 통째로 그린다 — **판단하지 않은 것부터.**
 *
 * ⛔⛔ 무더기를 나눈 순서가 이 화면의 주장이다:
 *   1. **판단하지 않은 fail** — 이 루프의 종료 조건. 0이 될 때까지 안 끝난다.
 *   2. 판단이 붙은 fail — fail 이지만 **끝난 것**이다(고쳤다/테스트가 틀렸다/받아들인다).
 *   3. ⚪ 못 잰 것 — 실패가 **아니다.** 전제가 안 서면 여기로 통째로 온다.
 *   4. ⛔ 자기 채점 — 구현에서 뽑은 TC. 통과해도 **아무것도 검증하지 않는다.**
 *   5. ✅ 검증된 통과 — 여기 있는 것만 「쟀고 통과했다」다.
 *
 * ⛔ 어떤 무더기도 화면에서 **숨기지 않는다.** 0건이면 「0건이 무슨 뜻인지」를 적는다 —
 * 빈 자리는 늘 초록으로 읽힌다.
 *
 * ⛔ **「무시하고 계속」·「전부 통과 처리」 버튼은 없다.** 넘길 수 있는 관문은 넘겨진다.
 */
const SECTION_HEAD = 'mb-3.5 mt-8.5 text-label font-semibold uppercase tracking-eyebrow text-ui-ink-faint';
const CARD = 'rounded-card border border-ui-line bg-ui-surface p-4';
const EMPTY_NOTE = 'text-meta text-ui-ink-dim';

interface ISection {
  bucket: CaseBucket;
  title: string;
  /** 0건일 때 **그 0이 무슨 뜻인지.** ⛔ 빈칸으로 두면 초록으로 읽힌다. */
  whenNone: string;
}

const SECTIONS: ISection[] = [
  {
    bucket: 'unjudged',
    title: '⛔ 아직 판단하지 않은 fail — 이것이 0이 될 때까지 안 끝난다',
    whenNone:
      '판단하지 않은 fail 이 0건이다. ⛔ 그렇다고 「fail 0」이라는 뜻이 아니다 — 아래 「판단이 붙은 fail」을 보라.',
  },
  {
    bucket: 'judged-fail',
    title: '판단이 붙은 fail — 고쳤다 · 테스트가 틀렸다 · 받아들인다',
    whenNone: 'fail 에 붙은 판단이 0건이다. 위에 판단 안 된 fail 이 남아 있다면 그것부터다.',
  },
  {
    bucket: 'unmeasured',
    title: '⚪ 못 잰 것 — 실패가 아니다',
    whenNone: '⚪ 로 접힌 케이스가 없다. 전제가 다 섰다는 뜻이지, 통과했다는 뜻이 아니다.',
  },
  {
    bucket: 'self-scoring',
    title: '⛔ 자기 채점 — 구현에서 뽑은 TC. 검증으로 세지 않는다',
    whenNone: '구현에서 뽑은 TC 가 없다. 이 주행의 통과는 전부 검증 분모 안에서 났다.',
  },
  {
    bucket: 'verified-pass',
    title: '✅ 검증된 통과 — 여기 있는 것만 「재서 통과했다」다',
    whenNone: '⛔ 검증 분모 안에서 통과한 케이스가 0건이다. 이 주행은 아무것도 증명하지 않았다.',
  },
];

export interface IRunReportViewProps {
  payload: IRunPayload;
}

export function RunReportView({ payload }: IRunReportViewProps) {
  const conflicts = disagreements(payload);
  /* ⛔ 이유는 **도구의 문장 그대로** 옮긴다 — 화면이 다시 쓰면 어느 쪽이 사실인지 모르게 된다. */
  const reasons = new Map(payload.done.unjudged.map((one) => [one.id, one.reason]));
  const unjudgedIds = new Set(reasons.keys());

  const pick = (bucket: CaseBucket): IRunCase[] =>
    payload.cases.filter((one) => bucketOf(one, payload.measurable, unjudgedIds) === bucket);

  return (
    <div>
      <DoneVerdict payload={payload} conflicts={conflicts} />
      <RunTally payload={payload} />
      <PreconditionList
        preconditions={payload.preconditions}
        measurable={payload.measurable}
        because={payload.unmeasurableBecause}
      />

      {SECTIONS.map((section) => {
        const cases = pick(section.bucket);
        return (
          <div key={section.bucket}>
            <h2 className={SECTION_HEAD}>
              {section.title} — 전체 {payload.stats.total}건 중 {cases.length}건
            </h2>
            <div className={CARD}>
              {cases.length === 0 ? (
                <p className={EMPTY_NOTE}>{section.whenNone}</p>
              ) : (
                cases.map((one) => (
                  <RunCaseRow
                    key={one.id}
                    runCase={one}
                    measurable={payload.measurable}
                    unjudgedReason={reasons.get(one.id) ?? null}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
